import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeName, resolveNames } from '@/lib/pubchem';
import type { Database } from '@/lib/types/database';

/**
 * One-time cleanup of product_ideas rows that are the same compound under
 * different names. Rows are grouped by PubChem CID (from the row itself, or
 * from the `compound_lookups` cache for its name); every group of 2+ is a
 * proposed merge, reviewed on /maintenance before anything is written.
 */

type Supabase = SupabaseClient<Database>;

export type MergeMember = {
  id: string;
  name: string;
  interestRating: number | null;
  notes: string | null;
  sourceCount: number;
};

export type MergeProposal = {
  cid: number;
  /** Name the merged row will get: PubChem's canonical name. */
  name: string;
  survivorId: string;
  members: MergeMember[];
  /** Highest 1–5 rating among members, or null if none is rated 1–5. */
  bestRating: number | null;
  /** A member is de-listed (0) and another is rated 1–5: the user must choose. */
  delistConflict: boolean;
  /** Rating the merged row gets when there's no conflict. */
  mergedRating: number | null;
  mergedNotes: string | null;
  synonyms: string[];
};

export type MergePlan = {
  proposals: MergeProposal[];
  /** Rows that resolve to a CID no other row shares: recorded, not merged. */
  assignments: { id: string; cid: number; canonicalName: string | null; synonyms: string[] }[];
  /** Rows whose names haven't been looked up in PubChem yet. */
  unresolvedCount: number;
};

/** For a delist conflict: keep the merged row de-listed, or keep the best rating. */
export type DelistChoice = 'delist' | 'rating';

type IdeaRow = {
  id: string;
  name: string;
  interest_rating: number | null;
  notes: string | null;
  pubchem_cid: number | null;
  canonical_name: string | null;
  synonyms: string[];
};

async function loadIdeas(supabase: Supabase): Promise<IdeaRow[]> {
  const { data, error } = await supabase
    .from('product_ideas')
    .select('id, name, interest_rating, notes, pubchem_cid, canonical_name, synonyms')
    .order('created_at');
  if (error) throw new Error(`Failed to load product ideas: ${error.message}`);
  return data ?? [];
}

async function loadCache(supabase: Supabase, keys: string[]) {
  const cache = new Map<string, { cid: number | null; canonicalName: string | null; synonyms: string[] }>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await supabase
      .from('compound_lookups')
      .select('query_name, pubchem_cid, canonical_name, synonyms')
      .in('query_name', keys.slice(i, i + 200));
    if (error) throw new Error(`Failed to read compound lookup cache: ${error.message}`);
    for (const row of data ?? []) {
      cache.set(row.query_name, {
        cid: row.pubchem_cid,
        canonicalName: row.canonical_name,
        synonyms: row.synonyms,
      });
    }
  }
  return cache;
}

/** Names of rows without a CID that have never been looked up. */
async function unresolvedNames(supabase: Supabase, ideas: IdeaRow[]): Promise<string[]> {
  const keys = [...new Set(ideas.filter((i) => i.pubchem_cid === null).map((i) => normalizeName(i.name)))];
  const cache = await loadCache(supabase, keys);
  return keys.filter((k) => !cache.has(k));
}

/**
 * Look up the next `limit` never-looked-up product names in PubChem
 * (filling the cache only — no product rows change). Called repeatedly by
 * the /maintenance page until `remaining` is 0.
 */
export async function resolveNextNames(
  supabase: Supabase,
  limit: number,
): Promise<{ resolved: number; remaining: number }> {
  const names = await unresolvedNames(supabase, await loadIdeas(supabase));
  const batch = names.slice(0, limit);
  await resolveNames(supabase, batch);
  return { resolved: batch.length, remaining: names.length - batch.length };
}

/** Build the merge plan from current rows and the lookup cache. Writes nothing. */
export async function buildMergePlan(supabase: Supabase): Promise<MergePlan> {
  const ideas = await loadIdeas(supabase);
  const cache = await loadCache(supabase, [...new Set(ideas.map((i) => normalizeName(i.name)))]);
  const unresolved = ideas.filter(
    (i) => i.pubchem_cid === null && !cache.has(normalizeName(i.name)),
  ).length;

  const sourceCounts = new Map<string, number>();
  const ids = ideas.map((i) => i.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('source_product_ideas')
      .select('product_idea_id')
      .in('product_idea_id', ids.slice(i, i + 200));
    if (error) throw new Error(`Failed to load compound links: ${error.message}`);
    for (const link of data ?? []) {
      sourceCounts.set(link.product_idea_id, (sourceCounts.get(link.product_idea_id) ?? 0) + 1);
    }
  }

  const groups = new Map<number, { rows: IdeaRow[]; canonicalName: string | null; synonyms: string[] }>();
  for (const idea of ideas) {
    const cached = cache.get(normalizeName(idea.name));
    const cid = idea.pubchem_cid ?? cached?.cid ?? null;
    if (cid === null) continue;
    const group = groups.get(cid) ?? { rows: [], canonicalName: null, synonyms: [] };
    group.rows.push(idea);
    group.canonicalName ??= idea.canonical_name ?? cached?.canonicalName ?? null;
    if (group.synonyms.length === 0) group.synonyms = idea.synonyms.length > 0 ? idea.synonyms : (cached?.synonyms ?? []);
    groups.set(cid, group);
  }

  const proposals: MergeProposal[] = [];
  const assignments: MergePlan['assignments'] = [];

  for (const [cid, group] of groups) {
    if (group.rows.length === 1) {
      const [row] = group.rows;
      if (row.pubchem_cid === null) {
        assignments.push({ id: row.id, cid, canonicalName: group.canonicalName, synonyms: group.synonyms });
      }
      continue;
    }

    const members: MergeMember[] = group.rows.map((r) => ({
      id: r.id,
      name: r.name,
      interestRating: r.interest_rating,
      notes: r.notes,
      sourceCount: sourceCounts.get(r.id) ?? 0,
    }));

    // Survivor: most source links, then rated over unrated, then oldest.
    const survivor = [...members].sort(
      (a, b) =>
        b.sourceCount - a.sourceCount ||
        Number(b.interestRating !== null) - Number(a.interestRating !== null),
    )[0];

    const rated = members.map((m) => m.interestRating).filter((r): r is number => r !== null && r >= 1);
    const bestRating = rated.length > 0 ? Math.max(...rated) : null;
    const anyDelisted = members.some((m) => m.interestRating === 0);

    const notes = [...new Set(members.map((m) => m.notes?.trim()).filter((n): n is string => !!n))];

    proposals.push({
      cid,
      name: group.canonicalName ?? survivor.name,
      survivorId: survivor.id,
      members,
      bestRating,
      delistConflict: anyDelisted && bestRating !== null,
      mergedRating: bestRating ?? (anyDelisted ? 0 : null),
      mergedNotes: notes.length > 0 ? notes.join('\n\n') : null,
      synonyms: group.synonyms,
    });
  }

  proposals.sort((a, b) => a.name.localeCompare(b.name));
  return { proposals, assignments, unresolvedCount: unresolved };
}

/**
 * Apply the merge plan as it stands now (rebuilt server-side, not taken from
 * the client). Groups with a delist conflict need a choice in `choices`
 * (keyed by CID) and are skipped without one. Then records CIDs on rows
 * that resolve but have nothing to merge with.
 */
export async function applyMergePlan(
  supabase: Supabase,
  choices: Record<string, DelistChoice>,
): Promise<{ merged: number; assigned: number; skipped: string[]; errors: string[] }> {
  const plan = await buildMergePlan(supabase);
  let merged = 0;
  let assigned = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const p of plan.proposals) {
    let rating = p.mergedRating;
    if (p.delistConflict) {
      const choice = choices[String(p.cid)];
      if (choice !== 'delist' && choice !== 'rating') {
        skipped.push(`${p.name}: needs a de-list choice`);
        continue;
      }
      rating = choice === 'delist' ? 0 : p.bestRating;
    }

    const { error } = await supabase.rpc('merge_product_ideas', {
      survivor_id: p.survivorId,
      absorbed_ids: p.members.filter((m) => m.id !== p.survivorId).map((m) => m.id),
      new_name: p.name,
      new_rating: rating,
      new_notes: p.mergedNotes,
      new_cid: p.cid,
      new_canonical: p.name,
      new_synonyms: p.synonyms,
    });
    if (error) errors.push(`${p.name}: ${error.message}`);
    else merged++;
  }

  for (const a of plan.assignments) {
    const { error } = await supabase
      .from('product_ideas')
      .update({ pubchem_cid: a.cid, canonical_name: a.canonicalName, synonyms: a.synonyms })
      .eq('id', a.id);
    if (error) errors.push(`assign CID ${a.cid}: ${error.message}`);
    else assigned++;
  }

  return { merged, assigned, skipped, errors };
}
