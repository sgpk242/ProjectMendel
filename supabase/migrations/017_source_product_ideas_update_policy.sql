-- Mendel — let owners update source_product_ideas links
--
-- source_product_ideas had select / insert / delete policies but no update
-- policy, so re-extracting compounds on an already-linked source failed:
-- storeCompounds() upserts links, and a link that already exists becomes an
-- UPDATE, which RLS denied. Every other upserted junction table already has
-- an update policy (source_topics, collection_sources, ...).
--
-- Also tightens the insert policy to match: a link now requires owning both
-- the source and the product idea, so neither an insert nor an update can
-- point a link at another user's compound.

create policy "source_product_ideas: owner can update" on source_product_ideas
  for update to authenticated
  using (
    exists (select 1 from sources s
            where s.id = source_id and s.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from sources s
            where s.id = source_id and s.user_id = (select auth.uid()))
    and exists (select 1 from product_ideas p
                where p.id = product_idea_id and p.user_id = (select auth.uid()))
  );

drop policy "source_product_ideas: owner can insert" on source_product_ideas;

create policy "source_product_ideas: owner can insert" on source_product_ideas
  for insert to authenticated
  with check (
    exists (select 1 from sources s
            where s.id = source_id and s.user_id = (select auth.uid()))
    and exists (select 1 from product_ideas p
                where p.id = product_idea_id and p.user_id = (select auth.uid()))
  );
