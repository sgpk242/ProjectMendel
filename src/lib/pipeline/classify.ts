import Groq from 'groq-sdk';

import { SOURCE_TYPES, type SourceType } from '@/lib/constants';

import type { ClassifyResult, CompoundSuggestion, TopicSuggestion } from './types';

/** Keeps cost and latency bounded on very long articles. */
const MAX_CONTENT_CHARS = 12_000;

// `llama-3.3-70b-versatile` (the original choice here) isn't on every Groq
// account's model list — Groq's catalog varies by account/region and
// changes over time. Pick a model your key actually has access to via
// `client.models.list()`; gpt-oss-120b is the largest general-purpose
// (non-agentic, non-audio) chat model on this project's account.
const MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `You are a research librarian classifying web content. Given an article's title, URL, and body text, produce a JSON object with these fields:

- "summary": 2-3 sentences summarizing the key claims and findings. Be specific — name the who, what, and so-what.
- "topics": Array of 3-7 topic tags. Each: { "name": "Topic Name", "relevanceScore": 0.0-1.0 }. Title Case. Prefer established discipline terms. Order by relevance descending.
- "sourceType": One of: "article", "paper", "blog", "linkedin_post", "report", "press_release", "other".
- "publication": The outlet name if identifiable (e.g. "Nature", "MIT Technology Review"). null if unclear.
- "author": The author's name if identifiable from byline or content. null if unclear.
- "compounds": Array of ALL potential biomanufacturing chemical compounds or products discussed in the main body text (introduction, methods, results, discussion) — do not cap the count, and do not omit one for the sake of brevity. Only pull from the article's own body text, never from the titles or subject matter of works in a references/bibliography/citations list — a compound mentioned only because it appears in a cited paper's title does not count. Each: { "name": "Compound Name", "description": "Brief description of what it is and its biomanufacturing relevance", "context": "Brief quote or paraphrase of where this compound is discussed in the body text", "relevanceScore": 0.0-1.0 }. Only include compounds that could realistically be produced through biological manufacturing (fermentation, enzymatic synthesis, metabolic engineering, etc.). Return an empty array if none are relevant.

Respond with ONLY valid JSON — no markdown fences, no commentary.`;

type RawClassification = {
  summary?: unknown;
  topics?: unknown;
  sourceType?: unknown;
  publication?: unknown;
  author?: unknown;
  compounds?: unknown;
};

/**
 * Summarize and classify article content with Groq (Llama 3.3 70B).
 *
 * Truncates to the first `MAX_CONTENT_CHARS` — plenty for a summary and
 * topic tags, and keeps cost/latency predictable on long-form pieces.
 */
export async function classify(
  title: string | null,
  content: string,
  url: string,
): Promise<ClassifyResult> {
  const client = new Groq();
  const truncated = content.slice(0, MAX_CONTENT_CHARS);

  const response = await client.chat.completions.create({
    model: MODEL,
    // Uncapped compound extraction means the response can run long on
    // compound-dense papers — 1024 was tuned for summary+topics alone and
    // would silently truncate the compounds array mid-JSON on those.
    max_tokens: 4096,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Title: ${title ?? '(unknown)'}\nURL: ${url}\n\n${truncated}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('Groq returned no text content for classification');

  const parsed = parseClassification(text);
  return normalize(parsed);
}

/** Parse Claude's JSON, tolerating stray text around the object. */
function parseClassification(text: string): RawClassification {
  try {
    return JSON.parse(text) as RawClassification;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Claude classification response was not valid JSON');
    }
    try {
      return JSON.parse(text.slice(start, end + 1)) as RawClassification;
    } catch {
      throw new Error('Claude classification response was not valid JSON');
    }
  }
}

/** Validate and coerce the parsed response into a well-formed ClassifyResult. */
function normalize(raw: RawClassification): ClassifyResult {
  const summary = typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : '';

  const topics: TopicSuggestion[] = Array.isArray(raw.topics)
    ? raw.topics
        .filter(
          (t): t is { name: unknown; relevanceScore: unknown } =>
            typeof t === 'object' && t !== null,
        )
        .map((t) => ({
          name: typeof t.name === 'string' ? t.name.trim() : '',
          relevanceScore: clamp01(typeof t.relevanceScore === 'number' ? t.relevanceScore : 0.5),
        }))
        .filter((t) => t.name.length > 0)
    : [];

  const sourceType: SourceType = SOURCE_TYPES.includes(raw.sourceType as SourceType)
    ? (raw.sourceType as SourceType)
    : 'article';

  const publication =
    typeof raw.publication === 'string' && raw.publication.trim() ? raw.publication.trim() : null;

  const author = typeof raw.author === 'string' && raw.author.trim() ? raw.author.trim() : null;

  const compounds: CompoundSuggestion[] = Array.isArray(raw.compounds)
    ? raw.compounds
        .filter(
          (c): c is { name: unknown; description: unknown; context: unknown; relevanceScore: unknown } =>
            typeof c === 'object' && c !== null,
        )
        .map((c) => ({
          name: typeof c.name === 'string' ? c.name.trim() : '',
          description: typeof c.description === 'string' ? c.description.trim() : '',
          context: typeof c.context === 'string' ? c.context.trim() : '',
          relevanceScore: clamp01(typeof c.relevanceScore === 'number' ? c.relevanceScore : 0.5),
        }))
        .filter((c) => c.name.length > 0)
    : [];

  return { summary, topics, sourceType, publication, author, compounds };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
