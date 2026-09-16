/**
 * Single source of truth for the database enums.
 *
 * Declared as `as const` arrays rather than bare union types so the values are
 * available at runtime — for validating API input, and for rendering filter
 * controls without restating the options. The derived unions are what the
 * generated database types line up against.
 */

export const SOURCE_TYPES = [
  'scientific_paper',
  'non_peer_reviewed_article',
  'white_paper',
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
  scientific_paper: 'Scientific Paper',
  non_peer_reviewed_article: 'Non-Peer-Reviewed Article',
  white_paper: 'White Paper',
  blog: 'Blog',
  linkedin_post: 'LinkedIn post',
  report: 'Report',
  press_release: 'Press release',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Funding opportunities
// ---------------------------------------------------------------------------

export const FUNDING_STATUSES = ['open', 'closed', 'applied'] as const;
export type FundingStatus = (typeof FUNDING_STATUSES)[number];

export const FUNDING_STATUS_LABELS: Record<FundingStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  applied: 'Applied',
};

// ---------------------------------------------------------------------------
// Papers feed
// ---------------------------------------------------------------------------

export const FEED_SOURCE_TYPES = ['openalex', 'web'] as const;
export type FeedSourceType = (typeof FEED_SOURCE_TYPES)[number];

export const FEED_ITEM_STATUSES = ['new', 'reviewed', 'dismissed', 'ingested'] as const;
export type FeedItemStatus = (typeof FEED_ITEM_STATUSES)[number];

export const FEED_ITEM_STATUS_LABELS: Record<FeedItemStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  dismissed: 'Dismissed',
  ingested: 'Ingested',
};

// ---------------------------------------------------------------------------
// Embedding configuration
// ---------------------------------------------------------------------------

/**
 * Embedding configuration. The dimension is baked into the `vector(1024)`
 * columns and their HNSW indexes, so changing model here means a migration
 * plus a full re-embed — `chunks.embedding_model` records which model produced
 * each row so that migration can be done incrementally.
 */
export const EMBEDDING_MODEL = 'cohere/embed-v4.0';
export const EMBEDDING_DIMENSIONS = 1024;

/** Routes that require an authenticated session. */
export const PROTECTED_ROUTES = [
  '/dashboard',
  '/source',
  '/product',
  '/chat',
  '/funding',
  '/feed',
] as const;
