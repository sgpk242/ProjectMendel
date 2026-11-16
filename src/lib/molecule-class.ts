import type { SupabaseClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

import { MOLECULE_CLASSES, MOLECULE_CLASS_DEFINITIONS, type MoleculeClass } from '@/lib/constants';
import type { Database } from '@/lib/types/database';

const MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `You classify biomanufactured compounds and products by molecule category. For each item (id, name, other names, description), return one category:
${MOLECULE_CLASSES.map((c) => `- "${c}": ${MOLECULE_CLASS_DEFINITIONS[c]}`).join('\n')}

Brand names are products: classify the molecule behind the brand (e.g. a sweet-protein brand is "protein"). Return a JSON object mapping each id to its category, e.g. { "classes": { "<id>": "protein" } }. Respond with ONLY valid JSON.`;

/** Parse the model's reply into id → class, dropping unknown classes and ids. */
export function parseClassReply(text: string, ids: string[]): Map<string, MoleculeClass> {
  const result = new Map<string, MoleculeClass>();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return result;
  let parsed: { classes?: Record<string, unknown> };
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return result;
  }
  const known = new Set(ids);
  for (const [id, value] of Object.entries(parsed.classes ?? {})) {
    if (known.has(id) && MOLECULE_CLASSES.includes(value as MoleculeClass)) result.set(id, value as MoleculeClass);
  }
  return result;
}

/**
 * Classify the next `limit` compounds with no molecule category, with one
 * Groq call, for the /maintenance backfill. Same shape as `tagNextMarkets()`.
 */
export async function classifyNextMolecules(
  supabase: SupabaseClient<Database>,
  limit: number,
): Promise<{ classified: number; remaining: number }> {
  const { data: rows, error } = await supabase
    .from('product_ideas')
    .select('id, name, description')
    .is('molecule_class', null)
    .order('created_at');
  if (error) throw new Error(`Failed to load compounds: ${error.message}`);

  const batch = (rows ?? []).slice(0, limit);
  if (batch.length === 0) return { classified: 0, remaining: 0 };

  const { data: aliases } = await supabase
    .from('product_aliases')
    .select('product_idea_id, alias')
    .in(
      'product_idea_id',
      batch.map((r) => r.id),
    )
    .neq('kind', 'pubchem');

  const client = new Groq({ maxRetries: 6, timeout: 120_000 });
  const response = await client.chat.completions.create({
    model: MODEL,
    // Input + max_tokens must fit Groq's per-minute token limit (8000 on the
    // free tier); 40 id→class pairs need far less than this.
    max_tokens: 2500,
    reasoning_effort: 'low',
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(
          batch.map((r) => ({
            id: r.id,
            name: r.name,
            otherNames: (aliases ?? [])
              .filter((a) => a.product_idea_id === r.id && a.alias !== r.name)
              .map((a) => a.alias)
              .slice(0, 5),
            description: (r.description ?? '').slice(0, 300),
          })),
        ),
      },
    ],
  });

  const classes = parseClassReply(
    response.choices[0]?.message?.content ?? '',
    batch.map((r) => r.id),
  );

  let classified = 0;
  for (const moleculeClass of MOLECULE_CLASSES) {
    const ids = [...classes].filter(([, c]) => c === moleculeClass).map(([id]) => id);
    if (ids.length === 0) continue;
    const { error: updateError } = await supabase
      .from('product_ideas')
      .update({ molecule_class: moleculeClass })
      .in('id', ids)
      .is('molecule_class', null);
    if (updateError) throw new Error(`Failed to classify compounds: ${updateError.message}`);
    classified += ids.length;
  }

  // If a whole batch comes back unusable, stop rather than loop on the same rows.
  if (classified === 0) throw new Error('The model returned no usable categories for this batch');

  return { classified, remaining: (rows?.length ?? 0) - classified };
}
