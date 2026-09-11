-- Mendel — fix search_sources' rank column type mismatch
--
-- ts_rank_cd() returns `real`, and the 0.1 fixed-rank literal for a
-- topic-name-only match defaults to `numeric`; run through nested
-- CASE/greatest() expressions, Postgres didn't resolve the combination to
-- `double precision` — what the function's declared `rank float` column
-- requires — and every call failed with "structure of query does not match
-- function result type". Explicit casts on both greatest() operands pin the
-- type so it's unambiguous.
--
-- create or replace function, not a new function: 004 already defined
-- search_sources on any project that ran it, and this must replace that
-- definition rather than sit alongside it under a different signature.
create or replace function search_sources(
  search_query       text            default null,
  filter_types       source_type[]   default null,
  filter_statuses    source_status[] default null,
  filter_topic_ids   uuid[]          default null,
  filter_rating_min  int             default null,
  filter_rating_max  int             default null,
  filter_reading_min int             default null,
  filter_reading_max int             default null,
  filter_date_from   timestamptz     default null,
  filter_date_to     timestamptz     default null,
  sort_by            text            default 'captured_at',
  sort_asc           boolean         default false,
  page_limit         int             default 30,
  page_offset        int             default 0
)
returns table (
  id                    uuid,
  title                 text,
  url                   text,
  author                text,
  publication           text,
  published_date        timestamptz,
  captured_at           timestamptz,
  summary               text,
  source_type           source_type,
  status                source_status,
  ingest_status         ingest_status,
  interest_rating       int,
  word_count            int,
  reading_time_minutes  int,
  user_note             text,
  rank                  float,
  total_count           bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  tsq   tsquery;
  q     text := nullif(trim(search_query), '');
begin
  if q is not null then
    tsq := websearch_to_tsquery('english', q);
  end if;

  return query
  with matched as (
    select
      s.id, s.title, s.url, s.author, s.publication,
      s.published_date, s.captured_at, s.summary,
      s.source_type, s.status, s.ingest_status,
      s.interest_rating, s.word_count, s.reading_time_minutes,
      s.user_note,
      -- Content match (title/summary/note/body, per the fts column's own
      -- A/B/C/D weights) beats a topic-name match — topic matches get a
      -- fixed rank low enough to always sort after any real content hit,
      -- but still above zero so they aren't dropped by the `> 0` filter
      -- a caller might apply downstream. Both greatest() operands are cast
      -- to double precision explicitly — see header note.
      case
        when tsq is null then 0::double precision
        else greatest(
          (case when s.fts @@ tsq then ts_rank_cd(s.fts, tsq, 32) else 0 end)::double precision,
          (case
            when exists (
              select 1
              from public.source_topics st
              join public.topics t on t.id = st.topic_id
              where st.source_id = s.id and t.name ilike '%' || q || '%'
            ) then 0.1
            else 0
          end)::double precision
        )
      end as rank
    from public.sources s
    where
      (
        tsq is null
        or s.fts @@ tsq
        or exists (
          select 1
          from public.source_topics st
          join public.topics t on t.id = st.topic_id
          where st.source_id = s.id and t.name ilike '%' || q || '%'
        )
      )
      and (filter_types is null or s.source_type = any(filter_types))
      and (filter_statuses is null or s.status = any(filter_statuses))
      and (filter_rating_min is null or s.interest_rating >= filter_rating_min)
      and (filter_rating_max is null or s.interest_rating <= filter_rating_max)
      and (filter_reading_min is null or s.reading_time_minutes >= filter_reading_min)
      and (filter_reading_max is null or s.reading_time_minutes <= filter_reading_max)
      and (filter_date_from is null or s.captured_at >= filter_date_from)
      and (filter_date_to is null or s.captured_at <= filter_date_to)
      and (
        filter_topic_ids is null
        or exists (
          select 1 from public.source_topics st
          where st.source_id = s.id and st.topic_id = any(filter_topic_ids)
        )
      )
  )
  select
    m.id, m.title, m.url, m.author, m.publication,
    m.published_date, m.captured_at, m.summary,
    m.source_type, m.status, m.ingest_status,
    m.interest_rating, m.word_count, m.reading_time_minutes,
    m.user_note, m.rank,
    count(*) over() as total_count
  from matched m
  order by
    -- A search in progress always ranks by relevance first; sort_by only
    -- breaks ties (and is the sole ordering once there's no query).
    case when tsq is not null then m.rank end desc nulls last,
    case when tsq is null and sort_by = 'captured_at' and sort_asc then m.captured_at end asc nulls last,
    case when tsq is null and sort_by = 'captured_at' and not sort_asc then m.captured_at end desc nulls last,
    case when tsq is null and sort_by = 'published_date' and sort_asc then m.published_date end asc nulls last,
    case when tsq is null and sort_by = 'published_date' and not sort_asc then m.published_date end desc nulls last,
    case when tsq is null and sort_by = 'interest_rating' and sort_asc then m.interest_rating end asc nulls last,
    case when tsq is null and sort_by = 'interest_rating' and not sort_asc then m.interest_rating end desc nulls last,
    case when tsq is null and sort_by = 'reading_time_minutes' and sort_asc then m.reading_time_minutes end asc nulls last,
    case when tsq is null and sort_by = 'reading_time_minutes' and not sort_asc then m.reading_time_minutes end desc nulls last,
    m.captured_at desc
  limit page_limit
  offset page_offset;
end;
$$;
