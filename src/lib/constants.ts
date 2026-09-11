/**
 * Single source of truth for the database enums.
 *
 * Declared as `as const` arrays rather than bare union types so the values are
 * available at runtime — for validating API input, and for rendering filter
 * controls without restating the options. The derived unions are what the
 * generated database types line up against.
 */

export const SOURCE_TYPES = [
  'article',
  'paper',
  'blog',
  'linkedin_post',
  'report',
  'press_release',
  'other',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_STATUSES = ['unread', 'skimmed', 'read', 'synthesized'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const INGEST_STATUSES = [
  'pending',
  'fetching',
  'extracting',
  'chunking',
  'embedding',
  'complete',
  'failed',
] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];

export const SIMILARITY_TYPES = ['duplicate', 'related', 'contradicts'] as const;
export type SimilarityType = (typeof SIMILARITY_TYPES)[number];

/** Human-readable labels for the reading-status enum. */
export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  unread: 'Unread',
  skimmed: 'Skimmed',
  read: 'Read',
  synthesized: 'Synthesized',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  article: 'Article',
  paper: 'Paper',
  blog: 'Blog',
  linkedin_post: 'LinkedIn post',
  report: 'Report',
  press_release: 'Press release',
  other: 'Other',
};

/**
 * Embedding configuration. The dimension is baked into the `vector(1024)`
 * columns and their HNSW indexes, so changing model here means a migration
 * plus a full re-embed — `chunks.embedding_model` records which model produced
 * each row so that migration can be done incrementally.
 */
export const EMBEDDING_MODEL = 'cohere/embed-v4.0';
export const EMBEDDING_DIMENSIONS = 1024;

/** Routes that require an authenticated session. */
export const PROTECTED_ROUTES = ['/dashboard', '/source', '/chat'] as const;
