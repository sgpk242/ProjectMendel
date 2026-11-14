/**
 * Where "Commercial" feed queries search. Edit freely: each entry is a
 * domain passed to Jina Search as a `site=` filter.
 */
export const COMMERCIAL_SITES = [
  // Press-release wires — where most company announcements are first posted
  'prnewswire.com',
  'businesswire.com',
  'globenewswire.com',
  // Food & ingredient trade press
  'foodnavigator.com',
  'foodnavigator-usa.com',
  'nutraingredients.com',
  'nutraingredients-usa.com',
  'fooddive.com',
  'agfundernews.com',
  'greenqueen.com.hk',
  // Biotech & synbio trade press
  'synbiobeta.com',
  'fiercebiotech.com',
  'biospace.com',
  'genengnews.com',
  // Chemicals & materials press
  'cen.acs.org',
  'icis.com',
  'chemweek.com',
];

/**
 * Appended to every commercial query so results lean toward deals and
 * launches rather than explainers. Set to '' to search the sites with the
 * query alone.
 */
export const COMMERCIAL_QUERY_TERMS =
  '(announces OR launch OR partnership OR agreement OR funding OR acquisition OR scale-up OR offtake OR capacity)';
