import { normalizeName } from '@/lib/pubchem';

/**
 * Wikipedia descriptions for compounds, matched strictly: a page is used
 * only when it is the article (or a redirect) for one of the compound's own
 * names. Wikipedia's search was used as a fallback before and took the top
 * hit, which turned the brand "Sweelin" into the composer Sweelinck.
 */

type SummaryResponse = {
  type?: string;
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
};

const HEADERS = { 'User-Agent': 'Mendel/1.0 (research-intelligence-app)' };

/**
 * The summary of the page titled `title` (Wikipedia follows redirects, which
 * editors curate, so "Reb M" style redirects are fine). Disambiguation pages
 * are rejected.
 */
async function fetchSummary(title: string): Promise<{ title: string; extract: string; url: string } | null> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    headers: HEADERS,
  });
  if (!res.ok) return null;

  const data = (await res.json()) as SummaryResponse;
  const extract = data.extract?.trim();
  const url = data.content_urls?.desktop?.page;
  if (!extract || !url || data.type === 'disambiguation') return null;
  return { title: data.title ?? title, extract, url };
}

/**
 * The Wikipedia extract for the first of `names` that has its own article.
 * Brand names should not be passed: a brand rarely has an article, and a
 * near-miss title is exactly the failure this avoids. Search results are
 * accepted only when their title equals one of the names.
 */
export async function fetchWikipediaExtract(names: string[]): Promise<{ extract: string; url: string } | null> {
  const wanted = names.map(normalizeName).filter(Boolean);
  if (wanted.length === 0) return null;

  for (const name of names) {
    const direct = await fetchSummary(name);
    if (direct) return { extract: direct.extract, url: direct.url };
  }

  for (const name of names) {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=5&format=json`,
      { headers: HEADERS },
    );
    if (!res.ok) continue;
    const titles = ((await res.json()) as [string, string[]])[1] ?? [];
    const exact = titles.find((t) => wanted.includes(normalizeName(t)));
    if (!exact) continue;
    const summary = await fetchSummary(exact);
    if (summary) return { extract: summary.extract, url: summary.url };
  }

  return null;
}
