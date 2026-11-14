-- Mendel — normalize compounds to PubChem IDs
--
-- product_ideas deduped on lower(name), so synonyms ("Reb M" vs
-- "rebaudioside M") became separate rows and split every count. Compounds
-- that resolve in PubChem now dedupe on their CID; ones that don't
-- (mixtures, proteins, enzymes, extracts, brand-only products) keep
-- deduping on lower(name).
--
-- Applies cleanly to existing data: no row has a CID yet. CIDs are set on
-- existing rows by the reviewed merge on /maintenance, which merges
-- duplicates before assigning a CID, so the CID index never sees a clash.

alter table product_ideas
  add column pubchem_cid    int,
  add column canonical_name text,
  add column synonyms       text[] not null default '{}';

drop index product_ideas_user_lower_name_key;

create unique index product_ideas_user_lower_name_key
  on product_ideas (user_id, lower(name))
  where pubchem_cid is null;

create unique index product_ideas_user_pubchem_cid_key
  on product_ideas (user_id, pubchem_cid)
  where pubchem_cid is not null;


-- ---------------------------------------------------------------------------
-- compound_lookups — cache of PubChem name lookups (hits and misses)
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT owner-scoped, unlike every other table: it holds public
-- PubChem data keyed by name, not user data, and sharing it means a name is
-- only ever looked up once.

create table compound_lookups (
  query_name     text primary key,          -- normalized (lowercased) name
  pubchem_cid    int,                       -- null = no confident match
  canonical_name text,
  synonyms       text[] not null default '{}',
  looked_up_at   timestamptz not null default now()
);

alter table compound_lookups enable row level security;

create policy "compound_lookups: authenticated can select" on compound_lookups
  for select to authenticated using (true);

create policy "compound_lookups: authenticated can insert" on compound_lookups
  for insert to authenticated with check (true);

create policy "compound_lookups: authenticated can update" on compound_lookups
  for update to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------------
-- merge_product_ideas — fold duplicate compounds into one row, atomically
-- ---------------------------------------------------------------------------
--
-- Re-points every source link from the absorbed rows to the survivor
-- (keeping the survivor's link where both mention the same source), deletes
-- the absorbed rows, and sets the survivor's name, rating, notes and PubChem
-- identity. Clears the cached Wikipedia extract so it's looked up again
-- under the canonical name. SECURITY INVOKER: runs under the caller's RLS.

create function merge_product_ideas(
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
  -- RLS hides other users' rows, so this also rejects ids the caller
  -- doesn't own rather than silently skipping them.
  if (select count(*) from product_ideas where id = survivor_id or id = any(absorbed_ids))
     <> 1 + coalesce(array_length(absorbed_ids, 1), 0) then
    raise exception 'merge_product_ideas: unknown or duplicate product idea id';
  end if;

  -- Where several absorbed rows link the same source, keep the most
  -- relevant link; where the survivor already links it, keep the survivor's.
  insert into source_product_ideas (source_id, product_idea_id, context, relevance_score, chunk_id)
  select distinct on (source_id) source_id, survivor_id, context, relevance_score, chunk_id
  from source_product_ideas
  where product_idea_id = any(absorbed_ids)
  order by source_id, relevance_score desc nulls last
  on conflict (source_id, product_idea_id) do nothing;

  delete from product_ideas where id = any(absorbed_ids);

  update product_ideas
  set name              = new_name,
      interest_rating   = new_rating,
      notes             = new_notes,
      pubchem_cid       = new_cid,
      canonical_name    = new_canonical,
      synonyms          = coalesce(new_synonyms, '{}'),
      wikipedia_extract = null,
      wikipedia_url     = null
  where id = survivor_id;
end;
$$;
