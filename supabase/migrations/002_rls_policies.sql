-- Mendel — Phase 0: row level security
--
-- Every table is owner-scoped. Notes on the patterns used throughout:
--
--   * Policies are scoped `to authenticated` so they are never evaluated for
--     anonymous requests.
--   * `(select auth.uid())` rather than a bare `auth.uid()`. Wrapping it in a
--     subquery lets Postgres hoist it into an InitPlan and evaluate it once per
--     statement instead of once per row.
--   * INSERT policies take `with check`; UPDATE policies take BOTH `using` and
--     `with check`. Without the `with check` half, an UPDATE could reassign
--     user_id and hand the row to another account.
--
-- The service (secret) key bypasses RLS entirely, so any server-side code using
-- it must filter by user_id explicitly.

alter table sources             enable row level security;
alter table topics              enable row level security;
alter table source_topics       enable row level security;
alter table chunks              enable row level security;
alter table source_similarities enable row level security;
alter table collections         enable row level security;
alter table collection_sources  enable row level security;


-- --------------------------------------------------------------- sources ---

create policy "sources: owner can select" on sources
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "sources: owner can insert" on sources
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "sources: owner can update" on sources
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "sources: owner can delete" on sources
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------- topics ---

create policy "topics: owner can select" on topics
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "topics: owner can insert" on topics
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "topics: owner can update" on topics
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "topics: owner can delete" on topics
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------- chunks ---
-- Owner is denormalized onto chunks, so reads use a plain indexed predicate.
-- Writes additionally verify the parent source is owned by the same user, so a
-- chunk cannot be attached to someone else's source.

create policy "chunks: owner can select" on chunks
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "chunks: owner can insert" on chunks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from sources s
      where s.id = source_id and s.user_id = (select auth.uid())
    )
  );

create policy "chunks: owner can update" on chunks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "chunks: owner can delete" on chunks
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- --------------------------------------------------- source_similarities ---

create policy "source_similarities: owner can select" on source_similarities
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "source_similarities: owner can insert" on source_similarities
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from sources s
      where s.id = source_a_id and s.user_id = (select auth.uid())
    )
    and exists (
      select 1 from sources s
      where s.id = source_b_id and s.user_id = (select auth.uid())
    )
  );

create policy "source_similarities: owner can update" on source_similarities
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "source_similarities: owner can delete" on source_similarities
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- ----------------------------------------------------------- collections ---

create policy "collections: owner can select" on collections
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "collections: owner can insert" on collections
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "collections: owner can update" on collections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "collections: owner can delete" on collections
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- --------------------------------------------------------- join tables -----
-- These carry no user_id of their own; ownership is proven through both parents.

create policy "source_topics: owner can select" on source_topics
  for select to authenticated
  using (
    exists (select 1 from sources s
            where s.id = source_id and s.user_id = (select auth.uid()))
  );

create policy "source_topics: owner can insert" on source_topics
  for insert to authenticated
  with check (
    exists (select 1 from sources s
            where s.id = source_id and s.user_id = (select auth.uid()))
    and exists (select 1 from topics t
                where t.id = topic_id and t.user_id = (select auth.uid()))
  );

create policy "source_topics: owner can update" on source_topics
  for update to authenticated
  using (
    exists (select 1 from sources s
            where s.id = source_id and s.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from sources s
            where s.id = source_id and s.user_id = (select auth.uid()))
    and exists (select 1 from topics t
                where t.id = topic_id and t.user_id = (select auth.uid()))
  );

create policy "source_topics: owner can delete" on source_topics
  for delete to authenticated
  using (
    exists (select 1 from sources s
            where s.id = source_id and s.user_id = (select auth.uid()))
  );


create policy "collection_sources: owner can select" on collection_sources
  for select to authenticated
  using (
    exists (select 1 from collections c
            where c.id = collection_id and c.user_id = (select auth.uid()))
  );

create policy "collection_sources: owner can insert" on collection_sources
  for insert to authenticated
  with check (
    exists (select 1 from collections c
            where c.id = collection_id and c.user_id = (select auth.uid()))
    and exists (select 1 from sources s
                where s.id = source_id and s.user_id = (select auth.uid()))
  );

create policy "collection_sources: owner can update" on collection_sources
  for update to authenticated
  using (
    exists (select 1 from collections c
            where c.id = collection_id and c.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from collections c
            where c.id = collection_id and c.user_id = (select auth.uid()))
    and exists (select 1 from sources s
                where s.id = source_id and s.user_id = (select auth.uid()))
  );

create policy "collection_sources: owner can delete" on collection_sources
  for delete to authenticated
  using (
    exists (select 1 from collections c
            where c.id = collection_id and c.user_id = (select auth.uid()))
  );
