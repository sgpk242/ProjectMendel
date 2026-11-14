import type { SupabaseClient } from '@supabase/supabase-js';

import { COMPOUND_MARKETS, EMBEDDING_MODEL, type CompoundMarket } from '@/lib/constants';
import { toVector } from '@/lib/embedding';
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
 * `resolveCompounds()`), then matched to an existing row by PubChem CID,
 * else by case-insensitive name or alias. Unmatched compounds become new
 * rows, named by PubChem's canonical name when they resolve. Compounds that
 * land on the same row (e.g. "rebaudioside M" and "Reb M" listed separately)
 * collapse to one link, keeping the most relevant context.
 *
 * Links upsert on (source_id, product_idea_id), so re-running extraction on
 * a source updates the links it finds again and leaves any others in place.
 * `chunkIdByIndex` maps `chunks.chunk_index` → `chunks.id` for `chunk_id`.
 */
export async function storeCompounds(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceId: string,
  compounds: CompoundSuggestion[],
  chunkIdByIndex: Map<number, string>,
): Promise<void> {
  if (compounds.length === 0) return;

  const [lookups, existingResult] = await Promise.all([
    resolveCompounds(supabase, compounds),
    supabase.from('product_ideas').select('id, name, pubchem_cid, market').eq('user_id', userId),
  ]);
  if (existingResult.error) {
    throw new Error(`Failed to load existing product ideas: ${existingResult.error.message}`);
  }

  const idByCid = new Map<number, string>();
  const idByName = new Map<string, string>();
  const untaggedIds = new Set(
    (existingResult.data ?? []).filter((row) => row.market === null).map((row) => row.id),
  );
  for (const row of existingResult.data ?? []) {
    if (row.pubchem_cid !== null) idByCid.set(row.pubchem_cid, row.id);
    idByName.set(normalizeName(row.name), row.id);
  }

  const findExisting = (c: CompoundSuggestion, lookup: CompoundLookup | null) => {
    if (lookup?.cid != null && idByCid.has(lookup.cid)) return idByCid.get(lookup.cid);
    const names = [c.name, ...c.aliases, ...(lookup?.canonicalName ? [lookup.canonicalName] : [])];
    for (const candidate of names) {
      const id = idByName.get(normalizeName(candidate));
      if (id) return id;
    }
    return undefined;
  };

  // Compounds with no existing row, one new row per CID (or per name).
  const toCreate = new Map<string, { compound: CompoundSuggestion; lookup: CompoundLookup | null }>();
  compounds.forEach((compound, i) => {
    const lookup = lookups[i];
    if (findExisting(compound, lookup)) return;
    const key = lookup?.cid != null ? `cid:${lookup.cid}` : `name:${normalizeName(compound.name)}`;
    if (!toCreate.has(key)) toCreate.set(key, { compound, lookup });
  });

  if (toCreate.size > 0) {
    const { data: created, error: createError } = await supabase
      .from('product_ideas')
      .insert(
        [...toCreate.values()].map(({ compound, lookup }) => ({
          user_id: userId,
          name: lookup?.canonicalName ?? compound.name,
          description: compound.description || null,
          pubchem_cid: lookup?.cid ?? null,
          canonical_name: lookup?.canonicalName ?? null,
          synonyms: lookup?.synonyms ?? [],
          market: compound.market,
        })),
      )
      .select('id, name, pubchem_cid');

    if (createError) {
      throw new Error(`Failed to create product ideas: ${createError.message}`);
    }

    for (const row of created ?? []) {
      if (row.pubchem_cid !== null) idByCid.set(row.pubchem_cid, row.id);
      idByName.set(normalizeName(row.name), row.id);
    }
    // A new row may be named by its canonical name; also index the names the
    // source used, so compounds in this batch find it.
    for (const { compound, lookup } of toCreate.values()) {
      const id = lookup?.cid != null ? idByCid.get(lookup.cid) : undefined;
      if (id) idByName.set(normalizeName(compound.name), id);
    }
  }

  const links = new Map<
    string,
    {
      source_id: string;
      product_idea_id: string;
      context: string | null;
      relevance_score: number;
      chunk_id: string | null;
    }
  >();

  compounds.forEach((compound, i) => {
    const ideaId = findExisting(compound, lookups[i]);
    if (!ideaId) return;
    const prev = links.get(ideaId);
    if (prev && prev.relevance_score >= compound.relevanceScore) return;
    links.set(ideaId, {
      source_id: sourceId,
      product_idea_id: ideaId,
      context: compound.context || null,
      relevance_score: compound.relevanceScore,
      chunk_id: chunkIdByIndex.get(compound.chunkIndex) ?? null,
    });
  });

  // Tag existing compounds that have no market yet. Never overrides a tag,
  // since it may have been set by hand on the product page.
  const tagById = new Map<string, CompoundMarket>();
  compounds.forEach((compound, i) => {
    const ideaId = findExisting(compound, lookups[i]);
    if (!ideaId || !untaggedIds.has(ideaId) || !compound.market) return;
    tagById.set(ideaId, mergeMarkets(tagById.get(ideaId) ?? null, compound.market)!);
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

  if (links.size > 0) {
    const { error: linkError } = await supabase
      .from('source_product_ideas')
      .upsert([...links.values()], { onConflict: 'source_id,product_idea_id' });

    if (linkError) {
      throw new Error(`Failed to link product ideas to source: ${linkError.message}`);
    }
  }
}
