import type { SourceType } from '@/lib/constants';

/**
 * Shared intermediate types for the ingest pipeline.
 *
 * Each pipeline stage (extract, classify, chunk, embed, store, similarity)
 * takes and returns these plain-data shapes rather than reaching into the
 * database types directly — it keeps the stages testable in isolation and
 * decouples them from exactly how a `sources` row is persisted.
 */

/** Output of `extract()` — raw content and metadata from Jina Reader. */
export type ExtractResult = {
  title: string | null;
  description: string | null;
  content: string;
  url: string;
  publishedDate: string | null;
  wordCount: number;
  readingTimeMinutes: number;
  contentHash: string;
};

/** A single topic suggestion from classification. */
export type TopicSuggestion = {
  name: string;
  relevanceScore: number;
};

/** A biomanufacturing compound or product extracted during classification. */
export type CompoundSuggestion = {
  name: string;
  description: string;
  context: string;
  relevanceScore: number;
};

/** Output of `classify()` — the LLM's read of the article. */
export type ClassifyResult = {
  summary: string;
  topics: TopicSuggestion[];
  sourceType: SourceType;
  publication: string | null;
  author: string | null;
  compounds: CompoundSuggestion[];
};

/** A single chunk produced by `chunk()`, with offsets into the source text. */
export type ChunkData = {
  index: number;
  content: string;
  startChar: number;
  endChar: number;
  tokenEstimate: number;
};

/** Output of `embed()` — one embedding vector per input text, in order. */
export type EmbedResult = {
  embeddings: number[][];
};

/** A candidate match returned by `checkSimilarity()`. */
export type SimilarityMatch = {
  sourceId: string;
  title: string | null;
  url: string;
  similarity: number;
  relationshipType: 'duplicate' | 'related' | null;
};

/** Final shape returned to the API route and rendered by the confirmation UI. */
export type IngestResult = {
  sourceId: string;
  title: string | null;
  url: string;
  summary: string;
  sourceType: SourceType;
  topics: TopicSuggestion[];
  compounds: CompoundSuggestion[];
  wordCount: number;
  readingTimeMinutes: number;
  chunkCount: number;
  similarSources: SimilarityMatch[];
};
