import { EMBEDDING_DIMENSIONS } from '@/lib/constants';

import type { EmbedResult } from './types';

/** Cohere's per-request limit on the number of texts in `embed_v2`/`embed`. */
const BATCH_SIZE = 96;

type CohereEmbedResponse = {
  embeddings: { float: number[][] };
};

/**
 * Embed a batch of texts with Cohere `embed-v4.0` (1024 dimensions).
 *
 * `inputType` must match how the vector will be used: `search_document` for
 * text being indexed (chunks, source-level averages), `search_query` for
 * text used to search the index later (Phase 2 chat retrieval). Cohere caps
 * requests at 96 texts, so larger inputs are split into sequential batches.
 */
export async function embed(
  texts: string[],
  inputType: 'search_document' | 'search_query',
): Promise<EmbedResult> {
  if (texts.length === 0) return { embeddings: [] };

  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = await embedBatch(batch, inputType);
    embeddings.push(...batchEmbeddings);
  }

  return { embeddings };
}

async function embedBatch(
  texts: string[],
  inputType: 'search_document' | 'search_query',
  attempt = 1,
): Promise<number[][]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error('COHERE_API_KEY is not set');

  const response = await fetch('https://api.cohere.com/v2/embed', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'embed-v4.0',
      texts,
      input_type: inputType,
      embedding_types: ['float'],
      truncate: 'END',
      // embed-v4.0 is Matryoshka — it can emit 256/512/1024/1536 dims from
      // the same model. Without this it defaults to 1536, which doesn't
      // match the schema's vector(1024) columns.
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  });

  if (response.status === 429 && attempt === 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return embedBatch(texts, inputType, attempt + 1);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Cohere embed request failed: ${response.status} ${detail}`);
  }

  const body = (await response.json()) as CohereEmbedResponse;
  const vectors = body.embeddings?.float;

  if (!vectors || vectors.length !== texts.length) {
    throw new Error(
      `Cohere returned ${vectors?.length ?? 0} embeddings for ${texts.length} inputs`,
    );
  }

  for (const vector of vectors) {
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Cohere returned a ${vector.length}-dim embedding, expected ${EMBEDDING_DIMENSIONS}`,
      );
    }
  }

  return vectors;
}

/** Element-wise mean of a set of equal-length vectors — the source-level embedding. */
export function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) throw new Error('meanVector requires at least one vector');

  const dims = vectors[0].length;
  const sum = new Array(dims).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dims; i++) sum[i] += vector[i];
  }

  return sum.map((value) => value / vectors.length);
}
