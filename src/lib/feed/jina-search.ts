/**
 * Jina Search API fetcher for news / web articles.
 *
 * Reuses the existing JINA_API_KEY from `extract.ts`.
 *
 * Docs: https://jina.ai/search
 */

import { createHash } from 'node:crypto';

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
 *
 * Returns up to `limit` results. No native dedup ID — we use a SHA-256 of
 * the URL as the external ID.
 */
export async function searchJina(
  query: string,
  { limit = 10 }: { limit?: number } = {},
): Promise<JinaSearchResult[]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) throw new Error('JINA_API_KEY is not set');

  const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
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
