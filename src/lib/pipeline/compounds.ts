import Groq from 'groq-sdk';

import {
  COMPOUND_MARKETS,
  COMPOUND_MARKET_DEFINITIONS,
  SOURCE_TYPE_LABELS,
  type CompoundMarket,
  type SourceType,
} from '@/lib/constants';

import type { CompoundSuggestion } from './types';

const MODEL = 'openai/gpt-oss-120b';

/**
 * Upper bound on the text sent per Groq call (~4K tokens). Small enough to
 * stay well inside a free-tier tokens-per-minute budget per request, large
 * enough that a typical press release or news piece is a single batch.
 */
const BATCH_CHARS = 16_000;

/**
 * Parallel Groq calls per source. Groq's limits are mostly tokens/minute, so
 * more parallelism mostly means more 429s; the client's retries (which
 * honour `retry-after`) absorb what this lets through.
 */
const CONCURRENCY = 2;

/**
 * End-matter headings only count after this fraction of the document, so an
 * early "About this study" or "Contact" heading can't cut off the body.
 */
const END_MATTER_MIN_FRACTION = 0.4;

/**
 * Headings that start end matter, checked for every source type since the
 * classifier's source type can be wrong. Matched against the whole
 * normalized heading text (see `parseHeading()`).
 */
const END_MATTER_HEADINGS: RegExp[] = [
  // Papers / reports
  /^(references|reference list|bibliography|works cited|literature cited|citations|notes and references|acknowledge?ments?)$/,
  /^(cautionary (note|statement) )?(regarding )?forward[- ]looking statements?$/,
  /^safe harbou?r( statement)?$/,
  /^((media|press|investor|company) )?(contacts?|relations|inquiries|enquiries)$/,
  // News / blogs
  /^(related|more|recommended|popular|trending|latest)( articles| stories| posts| news| content| reading)?$/,
  /^(more from .{1,60}|read next|read more|you may also like|further reading|subscribe.*|sign up.*|comments?|share this.*|tags?)$/,
];

/**
 * Press releases: "About {Company}" lists the company's whole portfolio in
 * every release and would inflate compound counts across sources. Checked
 * separately because a plain short line starting with "about" is often
 * body text ("About two weeks later") — it only counts as a heading when
 * marked up as one or written in Title Case.
 */
const ABOUT_HEADING = /^about [\p{L}\p{N}&.,'’\- ]{2,60}$/u;

/** One stored chunk, as `extractCompounds()` needs it. */
export type ChunkSpan = {
  index: number;
  content: string;
  startChar: number | null;
  endChar: number | null;
};

export type ExtractCompoundsResult = {
  compounds: CompoundSuggestion[];
  batchCount: number;
  /** Error messages from batches that failed after retries (others still count). */
  failedBatches: string[];
};

type Batch = {
  text: string;
  chunkIndexes: number[];
};

const SYSTEM_PROMPT = `You extract biomanufacturing compounds and products from one excerpt of a longer document. The document may be a scientific paper, company press release, white paper, news article, report, or blog post. The excerpt is split into passages, each starting with a marker like [[chunk 12]].

Return a JSON object: { "compounds": [ ... ] }. Each compound:
{ "name": string, "aliases": string[], "description": string, "context": string, "relevanceScore": number 0.0-1.0, "chunkIndex": number, "market": "industrial" | "pharma" | "both" }

Rules:
- Only use the document's own substantive content: for papers, the introduction, methods, results and discussion; for press releases, news, white papers and blogs, the announcement or analysis itself.
- Ignore end matter and page furniture: reference/bibliography lists and the titles of cited works, "About {Company}" boilerplate, forward-looking-statement disclaimers, contact details, navigation menus, related-article links, ads and subscription prompts.
- Only include compounds or products that could realistically be produced through biological manufacturing (fermentation, precision fermentation, enzymatic synthesis, metabolic engineering, cell culture, etc.). List every one discussed; do not cap the count.
- "name": the full common name of the generic compound, never an abbreviation (e.g. "rebaudioside M", not "Reb M"; "2'-fucosyllactose", not "2'-FL"). For a branded or trade-name product, use the underlying compound or ingredient as the name and put the brand in aliases. If no underlying compound is identifiable (e.g. a proprietary blend), use the product name.
- "aliases": abbreviations, brand or trade names, and other names the text uses for it. Empty array if none.
- "description": what it is and why it matters for biomanufacturing, in one sentence.
- "context": a short quote or close paraphrase of where the text discusses it.
- "chunkIndex": the number from the [[chunk N]] marker of the passage that context comes from.
- "market": the compound's main commercial market in general, not just in this document. "industrial" = ${COMPOUND_MARKET_DEFINITIONS.industrial}; "pharma" = ${COMPOUND_MARKET_DEFINITIONS.pharma}; "both" = ${COMPOUND_MARKET_DEFINITIONS.both}.
- If there are none, return { "compounds": [] }.

Respond with ONLY valid JSON — no markdown fences, no commentary.`;

/**
 * Extract biomanufacturing compounds from a source's full text.
 *
 * Works from the stored chunks: drops end matter (references, press-release
 * boilerplate, related-article lists) and link-only chunks, groups the rest
 * into consecutive batches of up to `BATCH_CHARS`, sends each batch to Groq
 * with `[[chunk N]]` markers so every compound can be traced to its chunk,
 * then merges results across batches by normalized name.
 */
export async function extractCompounds(
  fullText: string,
  chunks: ChunkSpan[],
  sourceType: SourceType,
  title: string | null,
): Promise<ExtractCompoundsResult> {
  const kept = selectBodyChunks(fullText, chunks);
  const batches = buildBatches(fullText, kept, endMatterCutoff(fullText));
  if (batches.length === 0) return { compounds: [], batchCount: 0, failedBatches: [] };

  const client = new Groq({ maxRetries: 6, timeout: 120_000 });
  const header = `Document title: ${title ?? '(unknown)'}\nSource type: ${SOURCE_TYPE_LABELS[sourceType]}`;

  const failedBatches: string[] = [];
  const results = await mapWithConcurrency(batches, CONCURRENCY, async (batch, i) => {
    try {
      return await extractFromBatch(client, header, batch);
    } catch (err) {
      failedBatches.push(`batch ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  });

  if (failedBatches.length === batches.length) {
    throw new Error(`Compound extraction failed for every batch — ${failedBatches[0]}`);
  }

  return { compounds: mergeCompounds(results.flat()), batchCount: batches.length, failedBatches };
}

async function extractFromBatch(
  client: Groq,
  header: string,
  batch: Batch,
): Promise<CompoundSuggestion[]> {
  const response = await client.chat.completions.create({
    model: MODEL,
    // gpt-oss is a reasoning model; its hidden reasoning tokens count
    // against this too, and a compound-dense batch can list dozens.
    max_tokens: 6144,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${header}\n\n${batch.text}` },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('Groq returned no content');

  const parsed = parseJsonObject(text);
  const raw = (parsed as { compounds?: unknown }).compounds;
  if (!Array.isArray(raw)) return [];

  const validIndexes = new Set(batch.chunkIndexes);
  const fallbackIndex = batch.chunkIndexes[0];

  return raw
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => {
      const chunkIndex =
        typeof c.chunkIndex === 'number' && validIndexes.has(c.chunkIndex)
          ? c.chunkIndex
          : fallbackIndex;
      return {
        name: typeof c.name === 'string' ? c.name.trim() : '',
        aliases: Array.isArray(c.aliases)
          ? c.aliases.filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean)
          : [],
        description: typeof c.description === 'string' ? c.description.trim() : '',
        context: typeof c.context === 'string' ? c.context.trim() : '',
        relevanceScore: clamp01(typeof c.relevanceScore === 'number' ? c.relevanceScore : 0.5),
        chunkIndex,
        market: COMPOUND_MARKETS.includes(c.market as CompoundMarket) ? (c.market as CompoundMarket) : null,
      };
    })
    .filter((c) => c.name.length > 0);
}

/**
 * Character offset where end matter starts, or `fullText.length` if none is
 * found: the earliest end-matter heading past `END_MATTER_MIN_FRACTION`.
 */
export function endMatterCutoff(fullText: string): number {
  const minOffset = Math.floor(fullText.length * END_MATTER_MIN_FRACTION);
  const lineRe = /^.*$/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(fullText)) !== null) {
    if (match[0].length === 0) {
      lineRe.lastIndex++;
      continue;
    }
    if (match.index < minOffset) continue;
    const heading = parseHeading(match[0]);
    if (heading && isEndMatterHeading(heading)) return match.index;
  }
  return fullText.length;
}

type Heading = { text: string; marked: boolean; titleCase: boolean };

/**
 * If a line looks like a heading — a markdown `#` heading, a fully bold
 * line, or a short standalone line — return its lowercased text without
 * markup or a trailing colon; otherwise null.
 */
function parseHeading(line: string): Heading | null {
  const trimmed = line.trim();
  const marked = /^#{1,6}\s+/.test(trimmed) || /^(\*\*|__).+(\*\*|__):?$/.test(trimmed);
  const original = trimmed
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(\*\*|__)|(\*\*|__)(?=:?$)/g, '')
    .replace(/:$/, '')
    .trim();
  const words = original.split(/\s+/);
  const isShortLine = words.length <= 6 && !/[.!?]$/.test(original);
  if (!original || !(marked || isShortLine)) return null;
  const titleCase = words.every((w) => !/^\p{Ll}/u.test(w));
  return { text: original.toLowerCase(), marked, titleCase };
}

function isEndMatterHeading(h: Heading): boolean {
  if (END_MATTER_HEADINGS.some((re) => re.test(h.text))) return true;
  return ABOUT_HEADING.test(h.text) && (h.marked || h.titleCase);
}

/** Drops chunks that are mostly markdown links (nav menus, related-link lists). */
function selectBodyChunks(fullText: string, chunks: ChunkSpan[]): ChunkSpan[] {
  const cutoff = endMatterCutoff(fullText);
  return [...chunks]
    .sort((a, b) => a.index - b.index)
    .filter((c) => c.startChar === null || c.startChar < cutoff)
    .filter((c) => !isLinkList(c.content));
}

function isLinkList(content: string): boolean {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const linkOnly = /^([-*+]\s+|\d+\.\s+)?!?\[[^\]]*\]\([^)]*\)\W*$/;
  const linkLines = lines.filter((l) => linkOnly.test(l)).length;
  return linkLines / lines.length > 0.6;
}

/**
 * Group chunks into batches of up to `BATCH_CHARS`. Each chunk contributes
 * only the text past the previous chunk's end (chunks overlap by a
 * paragraph), clipped at the end-matter cutoff.
 */
function buildBatches(fullText: string, chunks: ChunkSpan[], cutoff: number): Batch[] {
  const batches: Batch[] = [];
  let current: Batch = { text: '', chunkIndexes: [] };
  let prevEnd = 0;

  for (const chunk of chunks) {
    let segment: string;
    if (chunk.startChar !== null && chunk.endChar !== null) {
      const start = Math.max(chunk.startChar, prevEnd);
      const end = Math.min(chunk.endChar, cutoff);
      segment = end > start ? fullText.slice(start, end).trim() : '';
      prevEnd = Math.max(prevEnd, chunk.endChar);
    } else {
      segment = chunk.content.trim();
    }
    if (!segment) continue;

    const piece = `[[chunk ${chunk.index}]]\n${segment}\n\n`;
    if (current.text.length > 0 && current.text.length + piece.length > BATCH_CHARS) {
      batches.push(current);
      current = { text: '', chunkIndexes: [] };
    }
    current.text += piece;
    current.chunkIndexes.push(chunk.index);
  }

  if (current.text.length > 0) batches.push(current);
  return batches;
}

/**
 * Merge per-batch results by normalized name: keep the highest relevance
 * (with that hit's context and chunk), the longest description, and the
 * union of aliases.
 */
function mergeCompounds(all: CompoundSuggestion[]): CompoundSuggestion[] {
  const byName = new Map<string, CompoundSuggestion>();
  for (const c of all) {
    const key = c.name.toLowerCase().replace(/\s+/g, ' ').trim();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, { ...c, aliases: dedupeStrings(c.aliases) });
      continue;
    }
    const best = c.relevanceScore > prev.relevanceScore ? c : prev;
    byName.set(key, {
      name: prev.name,
      aliases: dedupeStrings([...prev.aliases, ...c.aliases]),
      description: c.description.length > prev.description.length ? c.description : prev.description,
      context: best.context,
      relevanceScore: best.relevanceScore,
      chunkIndex: best.chunkIndex,
      market: mergeMarkets(prev.market, c.market),
    });
  }
  return [...byName.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/** Batches disagreeing (industrial vs pharma) means the compound serves both. */
export function mergeMarkets(a: CompoundMarket | null, b: CompoundMarket | null): CompoundMarket | null {
  if (!a) return b;
  if (!b || a === b) return a;
  return 'both';
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Parse a JSON object, tolerating stray text around it. */
function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Groq response was not valid JSON');
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      throw new Error('Groq response was not valid JSON');
    }
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
