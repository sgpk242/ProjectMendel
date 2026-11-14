import type { SupabaseClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

import {
  COMPOUND_MARKETS,
  COMPOUND_MARKET_DEFINITIONS,
  type CompoundMarket,
} from '@/lib/constants';
import type { Database } from '@/lib/types/database';

const MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `You tag biomanufactured compounds by their main commercial market. For each compound in the input list, return its market:
- "industrial": ${COMPOUND_MARKET_DEFINITIONS.industrial}
- "pharma": ${COMPOUND_MARKET_DEFINITIONS.pharma}
- "both": ${COMPOUND_MARKET_DEFINITIONS.both}

Judge the compound's market in general, using the description only as a hint. Return a JSON object mapping each input id to its market, e.g. { "markets": { "<id>": "industrial" } }. Respond with ONLY valid JSON.`;

/**
 * Tag the next `limit` untagged compounds (market null) with one Groq call,
 * for the /maintenance backfill. Returns how many were tagged and how many
 * untagged compounds remain.
 */
export async function tagNextMarkets(
  supabase: SupabaseClient<Database>,
  limit: number,
): Promise<{ tagged: number; remaining: number }> {
  const { data: rows, error } = await supabase
    .from('product_ideas')
    .select('id, name, description')
    .is('market', null)
    .order('created_at');
  if (error) throw new Error(`Failed to load compounds: ${error.message}`);

  const batch = (rows ?? []).slice(0, limit);
  if (batch.length === 0) return { tagged: 0, remaining: 0 };

  const client = new Groq({ maxRetries: 6, timeout: 120_000 });
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(
          batch.map((r) => ({ id: r.id, name: r.name, description: r.description ?? '' })),
        ),
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Groq response was not valid JSON');
  const parsed = JSON.parse(text.slice(start, end + 1)) as { markets?: Record<string, unknown> };
  const markets = parsed.markets ?? {};

  let tagged = 0;
  for (const market of COMPOUND_MARKETS) {
    const ids = batch.map((r) => r.id).filter((id) => markets[id] === market);
    if (ids.length === 0) continue;
    const { error: updateError } = await supabase
      .from('product_ideas')
      .update({ market: market as CompoundMarket })
      .in('id', ids)
      .is('market', null);
    if (updateError) throw new Error(`Failed to tag compounds: ${updateError.message}`);
    tagged += ids.length;
  }

  // Anything the model skipped stays untagged; if a whole batch comes back
  // empty, stop rather than loop on the same rows forever.
  if (tagged === 0) throw new Error('The model returned no usable tags for this batch');

  return { tagged, remaining: (rows?.length ?? 0) - tagged };
}
