-- Mendel — Phase 0: retrieval functions
--
-- supabase-js cannot express `order by embedding <=> $1` through PostgREST, so
-- vector search has to go through an RPC. These are `security invoker` (the
-- default) so the caller's RLS policies still apply — a `security definer`
-- function here would read across every user's corpus.
--
-- None of them return the embedding column: at 1024 float4s per row, echoing
-- embeddings back to the client dwarfs the payload that was actually asked for.

-- Nearest chunks to a query embedding, optionally restricted to a set of
-- sources (used to scope a chat to a collection or a single document).
--
-- Note: pgvector's HNSW index post-filters. With a restrictive
-- filter_source_ids, fewer than match_count rows may come back even when more
-- exist — over-fetch and trim at the call site if that matters.
create or replace function match_chunks(
  query_embedding   extensions.vector(1024),
  match_count       int     default 10,
  filter_source_ids uuid[]  default null
)
returns table (
  chunk_id    uuid,
  source_id   uuid,
  chunk_index int,
  content     text,
  start_char  int,
  end_char    int,
  similarity  float
)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    c.source_id,
    c.chunk_index,
    c.content,
    c.start_char,
    c.end_char,
    1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.chunks c
  where filter_source_ids is null or c.source_id = any(filter_source_ids)
  order by c.embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;


-- Nearest sources to a source-level embedding, for dedup and "related reading"
-- suggestions at capture time. exclude_source_id keeps a source from matching
-- itself when checking a freshly ingested row.
create or replace function match_sources(
  query_embedding   extensions.vector(1024),
  match_count       int   default 10,
  exclude_source_id uuid  default null
)
returns table (
  source_id   uuid,
  title       text,
  url         text,
  similarity  float
)
language sql
stable
set search_path = ''
as $$
  select
    s.id,
    s.title,
    s.url,
    1 - (s.source_embedding operator(extensions.<=>) query_embedding) as similarity
  from public.sources s
  where s.source_embedding is not null
    and (exclude_source_id is null or s.id <> exclude_source_id)
  order by s.source_embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;
