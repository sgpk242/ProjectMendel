import type { SupabaseClient } from '@supabase/supabase-js';

import { toVector } from '@/lib/embedding';
import type { Database } from '@/lib/types/database';

import type { SimilarityMatch } from './types';

/** At or above this cosine similarity, two sources are treated as duplicates. */
const DUPLICATE_THRESHOLD = 0.95;
/** At or above this cosine similarity (and below duplicate), sources are "related". */
const RELATED_THRESHOLD = 0.75;

/**
 * Compare a source's embedding against every other source the user has
 * captured, via the `match_sources` RPC, and persist any match at or above
 * the "related" threshold into `source_similarities`.
 *
 * Returns the full candidate list (including sub-threshold matches) so the
 * UI can show "nothing similar found" versus "checked, nothing close".
 */
export async function checkSimilarity(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceId: string,
  sourceEmbedding: number[],
): Promise<SimilarityMatch[]> {
  const { data, error } = await supabase.rpc('match_sources', {
    query_embedding: toVector(sourceEmbedding),
    match_count: 5,
    exclude_source_id: sourceId,
  });

  if (error) throw new Error(`Similarity search failed: ${error.message}`);

  const matches: SimilarityMatch[] = (data ?? []).map((row) => ({
    sourceId: row.source_id,
    title: row.title,
    url: row.url,
    similarity: row.similarity,
    relationshipType: classify(row.similarity),
  }));

  const toPersist = matches.filter((m) => m.relationshipType !== null);

  for (const match of toPersist) {
    const [sourceAId, sourceBId] =
      sourceId < match.sourceId ? [sourceId, match.sourceId] : [match.sourceId, sourceId];

    const { error: upsertError } = await supabase.from('source_similarities').upsert(
      {
        user_id: userId,
        source_a_id: sourceAId,
        source_b_id: sourceBId,
        similarity_score: match.similarity,
        relationship_type: match.relationshipType as 'duplicate' | 'related',
      },
      { onConflict: 'source_a_id,source_b_id' },
    );

    if (upsertError) {
      throw new Error(`Failed to record similarity: ${upsertError.message}`);
    }
  }

  return matches;
}

function classify(similarity: number): 'duplicate' | 'related' | null {
  if (similarity >= DUPLICATE_THRESHOLD) return 'duplicate';
  if (similarity >= RELATED_THRESHOLD) return 'related';
  return null;
}
