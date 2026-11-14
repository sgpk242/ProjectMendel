/**
 * Jina Search API fetcher for news / web articles.
 *
 * Reuses the existing JINA_API_KEY from `extract.ts`.
 *
 * Docs: https://jina.ai/search
 */

import { createHash } from 'node:crypto';

import { COMMERCIAL_QUERY_TERMS, COMMERCIAL_SITES } from './commercial-sites';

export type JinaSearchResult = {
  externalId: string;
  title: string;
  authors: string | null;
  abstract: string | null;
  url: string;
  publishedDate: string | null;
};

type JinaSearchResponse = {
  data?: {
    title?: string;
    url?: string;
    description?: string;
    content?: string;
  }[];
};

/**
 * Search the web via Jina Search for news and articles matching `query`.
 * `sites` restricts results to those domains (Jina's repeated `site=`
 * parameter).
 *
 * Returns up to `limit` results. No native dedup ID — we use a SHA-256 of
 * the URL as the external ID.
 */
export async function searchJina(
  query: string,
  { limit = 10, sites = [] }: { limit?: number; sites?: string[] } = {},
): Promise<JinaSearchResult[]> {
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

  return (body.data ?? [])
    .filter((item) => item.title && item.url)
    .slice(0, limit)
    .map((item) => ({
      externalId: createHash('sha256').update(item.url!).digest('hex'),
      title: item.title!,
      authors: null, // Jina Search doesn't reliably surface author info
      abstract: item.description?.trim() || null,
      url: item.url!,
      publishedDate: null, // Not reliably available from Jina Search
    }));
}

/**
 * Search only press-release wires and trade publications
 * (`COMMERCIAL_SITES`), with deal-related terms added to the query.
 */
export function searchCommercial(query: string): Promise<JinaSearchResult[]> {
  const fullQuery = COMMERCIAL_QUERY_TERMS ? `${query} ${COMMERCIAL_QUERY_TERMS}` : query;
  return searchJina(fullQuery, { sites: COMMERCIAL_SITES });
}
