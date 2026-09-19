type SummaryResponse = {
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
};

async function fetchSummary(
  title: string,
): Promise<{ extract: string; url: string } | null> {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { 'User-Agent': 'Mendel/1.0 (research-intelligence-app)' } },
  );

  if (!res.ok) return null;

  const data = (await res.json()) as SummaryResponse;
  const extract = data.extract?.trim();
  const url = data.content_urls?.desktop?.page;

  if (!extract || !url) return null;
  return { extract, url };
}

export async function fetchWikipediaExtract(
  compoundName: string,
): Promise<{ extract: string; url: string } | null> {
  const direct = await fetchSummary(compoundName);
  if (direct) return direct;

  const searchRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(compoundName)}&limit=1&format=json`,
    { headers: { 'User-Agent': 'Mendel/1.0 (research-intelligence-app)' } },
  );

  if (!searchRes.ok) return null;

  const results = (await searchRes.json()) as [string, string[]];
  const firstTitle = results[1]?.[0];
  if (!firstTitle) return null;

  return fetchSummary(firstTitle);
}
