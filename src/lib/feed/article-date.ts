/**
 * Finds a web search result's publish date. An individual article has one;
 * evergreen pages (company pages, product pages, about pages) usually don't,
 * so results without a date are left out of the feed.
 *
 * Checked in order: date fields the search API returned, a date in the URL
 * (`/2026/03/02/`, Business Wire's `/20260302005123/`), then the first date
 * written out near the top of the page text (the byline).
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_NAME =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

/** "March 2, 2026" / "Mar. 2 2026" */
const MONTH_DAY_YEAR = new RegExp(`\\b${MONTH_NAME}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+((?:19|20)\\d{2})\\b`, 'i');
/** "2 March 2026" */
const DAY_MONTH_YEAR = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_NAME},?\\s+((?:19|20)\\d{2})\\b`, 'i');
/** "2026-03-02" */
const ISO_DATE = /\b((?:19|20)\d{2})-(\d{2})-(\d{2})(?!\d)/;

/** How far into the page text to look for a byline date. */
const CONTENT_LEAD_CHARS = 4000;

export function findPublishedDate({
  fields = [],
  url,
  content,
}: {
  fields?: (string | null | undefined)[];
  url: string;
  content?: string | null;
}): string | null {
  for (const field of fields) {
    const date = field ? parseDateText(field) : null;
    if (date) return date;
  }
  return dateFromUrl(url) ?? (content ? parseDateText(content.slice(0, CONTENT_LEAD_CHARS)) : null);
}

/** The first date written in `text`, as YYYY-MM-DD. */
export function parseDateText(text: string): string | null {
  const candidates: { index: number; date: string | null }[] = [];

  const iso = ISO_DATE.exec(text);
  if (iso) candidates.push({ index: iso.index, date: toIso(+iso[1], +iso[2], +iso[3]) });

  const mdy = MONTH_DAY_YEAR.exec(text);
  if (mdy) candidates.push({ index: mdy.index, date: toIso(+mdy[3], monthNumber(mdy[1]), +mdy[2]) });

  const dmy = DAY_MONTH_YEAR.exec(text);
  if (dmy) candidates.push({ index: dmy.index, date: toIso(+dmy[3], monthNumber(dmy[2]), +dmy[1]) });

  const first = candidates.filter((c) => c.date).sort((a, b) => a.index - b.index)[0];
  return first?.date ?? null;
}

function dateFromUrl(url: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }

  const ymd = /\/((?:19|20)\d{2})[/-](\d{1,2})[/-](\d{1,2})(?=[/-]|$)/.exec(path);
  if (ymd) return toIso(+ymd[1], +ymd[2], +ymd[3]);

  // Business Wire: /news/home/20260302005123/en/
  const stamp = /\/((?:19|20)\d{2})(\d{2})(\d{2})\d{6}(?=\/|$)/.exec(path);
  if (stamp) return toIso(+stamp[1], +stamp[2], +stamp[3]);

  // Year and month only: /2026/03/slug
  const ym = /\/((?:19|20)\d{2})\/(\d{1,2})\//.exec(path);
  if (ym) return toIso(+ym[1], +ym[2], 1);

  return null;
}

function monthNumber(name: string): number {
  return MONTHS[name.toLowerCase().slice(0, 3)] ?? 0;
}

function toIso(year: number, month: number, day: number): string | null {
  const thisYear = new Date().getUTCFullYear();
  if (year < 1990 || year > thisYear + 1 || month < 1 || month > 12 || day < 1) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null; // e.g. Feb 31
  return d.toISOString().slice(0, 10);
}
