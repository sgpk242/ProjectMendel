-- Mendel — theses: recorded, checkable calls about where the industry is going
--
-- A thesis is a falsifiable claim with a confidence, what would change my
-- mind, and a date to review it. Sources link to theses with a stance
-- (supports / contradicts / context) so the evidence for and against each
-- call accumulates as I read. Resolving a thesis records the outcome and
-- when, so calls can be scored later.

create type thesis_status as enum ('open', 'confirmed', 'refuted', 'unresolved');
create type thesis_stance as enum ('supports', 'contradicts', 'context');

create table theses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  claim           text not null check (length(trim(claim)) > 0),
  confidence      int check (confidence between 0 and 100),
  change_my_mind  text,           -- what evidence would change my mind
  review_date     date,
  status          thesis_status not null default 'open',
  resolution_note text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index theses_user_review_idx on theses (user_id, review_date);

create trigger theses_set_updated_at
  before update on theses
  for each row execute function set_updated_at();

create table thesis_sources (
  thesis_id  uuid not null references theses on delete cascade,
  source_id  uuid not null references sources on delete cascade,
  stance     thesis_stance not null,
  note       text,
  created_at timestamptz not null default now(),
  primary key (thesis_id, source_id)
);

create index thesis_sources_source_id_idx on thesis_sources (source_id);


-- ------------------------------------------------------------------- RLS ---

alter table theses         enable row level security;
alter table thesis_sources enable row level security;

create policy "theses: owner can select" on theses
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "theses: owner can insert" on theses
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "theses: owner can update" on theses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "theses: owner can delete" on theses
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- A link is the caller's only if both its thesis and its source are.
create policy "thesis_sources: owner can select" on thesis_sources
  for select to authenticated
  using (
    exists (select 1 from theses t where t.id = thesis_id and t.user_id = (select auth.uid()))
  );

create policy "thesis_sources: owner can insert" on thesis_sources
  for insert to authenticated
  with check (
    exists (select 1 from theses t where t.id = thesis_id and t.user_id = (select auth.uid()))
    and exists (select 1 from sources s where s.id = source_id and s.user_id = (select auth.uid()))
  );

create policy "thesis_sources: owner can update" on thesis_sources
  for update to authenticated
  using (
    exists (select 1 from theses t where t.id = thesis_id and t.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from theses t where t.id = thesis_id and t.user_id = (select auth.uid()))
    and exists (select 1 from sources s where s.id = source_id and s.user_id = (select auth.uid()))
  );

create policy "thesis_sources: owner can delete" on thesis_sources
  for delete to authenticated
  using (
    exists (select 1 from theses t where t.id = thesis_id and t.user_id = (select auth.uid()))
  );
