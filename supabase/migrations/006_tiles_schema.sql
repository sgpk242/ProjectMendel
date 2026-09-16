-- Mendel — Phase 3: dashboard tiles
--
-- Three new features backed by five new tables:
--   1. Funding opportunities tracker (manual CRUD)
--   2. Product idea radar (compounds extracted during ingestion)
--   3. Weekly papers feed (OpenAlex + Jina Search discovery)


-- ---------------------------------------------------------------------------
-- funding_opportunities
-- ---------------------------------------------------------------------------

create table funding_opportunities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  title        text not null,
  organization text,
  amount       text,               -- flexible: "$500K", "$1M–$5M", "TBD"
  deadline     date,
  url          text,
  notes        text,
  status       text not null default 'open'
               check (status in ('open', 'closed', 'applied')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index funding_opportunities_user_id_idx
  on funding_opportunities (user_id);

create trigger funding_opportunities_set_updated_at
  before update on funding_opportunities
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- product_ideas  (biomanufacturing compounds, deduped per user like topics)
-- ---------------------------------------------------------------------------

create table product_ideas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  name            text not null,
  description     text,
  interest_rating int check (interest_rating between 1 and 5),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Case-insensitive uniqueness per user, same pattern as topics.
create unique index product_ideas_user_lower_name_key
  on product_ideas (user_id, lower(name));

create index product_ideas_user_id_idx on product_ideas (user_id);

create trigger product_ideas_set_updated_at
  before update on product_ideas
  for each row execute function set_updated_at();


-- Junction: which sources mention which compounds.
create table source_product_ideas (
  source_id       uuid not null references sources on delete cascade,
  product_idea_id uuid not null references product_ideas on delete cascade,
  context         text,            -- snippet from the paper
  relevance_score float check (relevance_score between 0 and 1),
  primary key (source_id, product_idea_id)
);

create index source_product_ideas_product_idea_id_idx
  on source_product_ideas (product_idea_id);


-- ---------------------------------------------------------------------------
-- papers feed
-- ---------------------------------------------------------------------------

create type feed_source_type as enum ('openalex', 'web');
create type feed_item_status as enum ('new', 'reviewed', 'dismissed', 'ingested');

-- User-defined search queries that drive paper discovery.
create table feed_queries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  query_text  text not null,
  source_type feed_source_type not null default 'openalex',
  enabled     boolean not null default true,
  last_run_at timestamptz,
  created_at  timestamptz not null default now()
);

create index feed_queries_user_id_idx on feed_queries (user_id);


-- Discovered papers / articles waiting for triage.
create table feed_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  feed_query_id      uuid references feed_queries on delete set null,
  title              text not null,
  authors            text,
  abstract           text,
  url                text not null,
  external_id        text,          -- OpenAlex work ID or URL hash
  published_date     date,
  fetched_at         timestamptz not null default now(),
  status             feed_item_status not null default 'new',
  ingested_source_id uuid references sources on delete set null,
  created_at         timestamptz not null default now()
);

create index feed_items_user_id_idx    on feed_items (user_id);
create index feed_items_status_idx     on feed_items (user_id, status);

-- Dedup: same external ID or same URL per user.
create unique index feed_items_user_external_id_key
  on feed_items (user_id, external_id) where external_id is not null;
create unique index feed_items_user_url_key
  on feed_items (user_id, url);


-- ---------------------------------------------------------------------------
-- RLS policies — all five tables follow the same owner-scoped pattern
-- ---------------------------------------------------------------------------

alter table funding_opportunities enable row level security;
create policy "funding_opportunities: owner can select"
  on funding_opportunities for select using (auth.uid() = user_id);
create policy "funding_opportunities: owner can insert"
  on funding_opportunities for insert with check (auth.uid() = user_id);
create policy "funding_opportunities: owner can update"
  on funding_opportunities for update using (auth.uid() = user_id);
create policy "funding_opportunities: owner can delete"
  on funding_opportunities for delete using (auth.uid() = user_id);

alter table product_ideas enable row level security;
create policy "product_ideas: owner can select"
  on product_ideas for select using (auth.uid() = user_id);
create policy "product_ideas: owner can insert"
  on product_ideas for insert with check (auth.uid() = user_id);
create policy "product_ideas: owner can update"
  on product_ideas for update using (auth.uid() = user_id);
create policy "product_ideas: owner can delete"
  on product_ideas for delete using (auth.uid() = user_id);

alter table source_product_ideas enable row level security;
-- source_product_ideas inherits visibility from its parent tables via FKs,
-- but RLS still needs explicit policies. We scope through the source row's
-- ownership since this is a junction table without its own user_id.
create policy "source_product_ideas: owner can select"
  on source_product_ideas for select using (
    exists (select 1 from sources s where s.id = source_id and s.user_id = auth.uid())
  );
create policy "source_product_ideas: owner can insert"
  on source_product_ideas for insert with check (
    exists (select 1 from sources s where s.id = source_id and s.user_id = auth.uid())
  );
create policy "source_product_ideas: owner can delete"
  on source_product_ideas for delete using (
    exists (select 1 from sources s where s.id = source_id and s.user_id = auth.uid())
  );

alter table feed_queries enable row level security;
create policy "feed_queries: owner can select"
  on feed_queries for select using (auth.uid() = user_id);
create policy "feed_queries: owner can insert"
  on feed_queries for insert with check (auth.uid() = user_id);
create policy "feed_queries: owner can update"
  on feed_queries for update using (auth.uid() = user_id);
create policy "feed_queries: owner can delete"
  on feed_queries for delete using (auth.uid() = user_id);

alter table feed_items enable row level security;
create policy "feed_items: owner can select"
  on feed_items for select using (auth.uid() = user_id);
create policy "feed_items: owner can insert"
  on feed_items for insert with check (auth.uid() = user_id);
create policy "feed_items: owner can update"
  on feed_items for update using (auth.uid() = user_id);
create policy "feed_items: owner can delete"
  on feed_items for delete using (auth.uid() = user_id);
