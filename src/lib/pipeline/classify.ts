import Anthropic from '@anthropic-ai/sdk';

import { SOURCE_TYPES, type SourceType } from '@/lib/constants';

import type { ClassifyResult, TopicSuggestion } from './types';

/** Keeps cost and latency bounded on very long articles (~$0.01/article at Sonnet pricing). */
const MAX_CONTENT_CHARS = 12_000;

const SYSTEM_PROMPT = `You are a research librarian classifying web content. Given an article's title, URL, and body text, produce a JSON object with these fields:

- "summary": 2-3 sentences summarizing the key claims and findings. Be specific — name the who, what, and so-what.
- "topics": Array of 3-7 topic tags. Each: { "name": "Topic Name", "relevanceScore": 0.0-1.0 }. Title Case. Prefer established discipline terms. Order by relevance descending.
- "sourceType": One of: "article", "paper", "blog", "linkedin_post", "report", "press_release", "other".
- "publication": The outlet name if identifiable (e.g. "Nature", "MIT Technology Review"). null if unclear.
- "author": The author's name if identifiable from byline or content. null if unclear.

Respond with ONLY valid JSON — no markdown fences, no commentary.`;

type RawClassification = {
  summary?: unknown;
  topics?: unknown;
  sourceType?: unknown;
  publication?: unknown;
  author?: unknown;
};

/**
 * Summarize and classify article content with Claude.
 *
 * Truncates to the first `MAX_CONTENT_CHARS` — plenty for a summary and
 * topic tags, and keeps cost/latency predictable on long-form pieces.
 */
export async function classify(
  title: string | null,
  content: string,
  url: string,
): Promise<ClassifyResult> {
  const client = new Anthropic();
  const truncated = content.slice(0, MAX_CONTENT_CHARS);

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Title: ${title ?? '(unknown)'}\nURL: ${url}\n\n${truncated}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );
  if (!textBlock) throw new Error('Claude returned no text content for classification');

  const parsed = parseClassification(textBlock.text);
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

  return { summary, topics, sourceType, publication, author };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
