/**
 * OpenAlex Works API fetcher.
 *
 * Free, no API key required. We send a polite `mailto` header to get higher
 * rate limits (OpenAlex's "polite pool").
 *
 * Docs: https://docs.openalex.org/api-entities/works
 */

export type OpenAlexResult = {
  externalId: string;
  title: string;
  authors: string | null;
  abstract: string | null;
  url: string;
  publishedDate: string | null;
};

type OpenAlexWork = {
  id: string;
  title?: string;
  authorships?: { author?: { display_name?: string } }[];
  abstract_inverted_index?: Record<string, number[]>;
  doi?: string;
  primary_location?: { landing_page_url?: string };
  publication_date?: string;
};

type OpenAlexResponse = {
  results?: OpenAlexWork[];
};

/**
 * Reconstruct an abstract from OpenAlex's inverted-index format.
 *
 * The index maps each word to its position(s) in the abstract. We invert it
 * back to position → word, then join.
 */
function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  const words: [number, string][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([pos, word]);
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map(([, w]) => w).join(' ');
}

/**
 * Search OpenAlex for recent academic papers matching `query`.
 *
 * Returns up to `limit` results published in the last `daysBack` days.
 */
export async function searchOpenAlex(
  query: string,
  { limit = 25, daysBack = 7 }: { limit?: number; daysBack?: number } = {},
): Promise<OpenAlexResult[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const fromDate = since.toISOString().slice(0, 10); // YYYY-MM-DD

  const params = new URLSearchParams({
    search: query,
    filter: `from_publication_date:${fromDate}`,
    sort: 'relevance_score:desc',
    per_page: String(limit),
  });

  const res = await fetch(`https://api.openalex.org/works?${params}`, {
    headers: {
      'User-Agent': 'Mendel/1.0 (mailto:sgpk242@gmail.com)',
    },
  });

  if (!res.ok) {
    throw new Error(`OpenAlex API error: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as OpenAlexResponse;

  return (body.results ?? [])
    .filter((w) => w.title)
    .map((w) => {
      const firstAuthor = w.authorships?.[0]?.author?.display_name ?? null;
      const abstract = w.abstract_inverted_index
        ? reconstructAbstract(w.abstract_inverted_index)
        : null;
      const url =
        (w.doi ? `https://doi.org/${w.doi.replace('https://doi.org/', '')}` : null) ??
        w.primary_location?.landing_page_url ??
        w.id;

      return {
        externalId: w.id, // e.g. "https://openalex.org/W1234567890"
        title: w.title!,
        authors: firstAuthor,
        abstract,
        url,
        publishedDate: w.publication_date ?? null,
      };
    });
}
