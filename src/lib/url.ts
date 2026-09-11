/**
 * URL canonicalization for `sources.url_canonical`.
 *
 * Dedup keys off this value rather than the raw URL, so the same article shared
 * with different campaign parameters resolves to one source. The original URL
 * is kept verbatim in `sources.url`.
 */

/** Query parameters that identify a referral, not a document. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^ga_/i,
  /^mc_/i, // Mailchimp
  /^_hs/i, // HubSpot
  /^(fbclid|gclid|dclid|gbraid|wbraid|msclkid|igshid|twclid|yclid|ttclid)$/i,
  /^(ref|ref_src|ref_url|source|src|cmpid|campaign_id)$/i,
  /^(trk|trkCampaign|originalSubdomain)$/i, // LinkedIn
];

function isTrackingParam(key: string): boolean {
  return TRACKING_PARAMS.some((pattern) => pattern.test(key));
}

/**
 * Normalize a URL for deduplication: lowercase the host, drop the fragment and
 * tracking parameters, strip a default port and a trailing slash, and sort the
 * remaining query parameters so ordering does not create a second identity.
 *
 * Throws on input that is not a parseable http(s) URL.
 */
export function canonicalizeUrl(input: string): string {
  const url = new URL(input.trim());

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }

  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  url.port = '';

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .sort(([a], [b]) => a.localeCompare(b));

  url.search = '';
  for (const [key, value] of params) url.searchParams.append(key, value);

  // Drop a trailing slash on non-root paths so /a and /a/ are one source.
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

/** True when the string parses as an http(s) URL. */
export function isValidUrl(input: string): boolean {
  try {
    canonicalizeUrl(input);
    return true;
  } catch {
    return false;
  }
}
