import type { CompoundMarket, MoleculeClass, ProductionMethod, SourceType } from '@/lib/constants';

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

/** A biomanufacturing compound or product extracted by `extractCompounds()`. */
export type CompoundSuggestion = {
  /** Full common name of the compound (generic, not a brand). */
  name: string;
  /** Abbreviations and other non-brand names the source uses. */
  aliases: string[];
  /** Brand or trade names the source uses for it (e.g. "Sweelin"). */
  brands: string[];
  /** Biochemical class; null if the model didn't say. */
  moleculeClass: MoleculeClass | null;
  /** How this source says it's made; null when the text doesn't say. */
  production: { method: ProductionMethod; detail: string | null } | null;
  description: string;
  context: string;
  relevanceScore: number;
  /** `chunks.chunk_index` of the passage `context` was taken from. */
  chunkIndex: number;
  /** Which market the compound mainly serves; null if the model didn't say. */
  market: CompoundMarket | null;
};

/** Output of `classify()` — the LLM's read of the article. */
export type ClassifyResult = {
  summary: string;
  topics: TopicSuggestion[];
  sourceType: SourceType;
  publication: string | null;
  author: string | null;
  /**
   * True when Groq's response hit `max_tokens` (`finish_reason === 'length'`)
   * rather than completing naturally — the JSON was still parseable, but the
   * summary/topics may be an incomplete read of the source.
   */
  truncated: boolean;
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
  wordCount: number;
  readingTimeMinutes: number;
  chunkCount: number;
  similarSources: SimilarityMatch[];
  truncated: boolean;
};
