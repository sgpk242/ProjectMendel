/**
 * Parsing/serialization for the dashboard's URL-encoded filter state.
 *
 * All filter state lives in the URL (shareable, bookmarkable, and the only
 * state the Server Component needs to reproduce a search). Client filter
 * controls read the current URL and write a new one via `router.replace()`;
 * the Server Component re-renders and calls `search_sources` with whatever
 * `parseSearchParams` + `toRpcArgs` produce from it. Pure functions — no
 * Next.js or Supabase imports — so they're easy to reason about in isolation.
 */

import { SOURCE_STATUSES, SOURCE_TYPES, type SourceStatus, type SourceType } from '@/lib/constants';

export const PAGE_SIZE = 30;

export const READING_BUCKETS = ['<5', '5-15', '15-30', '30+'] as const;
export type ReadingBucket = (typeof READING_BUCKETS)[number];

const READING_BUCKET_RANGES: Record<ReadingBucket, { min: number; max: number | null }> = {
  '<5': { min: 0, max: 4 },
  '5-15': { min: 5, max: 15 },
  '15-30': { min: 16, max: 30 },
  '30+': { min: 31, max: null },
};

export const SORT_COLUMNS = [
  'captured_at',
  'published_date',
  'interest_rating',
  'reading_time_minutes',
] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

export type DashboardFilters = {
  q: string | null;
  types: SourceType[];
  statuses: SourceStatus[];
  topicIds: string[];
  ratingMin: number | null;
  ratingMax: number | null;
  readingBuckets: ReadingBucket[];
  dateFrom: string | null;
  dateTo: string | null;
  sortBy: SortColumn;
  sortAsc: boolean;
  page: number;
};

/**
 * Next.js page `searchParams` is a plain object (values can be a string, an
 * array, or undefined) once awaited — normalize it to `URLSearchParams` so
 * every parsing helper below has one shape to deal with, whether it's fed
 * from a Server Component's `searchParams` or a client's `useSearchParams()`.
 */
export function toURLSearchParams(
  sp: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) usp.append(key, v);
  }
  return usp;
}

function splitCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseIntParam(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function clampRating(n: number | null): number | null {
  if (n === null) return null;
  return Math.min(5, Math.max(1, n));
}

export function parseSearchParams(sp: URLSearchParams): DashboardFilters {
  const types = splitCsv(sp.get('type')).filter((t): t is SourceType =>
    (SOURCE_TYPES as readonly string[]).includes(t),
  );
  const statuses = splitCsv(sp.get('status')).filter((s): s is SourceStatus =>
    (SOURCE_STATUSES as readonly string[]).includes(s),
  );
  const readingBuckets = splitCsv(sp.get('reading')).filter((b): b is ReadingBucket =>
    (READING_BUCKETS as readonly string[]).includes(b),
  );
  const sortByRaw = sp.get('sort');
  const sortBy: SortColumn = (SORT_COLUMNS as readonly string[]).includes(sortByRaw ?? '')
    ? (sortByRaw as SortColumn)
    : 'captured_at';

  const pageRaw = parseIntParam(sp.get('page'));
  const page = pageRaw && pageRaw > 0 ? pageRaw : 1;

  return {
    q: sp.get('q')?.trim() || null,
    types,
    statuses,
    topicIds: splitCsv(sp.get('topic')),
    ratingMin: clampRating(parseIntParam(sp.get('rating_min'))),
    ratingMax: clampRating(parseIntParam(sp.get('rating_max'))),
    readingBuckets,
    dateFrom: sp.get('from') || null,
    dateTo: sp.get('to') || null,
    sortBy,
    sortAsc: sp.get('dir') === 'asc',
    page,
  };
}

/**
 * Reading-time buckets don't collapse onto a single contiguous range when
 * the selection has a gap (e.g. "<5" and "30+" without the middle buckets) —
 * `search_sources` only accepts one [min, max] pair, so this takes the outer
 * bound across every selected bucket. A non-contiguous selection is a rare
 * case and this is the closest a single range can represent it.
 */
export function readingBucketsToRange(buckets: ReadingBucket[]): {
  min: number | null;
  max: number | null;
} {
  if (buckets.length === 0) return { min: null, max: null };
  let min: number | null = null;
  let max: number | null = null;
  let unbounded = false;
  for (const bucket of buckets) {
    const range = READING_BUCKET_RANGES[bucket];
    min = min === null ? range.min : Math.min(min, range.min);
    if (range.max === null) unbounded = true;
    else max = max === null ? range.max : Math.max(max, range.max);
  }
  return { min, max: unbounded ? null : max };
}

function endOfDayISOString(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

function startOfDayISOString(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Build the `supabase.rpc('search_sources', ...)` argument object. */
export function toRpcArgs(filters: DashboardFilters) {
  const { min: readingMin, max: readingMax } = readingBucketsToRange(filters.readingBuckets);
  return {
    search_query: filters.q,
    filter_types: filters.types.length > 0 ? filters.types : null,
    filter_statuses: filters.statuses.length > 0 ? filters.statuses : null,
    filter_topic_ids: filters.topicIds.length > 0 ? filters.topicIds : null,
    filter_rating_min: filters.ratingMin,
    filter_rating_max: filters.ratingMax,
    filter_reading_min: readingMin,
    filter_reading_max: readingMax,
    filter_date_from: filters.dateFrom ? startOfDayISOString(filters.dateFrom) : null,
    filter_date_to: filters.dateTo ? endOfDayISOString(filters.dateTo) : null,
    sort_by: filters.sortBy,
    sort_asc: filters.sortAsc,
    page_limit: PAGE_SIZE,
    page_offset: (filters.page - 1) * PAGE_SIZE,
  };
}

/**
 * Serialize filters back to a query string — used to build pagination links
 * and "remove this filter" hrefs that preserve every other active param.
 * Omits defaults (page 1, sort captured_at desc) to keep URLs clean.
 */
export function serializeFilters(filters: DashboardFilters): URLSearchParams {
  const usp = new URLSearchParams();
  if (filters.q) usp.set('q', filters.q);
  if (filters.types.length) usp.set('type', filters.types.join(','));
  if (filters.statuses.length) usp.set('status', filters.statuses.join(','));
  if (filters.topicIds.length) usp.set('topic', filters.topicIds.join(','));
  if (filters.ratingMin !== null) usp.set('rating_min', String(filters.ratingMin));
  if (filters.ratingMax !== null) usp.set('rating_max', String(filters.ratingMax));
  if (filters.readingBuckets.length) usp.set('reading', filters.readingBuckets.join(','));
  if (filters.dateFrom) usp.set('from', filters.dateFrom);
  if (filters.dateTo) usp.set('to', filters.dateTo);
  if (filters.sortBy !== 'captured_at') usp.set('sort', filters.sortBy);
  if (filters.sortAsc) usp.set('dir', 'asc');
  if (filters.page > 1) usp.set('page', String(filters.page));
  return usp;
}

/** True when any facet/search filter is active (independent of sort/page). */
export function hasActiveFilters(filters: DashboardFilters): boolean {
  return (
    filters.q !== null ||
    filters.types.length > 0 ||
    filters.statuses.length > 0 ||
    filters.topicIds.length > 0 ||
    filters.ratingMin !== null ||
    filters.ratingMax !== null ||
    filters.readingBuckets.length > 0 ||
    filters.dateFrom !== null ||
    filters.dateTo !== null
  );
}

export const READING_BUCKET_LABELS: Record<ReadingBucket, string> = {
  '<5': '< 5 min',
  '5-15': '5–15 min',
  '15-30': '15–30 min',
  '30+': '30+ min',
};
