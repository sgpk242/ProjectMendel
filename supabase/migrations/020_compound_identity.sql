-- Mendel — compound identity: molecule class, aliases, production routes
--
-- 1. Molecule class. Small molecules are best described by PubChem; proteins,
--    enzymes and brand-name ingredients usually aren't in PubChem and often
--    have no Wikipedia page, so a Wikipedia search on a brand name ("Sweelin")
--    returned an unrelated article (the composer Sweelinck). Each compound
--    gets a class that decides where its description comes from.
--    null = not classified yet; a manual choice is never overwritten.
--
-- 2. Description cache. wikipedia_extract / wikipedia_url become reference_*
--    with reference_source saying where the text came from (pubchem,
--    wikipedia, or the source's own description). Existing cached text is
--    kept; a wrong one is replaced with the Refresh button on the product page.
--
-- 3. Aliases. Brand names and abbreviations the model extracted were never
--    stored, and new mentions matched only on PubChem CID or the row's name,
--    so a later source that said only "Sweelin" created a separate product.
--    product_aliases holds every name a compound goes by; an alias belongs to
--    exactly one of a user's products and new mentions match against all of
--    them. source_product_ideas.names_used records which names each source
--    used, so the automatic page header can be the generic name the most
--    sources use (recomputed, so re-extracting a source can't inflate it);
--    product_name_pinned marks a header chosen by hand.
--
-- 4. Production route. How a compound is made (plant extraction, precision
--    fermentation, chemical synthesis…) is per source: different producers
--    make the same compound different ways. Stored on the source–compound
--    link with the page the claim came from, which may be a page linked
--    from the article or found by search (sources.production_status tracks
--    that stage).

-- ------------------------------------------------------------ enums ---

create type molecule_class as enum (
  'small_molecule',
  'oligosaccharide',
  'peptide',
  'protein',
  'enzyme',
  'nucleic_acid',
  'polysaccharide',
  'lipid',
  'polymer',
  'biomass',
  'mixture',
  'other'
);

create type production_method as enum (
  'natural_extraction',
  'precision_fermentation',
  'biomass_fermentation',
  'traditional_fermentation',
  'enzymatic_conversion',
  'chemical_synthesis',
  'cell_culture',
  'plant_molecular_farming',
  'other'
);

create type alias_kind as enum ('name', 'brand', 'abbreviation', 'pubchem');

-- ---------------------------------------------------- product_ideas ---

alter table product_ideas rename column wikipedia_extract to reference_extract;
alter table product_ideas rename column wikipedia_url to reference_url;

alter table product_ideas
  add column reference_source    text,
  add column molecule_class      molecule_class,
  add column product_name_pinned boolean not null default false;

update product_ideas
set reference_source = 'wikipedia'
where reference_extract is not null and reference_extract <> '';

-- -------------------------------------------------- product_aliases ---

create table product_aliases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  product_idea_id  uuid not null references product_ideas on delete cascade,
  alias            text not null,
  alias_normalized text not null,
  kind             alias_kind not null,
  first_source_id  uuid references sources on delete set null,
  created_at       timestamptz not null default now()
);

create unique index product_aliases_user_alias_key
  on product_aliases (user_id, alias_normalized);
create index product_aliases_product_idea_id_idx
  on product_aliases (product_idea_id);

alter table product_aliases enable row level security;

create policy "product_aliases: owner can select" on product_aliases
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "product_aliases: owner can insert" on product_aliases
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from product_ideas p
                where p.id = product_idea_id and p.user_id = (select auth.uid()))
  );

create policy "product_aliases: owner can update" on product_aliases
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from product_ideas p
                where p.id = product_idea_id and p.user_id = (select auth.uid()))
  );

create policy "product_aliases: owner can delete" on product_aliases
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Same normalization as normalizeName() in src/lib/pubchem.ts.
create function normalize_alias(value text) returns text
language sql immutable
as $$
  select lower(btrim(regexp_replace(
    translate(normalize(value, NFKC), '‘’ʼ′', ''''''''''),
    '\s+', ' ', 'g')))
$$;

-- Backfill: each product's name, then PubChem title, then PubChem synonyms.
-- Where two products share a synonym, the first one keeps it.
insert into product_aliases (user_id, product_idea_id, alias, alias_normalized, kind)
select user_id, id, name, normalize_alias(name), 'name'
from product_ideas
on conflict (user_id, alias_normalized) do nothing;

insert into product_aliases (user_id, product_idea_id, alias, alias_normalized, kind)
select user_id, id, canonical_name, normalize_alias(canonical_name), 'pubchem'
from product_ideas
where canonical_name is not null
on conflict (user_id, alias_normalized) do nothing;

insert into product_aliases (user_id, product_idea_id, alias, alias_normalized, kind)
select p.user_id, p.id, s.synonym, normalize_alias(s.synonym), 'pubchem'
from product_ideas p, unnest(p.synonyms) as s(synonym)
where btrim(s.synonym) <> ''
on conflict (user_id, alias_normalized) do nothing;

-- ---------------------------------------------- production routes ---

alter table source_product_ideas
  add column names_used              text[] not null default '{}',
  add column production_method       production_method,
  add column production_detail       text,
  add column production_evidence_url text;

alter table sources
  add column production_status compound_status,
  add column production_error  text;

-- ------------------------------------------- merge_product_ideas v2 ---
-- As in 012, plus: the new link columns are carried over, aliases move to
-- the survivor (an alias belongs to one product, so moving can't clash),
-- the survivor's new name becomes an alias, and the reference_* description
-- cache is cleared.

create or replace function merge_product_ideas(
  survivor_id   uuid,
  absorbed_ids  uuid[],
  new_name      text,
  new_rating    int,
  new_notes     text,
  new_cid       int,
  new_canonical text,
  new_synonyms  text[]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (select count(*) from product_ideas where id = survivor_id or id = any(absorbed_ids))
     <> 1 + coalesce(array_length(absorbed_ids, 1), 0) then
    raise exception 'merge_product_ideas: unknown or duplicate product idea id';
  end if;

  insert into source_product_ideas
    (source_id, product_idea_id, context, relevance_score, chunk_id, names_used,
     production_method, production_detail, production_evidence_url)
  select distinct on (source_id)
    source_id, survivor_id, context, relevance_score, chunk_id, names_used,
    production_method, production_detail, production_evidence_url
  from source_product_ideas
  where product_idea_id = any(absorbed_ids)
  order by source_id, relevance_score desc nulls last
  on conflict (source_id, product_idea_id) do nothing;

  update product_aliases
  set product_idea_id = survivor_id
  where product_idea_id = any(absorbed_ids);

  delete from product_ideas where id = any(absorbed_ids);

  update product_ideas
  set name              = new_name,
      interest_rating   = new_rating,
      notes             = new_notes,
      pubchem_cid       = new_cid,
      canonical_name    = new_canonical,
      synonyms          = coalesce(new_synonyms, '{}'),
      reference_extract = null,
      reference_url     = null,
      reference_source  = null
  where id = survivor_id;

  insert into product_aliases (user_id, product_idea_id, alias, alias_normalized, kind)
  select user_id, id, new_name, normalize_alias(new_name), 'name'
  from product_ideas where id = survivor_id
  on conflict (user_id, alias_normalized) do nothing;
end;
$$;
