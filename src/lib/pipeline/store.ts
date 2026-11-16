import type { SupabaseClient } from '@supabase/supabase-js';

import { aliasEntries, matchProduct } from '@/lib/compound-names';
import {
  COMPOUND_MARKETS,
  EMBEDDING_MODEL,
  MOLECULE_CLASSES,
  type CompoundMarket,
  type MoleculeClass,
} from '@/lib/constants';
import { toVector } from '@/lib/embedding';
import { refreshDisplayNames, saveAliases } from '@/lib/product-aliases';
import { normalizeName, resolveCompounds, type CompoundLookup } from '@/lib/pubchem';
import type { Database } from '@/lib/types/database';

import { mergeMarkets } from './compounds';
import type { ChunkData, ClassifyResult, CompoundSuggestion, ExtractResult } from './types';

type StoreInput = {
  extract: ExtractResult;
  classify: ClassifyResult;
  chunks: ChunkData[];
  chunkEmbeddings: number[][];
  sourceEmbedding: number[];
};

/**
 * Persist a completed ingest: update the source row, upsert its topics, and
 * insert its chunks. Compounds are stored later, by `storeCompounds()`, once
 * the separate compound stage has run over the full text. Runs through the caller's authenticated client, so RLS
 * applies exactly as it would for any other user-initiated write.
 */
export async function store(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceId: string,
  input: StoreInput,
): Promise<{ topicIds: string[] }> {
  const { extract, classify, chunks, chunkEmbeddings, sourceEmbedding } = input;

  const { error: sourceError } = await supabase
    .from('sources')
    .update({
      title: extract.title,
      author: classify.author,
      publication: classify.publication,
      published_date: extract.publishedDate,
      full_text: extract.content,
      summary: classify.summary,
      word_count: extract.wordCount,
      reading_time_minutes: extract.readingTimeMinutes,
      content_hash: extract.contentHash,
      source_type: classify.sourceType,
      source_embedding: toVector(sourceEmbedding),
      embedding_model: EMBEDDING_MODEL,
      ingest_status: 'complete',
      ingest_error: null,
      classification_truncated: classify.truncated,
      compounds_status: 'pending',
      compounds_error: null,
    })
    .eq('id', sourceId);

  if (sourceError) throw new Error(`Failed to update source: ${sourceError.message}`);

  const topicIds = await upsertTopics(supabase, userId, sourceId, classify.topics);

  if (chunks.length > 0) {
    const { error: chunksError } = await supabase.from('chunks').insert(
      chunks.map((c, i) => ({
        source_id: sourceId,
        user_id: userId,
        chunk_index: c.index,
        content: c.content,
        start_char: c.startChar,
        end_char: c.endChar,
        token_count: c.tokenEstimate,
        embedding: toVector(chunkEmbeddings[i]),
        embedding_model: EMBEDDING_MODEL,
      })),
    );

    if (chunksError) throw new Error(`Failed to insert chunks: ${chunksError.message}`);
  }

  return { topicIds };
}

/**
 * Upsert topics by case-insensitive name and link them to the source.
 *
 * PostgREST can't express `ON CONFLICT (user_id, lower(name))` against the
 * expression index in `001_initial_schema.sql`, so this selects first and
 * only inserts topics that don't already exist for the user.
 */
async function upsertTopics(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceId: string,
  topics: { name: string; relevanceScore: number }[],
): Promise<string[]> {
  if (topics.length === 0) return [];

  const { data: existing, error: existingError } = await supabase
    .from('topics')
    .select('id, name')
    .eq('user_id', userId);

  if (existingError) throw new Error(`Failed to load existing topics: ${existingError.message}`);

  const existingByLowerName = new Map((existing ?? []).map((t) => [t.name.toLowerCase(), t.id]));

  const toCreate = topics.filter((t) => !existingByLowerName.has(t.name.toLowerCase()));

  if (toCreate.length > 0) {
    const { data: created, error: createError } = await supabase
      .from('topics')
      .insert(toCreate.map((t) => ({ user_id: userId, name: t.name })))
      .select('id, name');

    if (createError) throw new Error(`Failed to create topics: ${createError.message}`);

    for (const topic of created ?? []) {
      existingByLowerName.set(topic.name.toLowerCase(), topic.id);
    }
  }

  const topicIds: string[] = [];
  const links: { source_id: string; topic_id: string; relevance_score: number }[] = [];

  for (const topic of topics) {
    const topicId = existingByLowerName.get(topic.name.toLowerCase());
    if (!topicId) continue; // Shouldn't happen — created above if missing.
    topicIds.push(topicId);
    links.push({ source_id: sourceId, topic_id: topicId, relevance_score: topic.relevanceScore });
  }

  const { error: linkError } = await supabase
    .from('source_topics')
    .upsert(links, { onConflict: 'source_id,topic_id' });

  if (linkError) throw new Error(`Failed to link topics to source: ${linkError.message}`);

  return topicIds;
}

/**
 * Upsert product ideas (biomanufacturing compounds) and link them to the
 * source.
 *
 * Each compound is resolved against PubChem (name first, then aliases; see
 * `resolveCompounds()`), then matched to an existing product by PubChem CID,
 * else by any name the source used (generic name, abbreviations, brands)
 * through the user's `product_aliases`. So a later source that only says
 * "Sweelin" lands on the product an earlier source created. Unmatched
 * compounds become new products. Compounds that land on the same product
 * collapse to one link, keeping the most relevant context.
 *
 * Every name the source used is saved as an alias (new products also get
 * their PubChem synonyms), the link records which names this source used,
 * and unpinned product headers are re-picked from that usage.
 *
 * Links upsert on (source_id, product_idea_id), so re-running extraction on
 * a source updates the links it finds again and leaves any others in place.
 * A production route already on a link (e.g. found by the deep dig) is only
 * replaced when the article itself states one.
 * `chunkIdByIndex` maps `chunks.chunk_index` → `chunks.id` for `chunk_id`.
 */
export async function storeCompounds(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceId: string,
  compounds: CompoundSuggestion[],
  chunkIdByIndex: Map<number, string>,
  sourceUrl: string | null = null,
): Promise<void> {
  if (compounds.length === 0) return;

  const [lookups, existingResult, aliasResult] = await Promise.all([
    resolveCompounds(supabase, compounds.map((c) => ({ name: c.name, aliases: [...c.aliases, ...c.brands] }))),
    supabase
      .from('product_ideas')
      .select('id, name, pubchem_cid, market, molecule_class')
      .eq('user_id', userId),
    supabase.from('product_aliases').select('product_idea_id, alias_normalized').eq('user_id', userId),
  ]);
  if (existingResult.error) {
    throw new Error(`Failed to load existing product ideas: ${existingResult.error.message}`);
  }
  if (aliasResult.error) {
    throw new Error(`Failed to load product aliases: ${aliasResult.error.message}`);
  }

  const idByCid = new Map<number, string>();
  const idByAlias = new Map<string, string>();
  const existing = existingResult.data ?? [];
  const untaggedIds = new Set(existing.filter((row) => row.market === null).map((row) => row.id));
  const unclassifiedIds = new Set(existing.filter((row) => row.molecule_class === null).map((row) => row.id));
  for (const row of existing) {
    if (row.pubchem_cid !== null) idByCid.set(row.pubchem_cid, row.id);
    idByAlias.set(normalizeName(row.name), row.id);
  }
  for (const row of aliasResult.data ?? []) idByAlias.set(row.alias_normalized, row.product_idea_id);

  const findExisting = (c: CompoundSuggestion, lookup: CompoundLookup | null) =>
    matchProduct(c, lookup, idByCid, idByAlias);

  // Compounds with no existing product, one new product per CID (or per name).
  const toCreate = new Map<string, { compound: CompoundSuggestion; lookup: CompoundLookup | null }>();
  compounds.forEach((compound, i) => {
    const lookup = lookups[i];
    if (findExisting(compound, lookup)) return;
    const key = lookup?.cid != null ? `cid:${lookup.cid}` : `name:${normalizeName(compound.name)}`;
    if (!toCreate.has(key)) toCreate.set(key, { compound, lookup });
  });

  const aliasRows: Parameters<typeof saveAliases>[2] = [];

  if (toCreate.size > 0) {
    const { data: created, error: createError } = await supabase
      .from('product_ideas')
      .insert(
        [...toCreate.values()].map(({ compound, lookup }) => ({
          user_id: userId,
          name: compound.name,
          description: compound.description || null,
          pubchem_cid: lookup?.cid ?? null,
          canonical_name: lookup?.canonicalName ?? null,
          synonyms: lookup?.synonyms ?? [],
          market: compound.market,
          molecule_class: compound.moleculeClass,
        })),
      )
      .select('id, name, pubchem_cid');

    if (createError) {
      throw new Error(`Failed to create product ideas: ${createError.message}`);
    }

    for (const row of created ?? []) {
      if (row.pubchem_cid !== null) idByCid.set(row.pubchem_cid, row.id);
      idByAlias.set(normalizeName(row.name), row.id);
    }
    // Index every name this source used for the new products, so the other
    // compounds in this batch find them, and give new products their
    // PubChem title and synonyms as aliases.
    for (const { compound, lookup } of toCreate.values()) {
      const id = findExisting(compound, lookup);
      if (!id) continue;
      for (const entry of aliasEntries(compound)) idByAlias.set(entry.normalized, id);
      for (const synonym of [lookup?.canonicalName, ...(lookup?.synonyms ?? [])]) {
        if (!synonym) continue;
        const normalized = normalizeName(synonym);
        if (normalized) aliasRows.push({ productId: id, entry: { alias: synonym, normalized, kind: 'pubchem' }, sourceId });
      }
    }
  }

  type Link = {
    source_id: string;
    product_idea_id: string;
    context: string | null;
    relevance_score: number;
    chunk_id: string | null;
    names_used: string[];
  };
  const links = new Map<string, Link>();
  const production = new Map<string, NonNullable<CompoundSuggestion['production']>>();
  const namesUsed = new Map<string, Set<string>>();

  compounds.forEach((compound, i) => {
    const ideaId = findExisting(compound, lookups[i]);
    if (!ideaId) return;

    const entries = aliasEntries(compound);
    const used = namesUsed.get(ideaId) ?? new Set<string>();
    for (const entry of entries) {
      used.add(entry.normalized);
      aliasRows.unshift({ productId: ideaId, entry, sourceId });
    }
    namesUsed.set(ideaId, used);
    if (compound.production && !production.has(ideaId)) production.set(ideaId, compound.production);

    const prev = links.get(ideaId);
    if (prev && prev.relevance_score >= compound.relevanceScore) return;
    links.set(ideaId, {
      source_id: sourceId,
      product_idea_id: ideaId,
      context: compound.context || null,
      relevance_score: compound.relevanceScore,
      chunk_id: chunkIdByIndex.get(compound.chunkIndex) ?? null,
      names_used: [],
    });
  });
  for (const [ideaId, link] of links) link.names_used = [...(namesUsed.get(ideaId) ?? [])];

  // Fill market and molecule class only where they're empty: either may
  // have been set by hand on the product page.
  const tagById = new Map<string, CompoundMarket>();
  const classById = new Map<string, MoleculeClass>();
  compounds.forEach((compound, i) => {
    const ideaId = findExisting(compound, lookups[i]);
    if (!ideaId) return;
    if (untaggedIds.has(ideaId) && compound.market) {
      tagById.set(ideaId, mergeMarkets(tagById.get(ideaId) ?? null, compound.market)!);
    }
    if (unclassifiedIds.has(ideaId) && compound.moleculeClass && !classById.has(ideaId)) {
      classById.set(ideaId, compound.moleculeClass);
    }
  });
  for (const market of COMPOUND_MARKETS) {
    const ids = [...tagById].filter(([, m]) => m === market).map(([id]) => id);
    if (ids.length === 0) continue;
    const { error: tagError } = await supabase
      .from('product_ideas')
      .update({ market })
      .in('id', ids)
      .is('market', null);
    if (tagError) throw new Error(`Failed to tag compound markets: ${tagError.message}`);
  }
  for (const moleculeClass of MOLECULE_CLASSES) {
    const ids = [...classById].filter(([, c]) => c === moleculeClass).map(([id]) => id);
    if (ids.length === 0) continue;
    const { error: classError } = await supabase
      .from('product_ideas')
      .update({ molecule_class: moleculeClass })
      .in('id', ids)
      .is('molecule_class', null);
    if (classError) throw new Error(`Failed to classify compounds: ${classError.message}`);
  }

  // Names this source used come first, so they win the kind for an alias
  // over a PubChem synonym of the same spelling.
  await saveAliases(supabase, userId, aliasRows);

  if (links.size > 0) {
    // Links whose article states a production route set it; the rest leave
    // any route already on the link alone (the columns aren't sent).
    const withRoute = [...links.values()]
      .filter((l) => production.has(l.product_idea_id))
      .map((l) => {
        const route = production.get(l.product_idea_id)!;
        return {
          ...l,
          production_method: route.method,
          production_detail: route.detail,
          production_evidence_url: sourceUrl,
        };
      });
    const withoutRoute = [...links.values()].filter((l) => !production.has(l.product_idea_id));

    for (const batch of [withRoute, withoutRoute]) {
      if (batch.length === 0) continue;
      const { error: linkError } = await supabase
        .from('source_product_ideas')
        .upsert(batch, { onConflict: 'source_id,product_idea_id' });
      if (linkError) {
        throw new Error(`Failed to link product ideas to source: ${linkError.message}`);
      }
    }
  }

  await refreshDisplayNames(supabase, [...links.keys()]);
}
