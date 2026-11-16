import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/types/database';

import { chunk } from './chunk';
import { classify } from './classify';
import { extractCompounds, summarizeFailures } from './compounds';
import { embed, meanVector } from './embed';
import { extract } from './extract';
import { runProductionStage } from './production';
import { checkSimilarity } from './similarity';
import { store, storeCompounds } from './store';
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
 *
 * Compounds are not extracted here: `store()` leaves `compounds_status =
 * 'pending'` and the caller schedules `runCompoundStage()` afterwards, since
 * full-text extraction can take minutes under Groq's rate limits.
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
      wordCount: extracted.wordCount,
      readingTimeMinutes: extracted.readingTimeMinutes,
      chunkCount: chunks.length,
      similarSources,
      truncated: classified.truncated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordFailure(supabase, sourceId, message);
    throw err;
  }
}

/**
 * Extract compounds from an already-ingested source's full text and store
 * them, tracking progress on `sources.compounds_status`. Reads everything it
 * needs from the database, so it works both right after ingest and as a
 * backfill over sources ingested before this stage existed.
 *
 * Never throws: a failure is recorded on the row (`compounds_status =
 * 'failed'`, `compounds_error`) and returned, so a background caller has
 * nothing to swallow.
 */
export async function runCompoundStage(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceId: string,
): Promise<{ ok: boolean; compoundCount: number; error: string | null }> {
  try {
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('url, full_text, title, source_type, ingest_status')
      .eq('id', sourceId)
      .single();
    if (sourceError || !source) {
      throw new Error(`Source not found: ${sourceError?.message ?? sourceId}`);
    }
    if (source.ingest_status !== 'complete' || !source.full_text) {
      throw new Error('Source has not finished ingesting');
    }

    const { data: chunkRows, error: chunksError } = await supabase
      .from('chunks')
      .select('id, chunk_index, content, start_char, end_char')
      .eq('source_id', sourceId)
      .order('chunk_index');
    if (chunksError) throw new Error(`Failed to load chunks: ${chunksError.message}`);

    await setCompoundsStatus(supabase, sourceId, 'running', null);

    const result = await extractCompounds(
      source.full_text,
      (chunkRows ?? []).map((c) => ({
        index: c.chunk_index,
        content: c.content,
        startChar: c.start_char,
        endChar: c.end_char,
      })),
      source.source_type,
      source.title,
    );

    const chunkIdByIndex = new Map((chunkRows ?? []).map((c) => [c.chunk_index, c.id]));
    await storeCompounds(supabase, userId, sourceId, result.compounds, chunkIdByIndex, source.url);

    // Partial failure: the batches that succeeded are stored, and the
    // failures are kept on the row as a warning rather than an error state.
    const warning =
      result.failedBatches.length > 0
        ? summarizeFailures(result.failedBatches, result.batchCount)
        : null;
    await setCompoundsStatus(supabase, sourceId, 'complete', warning);

    // Deep dig for how compounds without a stated route are made. Tracked in
    // production_status; its failures never fail the compound stage.
    await runProductionStage(supabase, sourceId);

    return { ok: true, compoundCount: result.compounds.length, error: warning };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setCompoundsStatus(supabase, sourceId, 'failed', message).catch(() => {});
    return { ok: false, compoundCount: 0, error: message };
  }
}

async function setCompoundsStatus(
  supabase: SupabaseClient<Database>,
  sourceId: string,
  status: Database['public']['Enums']['compound_status'],
  error: string | null,
): Promise<void> {
  const { error: updateError } = await supabase
    .from('sources')
    .update({ compounds_status: status, compounds_error: error })
    .eq('id', sourceId);
  if (updateError) throw new Error(`Failed to update compounds_status: ${updateError.message}`);
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
