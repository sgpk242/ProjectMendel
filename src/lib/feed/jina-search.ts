/**
 * Jina Search API fetcher for news / web articles.
 *
 * Reuses the existing JINA_API_KEY from `extract.ts`.
 *
 * Docs: https://jina.ai/search
 */

import { createHash } from 'node:crypto';

import { COMMERCIAL_QUERY_TERMS, COMMERCIAL_SITES } from './commercial-sites';
import { findPublishedDate } from './article-date';
import { isListingPage } from './listing-page';

export type JinaSearchResult = {
  externalId: string;
  title: string;
  authors: string | null;
  abstract: string | null;
  url: string;
  publishedDate: string | null;
};

/** Results plus how many were left out for not being an individual article. */
export type JinaSearchOutcome = {
  results: JinaSearchResult[];
  skipped: { listing: number; undated: number };
};

type JinaSearchResponse = {
  data?: {
    title?: string;
    url?: string;
    description?: string;
    content?: string;
    // Date fields Jina returns when it finds one; names vary by endpoint.
    date?: string;
    publishedTime?: string;
  }[];
};

/**
 * Search the web via Jina Search for news and articles matching `query`.
 * `sites` restricts results to those domains (Jina's repeated `site=`
 * parameter); `excludeSites` drops results from those domains (and their
 * subdomains) after the search, since Jina has no exclusion parameter.
 * Only individual articles are kept: listing pages (homepages, category,
 * tag, archive and search pages) and pages with no findable publish date
 * are dropped, and counted in `skipped`.
 *
 * Returns up to `limit` results. No native dedup ID — we use a SHA-256 of
 * the URL as the external ID.
 */
export async function searchJina(
  query: string,
  {
    limit = 10,
    sites = [],
    excludeSites = [],
  }: { limit?: number; sites?: string[]; excludeSites?: string[] } = {},
): Promise<JinaSearchOutcome> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) throw new Error('JINA_API_KEY is not set');

  const params = new URLSearchParams(sites.map((site) => ['site', site]));
  const qs = params.size > 0 ? `?${params}` : '';

  const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}${qs}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Jina Search API error: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as JinaSearchResponse;

  const skipped = { listing: 0, undated: 0 };
  const results: JinaSearchResult[] = [];

  for (const item of body.data ?? []) {
    if (results.length >= limit) break;
    if (!item.title || !item.url || isOnSite(item.url, excludeSites)) continue;
    if (isListingPage(item.url, item.title)) {
      skipped.listing++;
      continue;
    }
    const publishedDate = findPublishedDate({
      fields: [item.date, item.publishedTime],
      url: item.url,
      content: item.content,
    });
    if (!publishedDate) {
      skipped.undated++;
      continue;
    }
    results.push({
      externalId: createHash('sha256').update(item.url).digest('hex'),
      title: item.title,
      authors: null, // Jina Search doesn't reliably surface author info
      abstract: item.description?.trim() || null,
      url: item.url,
      publishedDate,
    });
  }

  return { results, skipped };
}

/**
 * Search only press-release wires and trade publications
 * (`COMMERCIAL_SITES`), with deal-related terms added to the query.
 */
export function searchCommercial(query: string): Promise<JinaSearchOutcome> {
  const fullQuery = COMMERCIAL_QUERY_TERMS ? `${query} ${COMMERCIAL_QUERY_TERMS}` : query;
  return searchJina(fullQuery, { sites: COMMERCIAL_SITES });
}

/**
 * Open-web news search that leaves out the commercial sites, so "News" and
 * "Commercial" queries don't spend their results on the same publications.
 */
export function searchNews(query: string): Promise<JinaSearchOutcome> {
  return searchJina(query, { excludeSites: COMMERCIAL_SITES });
}

function isOnSite(url: string, sites: string[]): boolean {
  if (sites.length === 0) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  return sites.some((site) => host === site || host.endsWith(`.${site}`));
}
