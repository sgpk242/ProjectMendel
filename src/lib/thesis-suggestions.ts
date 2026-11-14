import type { SupabaseClient } from '@supabase/supabase-js';

import { toVector } from '@/lib/embedding';
import { embed } from '@/lib/pipeline/embed';
import type { Database } from '@/lib/types/database';

/** Chunks retrieved per search; grouped down to at most `MAX_SUGGESTIONS` sources. */
const CHUNK_CANDIDATES = 60;
const MAX_SUGGESTIONS = 8;
const EXCERPT_CHARS = 280;

export type SourceSuggestion = {
  sourceId: string;
  title: string;
  url: string;
  similarity: number;
  /** The passage that matched the claim best. */
  excerpt: string;
};

type MatchedChunk = { source_id: string; content: string; similarity: number };

/**
 * Sources in the user's library most related to a thesis claim, for the
 * user to link with a stance. Searches chunks rather than whole-source
 * embeddings so one relevant passage in a long paper is enough to surface
 * it, and that passage is returned as the excerpt. Sources already linked
 * to the thesis are left out. `match_chunks` runs as the caller, so RLS
 * limits the search to the user's own chunks.
 */
export async function suggestSources(
  supabase: SupabaseClient<Database>,
  thesisId: string,
): Promise<SourceSuggestion[] | null> {
  const { data: thesis } = await supabase
    .from('theses')
    .select('claim')
    .eq('id', thesisId)
    .maybeSingle();
  if (!thesis) return null;

  const [{ embeddings }, { data: links }] = await Promise.all([
    embed([thesis.claim], 'search_query'),
    supabase.from('thesis_sources').select('source_id').eq('thesis_id', thesisId),
  ]);

  const { data: chunks, error } = await supabase.rpc('match_chunks', {
    query_embedding: toVector(embeddings[0]),
    match_count: CHUNK_CANDIDATES,
  });
  if (error) throw new Error(`Source search failed: ${error.message}`);

  const best = pickBestPerSource(
    chunks ?? [],
    new Set((links ?? []).map((l) => l.source_id)),
    MAX_SUGGESTIONS,
  );
  if (best.length === 0) return [];

  const { data: sources } = await supabase
    .from('sources')
    .select('id, title, url')
    .in(
      'id',
      best.map((c) => c.source_id),
    );
  const sourceById = new Map((sources ?? []).map((s) => [s.id, s]));

  return best.flatMap((c) => {
    const source = sourceById.get(c.source_id);
    if (!source) return [];
    return [
      {
        sourceId: source.id,
        title: source.title || source.url,
        url: source.url,
        similarity: c.similarity,
        excerpt: toExcerpt(c.content),
      },
    ];
  });
}

/** Highest-similarity chunk per source, skipping excluded sources, best first. */
export function pickBestPerSource(
  chunks: MatchedChunk[],
  exclude: Set<string>,
  limit: number,
): MatchedChunk[] {
  const bySource = new Map<string, MatchedChunk>();
  for (const chunk of chunks) {
    if (exclude.has(chunk.source_id)) continue;
    const prev = bySource.get(chunk.source_id);
    if (!prev || chunk.similarity > prev.similarity) bySource.set(chunk.source_id, chunk);
  }
  return [...bySource.values()].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

function toExcerpt(content: string): string {
  const text = content
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS).trimEnd()}…` : text;
}
