import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { buildMergePlan } from './compound-merge';
import type { Database } from './types/database';

type Row = Record<string, unknown>;

/** Minimal stand-in for the query-builder chains buildMergePlan uses. */
function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const query = {
        select: () => query,
        order: () => query,
        in: (column: string, values: unknown[]) => {
          rows = rows.filter((r) => values.includes(r[column]));
          return query;
        },
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
}

const idea = (id: string, name: string, extra: Row = {}): Row => ({
  id,
  name,
  interest_rating: null,
  notes: null,
  pubchem_cid: null,
  canonical_name: null,
  synonyms: [],
  ...extra,
});

const lookup = (name: string, cid: number | null, canonical: string | null = null): Row => ({
  query_name: name,
  pubchem_cid: cid,
  canonical_name: canonical,
  synonyms: [],
});

describe('buildMergePlan', () => {
  const supabase = fakeSupabase({
    product_ideas: [
      idea('a', 'Reb M', { interest_rating: 0, notes: 'old note' }),
      idea('b', 'rebaudioside M', { interest_rating: 4, notes: 'great' }),
      idea('c', 'Rebaudioside M', { pubchem_cid: 92023628, canonical_name: 'Rebaudioside M', notes: 'great' }),
      idea('d', 'Squalene', { interest_rating: 3 }),
      idea('e', 'Mystery enzyme'),
      idea('f', 'Vanillin', { interest_rating: 2 }),
      idea('g', 'vanillin ', { interest_rating: 5 }),
    ],
    compound_lookups: [
      lookup('reb m', 92023628, 'Rebaudioside M'),
      lookup('rebaudioside m', 92023628, 'Rebaudioside M'),
      lookup('squalene', 638072, 'Squalene'),
      lookup('vanillin', 1183, 'Vanillin'),
    ],
    source_product_ideas: [
      { product_idea_id: 'a' },
      { product_idea_id: 'a' },
      { product_idea_id: 'b' },
      { product_idea_id: 'c' },
      { product_idea_id: 'c' },
      { product_idea_id: 'c' },
      { product_idea_id: 'f' },
      { product_idea_id: 'g' },
    ],
  });

  it('groups rows that share a PubChem CID and flags de-list conflicts', async () => {
    const plan = await buildMergePlan(supabase);
    const reb = plan.proposals.find((p) => p.cid === 92023628)!;
    expect(reb.members.map((m) => m.id).sort()).toEqual(['a', 'b', 'c']);
    expect(reb.survivorId).toBe('c'); // most source links
    expect(reb.name).toBe('Rebaudioside M');
    expect(reb.delistConflict).toBe(true);
    expect(reb.bestRating).toBe(4);
    expect(reb.mergedNotes).toBe('old note\n\ngreat'); // duplicates dropped
  });

  it('takes the highest rating when there is no conflict', async () => {
    const plan = await buildMergePlan(supabase);
    const vanillin = plan.proposals.find((p) => p.cid === 1183)!;
    expect(vanillin.delistConflict).toBe(false);
    expect(vanillin.mergedRating).toBe(5);
  });

  it('records CIDs on unshared rows and counts names not yet looked up', async () => {
    const plan = await buildMergePlan(supabase);
    expect(plan.assignments.map((a) => [a.id, a.cid])).toEqual([['d', 638072]]);
    expect(plan.unresolvedCount).toBe(1); // "Mystery enzyme"
  });
});
