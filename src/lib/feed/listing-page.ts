/**
 * Detects listing pages (category, tag, topic, author, archive and search
 * pages, section indexes, homepages) among web search results, so the feed
 * only shows individual articles. Search engines often rank a site's
 * category page above its articles, e.g.
 * https://www.synbiobeta.com/categories/food-agriculture.
 */

/** Path segments that introduce a taxonomy term: `/category/<term>`. */
const TAXONOMY_SEGMENTS = new Set([
  'category',
  'categories',
  'tag',
  'tags',
  'topic',
  'topics',
  'section',
  'sections',
  'author',
  'authors',
  'archive',
  'archives',
  'search',
  'collection',
  'collections',
]);

/** Last segments that name an index of articles rather than an article. */
const INDEX_SEGMENTS = new Set([
  'news',
  'news-releases',
  'press-releases',
  'press',
  'newsroom',
  'articles',
  'blog',
  'insights',
  'latest',
  'all',
  'media',
  'events',
  'resources',
  'podcasts',
  'videos',
  'webinars',
]);

/** Query parameters used by on-site search and pagination. */
const LISTING_PARAMS = ['s', 'q', 'query', 'search', 'page', 'paged'];

/** WordPress and similar CMSs title listing pages "<Term> Archives - <Site>". */
const LISTING_TITLE = /(^|\s)archives?(\s*[-|–—]|$)|^(category|tag|topic|author)\s*:/i;

/**
 * True when `url` (or `title`) looks like a listing page rather than an
 * article. A taxonomy segment counts only when at most one segment follows
 * it, because some publishers file articles under it, e.g. GEN's
 * `/topics/bioprocessing/<article>/` versus the listing `/topics/bioprocessing/`.
 */
export function isListingPage(url: string, title?: string | null): boolean {
  if (title && LISTING_TITLE.test(title.trim())) return true;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (LISTING_PARAMS.some((p) => parsed.searchParams.has(p))) return true;

  const segments = parsed.pathname
    .toLowerCase()
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/\.(html?|php|aspx?)$/, ''));

  // Pagination suffix: /category/x/page/2
  if (segments.length >= 2 && segments.at(-2) === 'page' && /^\d+$/.test(segments.at(-1)!)) {
    segments.splice(-2, 2);
  }

  if (segments.length === 0 || (segments.length === 1 && segments[0] === 'index')) return true;

  const last = segments.at(-1)!;
  if (INDEX_SEGMENTS.has(last) || last.endsWith('-list')) return true;

  return segments.some((s, i) => TAXONOMY_SEGMENTS.has(s) && segments.length - i - 1 <= 1);
}
