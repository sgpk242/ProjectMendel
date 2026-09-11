import { createHash } from 'node:crypto';

import type { ExtractResult } from './types';

/** Average adult reading speed, used to estimate `readingTimeMinutes`. */
const WORDS_PER_MINUTE = 238;

type JinaResponse = {
  code: number;
  data?: {
    title?: string;
    description?: string;
    content?: string;
    url?: string;
    publishedTime?: string;
  };
};

/**
 * Fetch and extract the readable content of a URL via Jina Reader.
 *
 * Jina strips nav/ads/boilerplate and returns clean text plus whatever
 * metadata it could find. It does not reliably surface an author — that's
 * left to `classify()`, which reads the byline out of the body text.
 *
 * Uses the JSON POST form (`{ url }` in the body) rather than appending the
 * target URL to the path (`https://r.jina.ai/<url>`) — concatenating a
 * percent-encoded URL there mangles the `://` and `/` Jina needs to parse
 * out the target, which silently degrades to a 200 with no content instead
 * of an error.
 */
export async function extract(url: string): Promise<ExtractResult> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) throw new Error('JINA_API_KEY is not set');

  const response = await fetch('https://r.jina.ai/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Return-Format': 'text',
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`Jina Reader request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as JinaResponse;

  if (body.code !== 200 || !body.data) {
    throw new Error(`Jina Reader returned an error (code ${body.code})`);
  }

  const content = body.data.content?.trim();
  if (!content) {
    // A 200 with no content usually means the target itself had nothing
    // extractable — a paywall/bot-check interstitial rather than the
    // article, most often. The title, if present, is the best clue.
    const titleHint = body.data.title ? ` (page title was "${body.data.title}")` : '';
    throw new Error(`Jina Reader returned no extractable content for this URL${titleHint}`);
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
  const contentHash = createHash('sha256').update(content).digest('hex');

  return {
    title: body.data.title?.trim() || null,
    description: body.data.description?.trim() || null,
    content,
    url: body.data.url?.trim() || url,
    publishedDate: body.data.publishedTime?.trim() || null,
    wordCount,
    readingTimeMinutes,
    contentHash,
  };
}
