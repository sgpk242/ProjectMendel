import type { SupabaseClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

import { FEED_SIGNALS, FEED_SIGNAL_DEFINITIONS, type FeedSignal } from '@/lib/constants';
import type { Database } from '@/lib/types/database';

/**
 * Classifies feed items by the commercial signal they most likely carry
 * (funding, partnership, acquisition…), from the title and snippet only, so
 * deal articles that name no compound still stand out in the feed.
 */

const MODEL = 'openai/gpt-oss-120b';

/**
 * Items per Groq request. 20 titles + ~600-char snippets is ~4K input
 * tokens; with `max_tokens` that stays under the free tier's 8000
 * tokens-per-minute limit on a single request.
 */
export const SIGNAL_BATCH_SIZE = 20;
const SNIPPET_CHARS = 600;
const MAX_TOKENS = 2500;

/** Most items classified per feed refresh, to keep a refresh quick. */
export const SIGNAL_MAX_PER_REFRESH = 60;

const SYSTEM_PROMPT = `You triage news for an analyst tracking the commercial biomanufacturing industry (fermentation, precision fermentation, synthetic biology; food ingredients, chemicals, materials, pharma starting materials). For each item (title + snippet), pick the ONE signal that is most likely the reason the analyst would read it:
${FEED_SIGNALS.map((s) => `- "${s}": ${FEED_SIGNAL_DEFINITIONS[s]}`).join('\n')}

When an item fits several, pick the most commercially specific (e.g. a partnership that includes a supply contract is "offtake_supply"; a funding round to build a plant is "funding").
Also write "note": at most 15 words saying what happened, naming the companies and product, e.g. "Oobli and Ingredion partner to scale sweet proteins for beverages".

Return JSON: { "items": { "<id>": { "signal": "<signal>", "note": "<note>" } } }. Respond with ONLY valid JSON.`;

export type FeedItemForSignal = { id: string; title: string; abstract: string | null };
export type SignalResult = { signal: FeedSignal; note: string | null };

/** Build the user message, keyed by short ids ("1", "2"…) to save tokens. */
export function buildSignalInput(items: FeedItemForSignal[]): string {
  return JSON.stringify(
    items.map((item, i) => ({
      id: String(i + 1),
      title: item.title,
      snippet: (item.abstract ?? '').slice(0, SNIPPET_CHARS),
    })),
  );
}

/**
 * Parse the model's reply into results keyed by feed item id. Unknown
 * signals and ids are dropped, so a bad reply leaves those items
 * unclassified rather than mislabelled.
 */
export function parseSignalReply(
  text: string,
  items: FeedItemForSignal[],
): Map<string, SignalResult> {
  const results = new Map<string, SignalResult>();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return results;

  let parsed: { items?: Record<string, { signal?: unknown; note?: unknown }> };
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return results;
  }

  for (const [key, value] of Object.entries(parsed.items ?? {})) {
    const item = items[Number(key) - 1];
    const signal = value?.signal;
    if (!item || typeof signal !== 'string' || !(FEED_SIGNALS as readonly string[]).includes(signal)) {
      continue;
    }
    const note = typeof value.note === 'string' && value.note.trim() ? value.note.trim().slice(0, 200) : null;
    results.set(item.id, { signal: signal as FeedSignal, note });
  }
  return results;
}

/** Classify one batch with a single Groq call. */
export async function classifySignals(items: FeedItemForSignal[]): Promise<Map<string, SignalResult>> {
  if (items.length === 0) return new Map();
  const client = new Groq({ maxRetries: 6, timeout: 120_000 });
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    reasoning_effort: 'low',
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildSignalInput(items) },
    ],
  });
  return parseSignalReply(response.choices[0]?.message?.content ?? '', items);
}

/**
 * Classify the user's unclassified feed items that are still to be read
 * (new or reviewed), newest first, up to `SIGNAL_MAX_PER_REFRESH`. Covers
 * items added by this refresh and any stored before classification existed.
 * Returns how many were classified.
 */
export async function classifyPendingFeedItems(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { data, error } = await supabase
    .from('feed_items')
    .select('id, title, abstract')
    .is('signal_type', null)
    .in('status', ['new', 'reviewed'])
    .order('fetched_at', { ascending: false })
    .limit(SIGNAL_MAX_PER_REFRESH);
  if (error) throw new Error(`Failed to load feed items: ${error.message}`);

  const items = data ?? [];
  let classified = 0;
  for (let i = 0; i < items.length; i += SIGNAL_BATCH_SIZE) {
    const batch = items.slice(i, i + SIGNAL_BATCH_SIZE);
    const results = await classifySignals(batch);
    for (const [id, { signal, note }] of results) {
      const { error: updateError } = await supabase
        .from('feed_items')
        .update({ signal_type: signal, signal_note: note })
        .eq('id', id);
      if (updateError) throw new Error(`Failed to save signal: ${updateError.message}`);
      classified++;
    }
  }
  return classified;
}
