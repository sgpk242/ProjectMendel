-- Mendel — Phase 0: core schema
--
-- Embeddings are 1024-dimensional (Cohere embed-v4.0 via Vercel AI Gateway).
-- 1024 sits well under pgvector's 2000-dimension ceiling for HNSW indexes, so
-- both vector columns below are directly indexable. Changing this dimension
-- later requires dropping the HNSW indexes and re-embedding the entire corpus,
-- so the model that produced each vector is recorded alongside it.

-- Supabase keeps extensions out of `public`; installing pgvector there trips
-- the security advisor.
create extension if not exists vector with schema extensions;


-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type source_type as enum (
  'article', 'paper', 'blog', 'linkedin_post', 'report', 'press_release', 'other'
);

-- Where the user is in *reading* a source.
create type source_status as enum ('unread', 'skimmed', 'read', 'synthesized');

-- Where the pipeline is in *processing* a source. Distinct from source_status:
-- ingestion is multi-step and fails partway on flaky URLs, and a half-ingested
-- row needs to be distinguishable from an unread one so it can be retried.
create type ingest_status as enum (
  'pending', 'fetching', 'extracting', 'chunking', 'embedding', 'complete', 'failed'
);

-- Only symmetric relationships for now. 'updates' is directional ("A updates B"),
-- which the source_a_id < source_b_id constraint below cannot express; it will be
-- reintroduced with an explicit direction column when that feature lands.
create type similarity_type as enum ('duplicate', 'related', 'contradicts');


-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------

create table sources (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users on delete cascade,

  -- url is the URL exactly as captured; url_canonical is that URL normalized
  -- (tracking params stripped, fragment dropped, host lowercased). Dedup keys
  -- off the canonical form so the same article arriving with different utm_*
  -- parameters is recognized as one source.
  url                   text not null,
  url_canonical         text not null,
  -- Hash of the extracted body, for detecting the same article republished at
  -- a different URL, and for skipping re-ingest when content is unchanged.
  content_hash          text,

  title                 text,
  author                text,
  publication           text,
  published_date        timestamptz,
  captured_at           timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  full_text             text,
  summary               text,
  word_count            int,
  reading_time_minutes  int,

  interest_rating       int check (interest_rating between 1 and 5),
  user_note             text,
  source_type           source_type not null default 'article',
  status                source_status not null default 'unread',

  -- Ingest pipeline state.
  ingest_status         ingest_status not null default 'pending',
  ingest_error          text,
  ingest_attempts       int not null default 0,

  -- Source-level embedding (mean of chunk embeddings) for cheap dedup and
  -- similarity checks without scanning every chunk.
  source_embedding      extensions.vector(1024),
  embedding_model       text,

  -- Weighted full-text search vector. A generated column rather than an
  -- expression index so queries can ts_rank it directly and hybrid
  -- (keyword + vector) retrieval can fuse the two scores.
  -- left() guards Postgres's ~1MB tsvector ceiling on long documents.
  fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')),     'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')),   'B') ||
    setweight(to_tsvector('english', coalesce(user_note, '')), 'C') ||
    setweight(to_tsvector('english', left(coalesce(full_text, ''), 900000)), 'D')
  ) stored
);

-- One row per canonical URL per user.
create unique index sources_user_url_canonical_key
  on sources (user_id, url_canonical);

create index sources_user_id_idx     on sources (user_id);
create index sources_captured_at_idx on sources (captured_at desc);
create index sources_source_type_idx on sources (source_type);
create index sources_status_idx      on sources (status);
create index sources_ingest_status_idx on sources (ingest_status);
create index sources_content_hash_idx on sources (user_id, content_hash);
create index sources_fts_idx          on sources using gin (fts);

create index sources_embedding_idx
  on sources using hnsw (source_embedding extensions.vector_cosine_ops);


-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------

create table topics (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users on delete cascade,
  name     text not null,
  category text
);

-- Case-insensitive uniqueness. This must be a unique INDEX, not a UNIQUE table
-- constraint: Postgres table constraints accept column names, not expressions.
create unique index topics_user_lower_name_key on topics (user_id, lower(name));

create index topics_user_id_idx on topics (user_id);


create table source_topics (
  source_id       uuid not null references sources on delete cascade,
  topic_id        uuid not null references topics  on delete cascade,
  relevance_score float check (relevance_score between 0 and 1),
  primary key (source_id, topic_id)
);

-- The PK covers source_id; topic_id needs its own index or cascade deletes
-- from topics sequentially scan this table.
create index source_topics_topic_id_idx on source_topics (topic_id);


-- ---------------------------------------------------------------------------
-- chunks
-- ---------------------------------------------------------------------------

create table chunks (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references sources on delete cascade,
  -- Denormalized from sources. This is the table every RAG query hits, and
  -- carrying the owner here lets RLS use a plain indexed predicate instead of
  -- a correlated subquery against sources on every candidate row.
  user_id         uuid not null references auth.users on delete cascade,

  chunk_index     int  not null,
  content         text not null,
  -- Character offsets into sources.full_text, so chat citations can highlight
  -- the exact passage in the source detail view. Backfilling these later would
  -- mean re-chunking the whole corpus.
  start_char      int,
  end_char        int,
  token_count     int,

  embedding       extensions.vector(1024) not null,
  embedding_model text not null default 'cohere/embed-v4.0',

  unique (source_id, chunk_index)
);

create index chunks_user_id_idx on chunks (user_id);

create index chunks_embedding_idx
  on chunks using hnsw (embedding extensions.vector_cosine_ops);


-- ---------------------------------------------------------------------------
-- source_similarities
-- ---------------------------------------------------------------------------

create table source_similarities (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  source_a_id       uuid not null references sources on delete cascade,
  source_b_id       uuid not null references sources on delete cascade,
  similarity_score  float not null,
  relationship_type similarity_type not null default 'related',
  detected_at       timestamptz not null default now(),

  unique (source_a_id, source_b_id),
  -- Canonical ordering: a pair is stored once, never also in the reverse order.
  check (source_a_id < source_b_id)
);

create index source_similarities_user_id_idx on source_similarities (user_id);
create index source_similarities_b_idx       on source_similarities (source_b_id);


-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------

create table collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create index collections_user_id_idx on collections (user_id);


create table collection_sources (
  collection_id uuid not null references collections on delete cascade,
  source_id     uuid not null references sources     on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, source_id)
);

create index collection_sources_source_id_idx on collection_sources (source_id);


-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sources_set_updated_at
  before update on sources
  for each row execute function set_updated_at();
