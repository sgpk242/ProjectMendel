import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/types/database';

import { chunk } from './chunk';
import { classify } from './classify';
import { embed, meanVector } from './embed';
import { extract } from './extract';
import { checkSimilarity } from './similarity';
import { store } from './store';
import type { IngestResult } from './types';

/**
 * Run the full ingest pipeline for a source that already exists as a
 * `pending` row (inserted by the API route so the client has an id to poll
 * and dedup against immediately).
 *
 * Advances `sources.ingest_status` at each stage so a failure is visible and
 * diagnosable from the row alone. On error, records `ingest_error`, bumps
 * `ingest_attempts`, sets status to `failed`, and re-throws — the route
 * handler is responsible for turning that into an HTTP response.
 */
export async function runIngestPipeline(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceId: string,
  url: string,
): Promise<IngestResult> {
  try {
    await setStatus(supabase, sourceId, 'fetching');
    const extracted = await extract(url);

    await setStatus(supabase, sourceId, 'extracting');
    const classified = await classify(extracted.title, extracted.content, url);

    await setStatus(supabase, sourceId, 'chunking');
    const chunks = chunk(extracted.content);
    if (chunks.length === 0) {
      throw new Error('Chunking produced no chunks — extracted content may be empty');
    }

    await setStatus(supabase, sourceId, 'embedding');
    const { embeddings: chunkEmbeddings } = await embed(
      chunks.map((c) => c.content),
      'search_document',
    );
    const sourceEmbedding = meanVector(chunkEmbeddings);

    await store(supabase, userId, sourceId, {
      extract: extracted,
      classify: classified,
      chunks,
      chunkEmbeddings,
      sourceEmbedding,
    });

    const similarSources = await checkSimilarity(supabase, userId, sourceId, sourceEmbedding);

    return {
      sourceId,
      title: extracted.title,
      url: extracted.url,
      summary: classified.summary,
      sourceType: classified.sourceType,
      topics: classified.topics,
      compounds: classified.compounds,
      wordCount: extracted.wordCount,
      readingTimeMinutes: extracted.readingTimeMinutes,
      chunkCount: chunks.length,
      similarSources,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordFailure(supabase, sourceId, message);
    throw err;
  }
}

async function setStatus(
  supabase: SupabaseClient<Database>,
  sourceId: string,
  status: Database['public']['Enums']['ingest_status'],
): Promise<void> {
  const { error } = await supabase
    .from('sources')
    .update({ ingest_status: status })
    .eq('id', sourceId);

  if (error) throw new Error(`Failed to update ingest_status to "${status}": ${error.message}`);
}

async function recordFailure(
  supabase: SupabaseClient<Database>,
  sourceId: string,
  message: string,
): Promise<void> {
  // Best-effort — a failure here shouldn't mask the original pipeline error.
  const { data } = await supabase
    .from('sources')
    .select('ingest_attempts')
    .eq('id', sourceId)
    .maybeSingle();

  await supabase
    .from('sources')
    .update({
      ingest_status: 'failed',
      ingest_error: message,
      ingest_attempts: (data?.ingest_attempts ?? 0) + 1,
    })
    .eq('id', sourceId);
}
