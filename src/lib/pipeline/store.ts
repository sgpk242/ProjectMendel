import type { SupabaseClient } from '@supabase/supabase-js';

import { EMBEDDING_MODEL } from '@/lib/constants';
import { toVector } from '@/lib/embedding';
import type { Database } from '@/lib/types/database';

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
 * insert its chunks. Runs through the caller's authenticated client, so RLS
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
    })
    .eq('id', sourceId);

  if (sourceError) throw new Error(`Failed to update source: ${sourceError.message}`);

  const topicIds = await upsertTopics(supabase, userId, sourceId, classify.topics);
  await upsertProductIdeas(supabase, userId, sourceId, classify.compounds);

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
 * Upsert product ideas (biomanufacturing compounds) by case-insensitive name
 * and link them to the source. Same select-then-insert pattern as
 * `upsertTopics()` because PostgREST can't target the expression index.
 */
async function upsertProductIdeas(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceId: string,
  compounds: CompoundSuggestion[],
): Promise<void> {
  if (compounds.length === 0) return;

  const { data: existing, error: existingError } = await supabase
    .from('product_ideas')
    .select('id, name')
    .eq('user_id', userId);

  if (existingError) {
    throw new Error(`Failed to load existing product ideas: ${existingError.message}`);
  }

  const existingByLowerName = new Map((existing ?? []).map((p) => [p.name.toLowerCase(), p.id]));

  const toCreate = compounds.filter((c) => !existingByLowerName.has(c.name.toLowerCase()));

  if (toCreate.length > 0) {
    const { data: created, error: createError } = await supabase
      .from('product_ideas')
      .insert(
        toCreate.map((c) => ({
          user_id: userId,
          name: c.name,
          description: c.description || null,
        })),
      )
      .select('id, name');

    if (createError) {
      throw new Error(`Failed to create product ideas: ${createError.message}`);
    }

    for (const idea of created ?? []) {
      existingByLowerName.set(idea.name.toLowerCase(), idea.id);
    }
  }

  const links: {
    source_id: string;
    product_idea_id: string;
    context: string | null;
    relevance_score: number;
  }[] = [];

  for (const compound of compounds) {
    const ideaId = existingByLowerName.get(compound.name.toLowerCase());
    if (!ideaId) continue;
    links.push({
      source_id: sourceId,
      product_idea_id: ideaId,
      context: compound.context || null,
      relevance_score: compound.relevanceScore,
    });
  }

  if (links.length > 0) {
    const { error: linkError } = await supabase
      .from('source_product_ideas')
      .upsert(links, { onConflict: 'source_id,product_idea_id' });

    if (linkError) {
      throw new Error(`Failed to link product ideas to source: ${linkError.message}`);
    }
  }
}
