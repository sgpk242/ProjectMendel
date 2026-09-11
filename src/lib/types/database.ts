/**
 * Database types for the Mendel schema.
 *
 * Shaped like the output of `supabase gen types typescript` so it can be
 * replaced wholesale by `npm run db:types` once the migrations are applied to a
 * live project. Regenerate rather than hand-edit after any schema change.
 *
 * Two things the generator does that are worth knowing:
 *  - `vector(1024)` columns surface as `string` (PostgREST serializes them as a
 *    JSON-array literal). Use the Embedding alias below and serialize at the
 *    write boundary rather than passing a number[] straight through.
 *  - Generated columns (`sources.fts`) are readable but never writable, so they
 *    appear in Row and are absent from Insert/Update.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * A pgvector value as it crosses the wire: the text form of a JSON array, e.g.
 * "[0.1,0.2,...]". `toVector` below produces it from a number[].
 */
export type Embedding = string;

/** Serialize an embedding for insert/update into a `vector(1024)` column. */
export function toVector(values: number[]): Embedding {
  return JSON.stringify(values);
}

/** Parse a `vector` value read back from the database. */
export function fromVector(value: Embedding): number[] {
  return JSON.parse(value) as number[];
}

export type Database = {
  public: {
    Tables: {
      sources: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          url_canonical: string;
          content_hash: string | null;
          title: string | null;
          author: string | null;
          publication: string | null;
          published_date: string | null;
          captured_at: string;
          updated_at: string;
          full_text: string | null;
          summary: string | null;
          word_count: number | null;
          reading_time_minutes: number | null;
          interest_rating: number | null;
          user_note: string | null;
          source_type: Database['public']['Enums']['source_type'];
          status: Database['public']['Enums']['source_status'];
          ingest_status: Database['public']['Enums']['ingest_status'];
          ingest_error: string | null;
          ingest_attempts: number;
          source_embedding: Embedding | null;
          embedding_model: string | null;
          /** Generated column — readable, never writable. */
          fts: unknown | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          url: string;
          url_canonical: string;
          content_hash?: string | null;
          title?: string | null;
          author?: string | null;
          publication?: string | null;
          published_date?: string | null;
          captured_at?: string;
          updated_at?: string;
          full_text?: string | null;
          summary?: string | null;
          word_count?: number | null;
          reading_time_minutes?: number | null;
          interest_rating?: number | null;
          user_note?: string | null;
          source_type?: Database['public']['Enums']['source_type'];
          status?: Database['public']['Enums']['source_status'];
          ingest_status?: Database['public']['Enums']['ingest_status'];
          ingest_error?: string | null;
          ingest_attempts?: number;
          source_embedding?: Embedding | null;
          embedding_model?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          url?: string;
          url_canonical?: string;
          content_hash?: string | null;
          title?: string | null;
          author?: string | null;
          publication?: string | null;
          published_date?: string | null;
          captured_at?: string;
          updated_at?: string;
          full_text?: string | null;
          summary?: string | null;
          word_count?: number | null;
          reading_time_minutes?: number | null;
          interest_rating?: number | null;
          user_note?: string | null;
          source_type?: Database['public']['Enums']['source_type'];
          status?: Database['public']['Enums']['source_status'];
          ingest_status?: Database['public']['Enums']['ingest_status'];
          ingest_error?: string | null;
          ingest_attempts?: number;
          source_embedding?: Embedding | null;
          embedding_model?: string | null;
        };
        Relationships: [];
      };

      topics: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          category?: string | null;
        };
        Relationships: [];
      };

      source_topics: {
        Row: {
          source_id: string;
          topic_id: string;
          relevance_score: number | null;
        };
        Insert: {
          source_id: string;
          topic_id: string;
          relevance_score?: number | null;
        };
        Update: {
          source_id?: string;
          topic_id?: string;
          relevance_score?: number | null;
        };
        Relationships: [];
      };

      chunks: {
        Row: {
          id: string;
          source_id: string;
          user_id: string;
          chunk_index: number;
          content: string;
          start_char: number | null;
          end_char: number | null;
          token_count: number | null;
          embedding: Embedding;
          embedding_model: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          user_id: string;
          chunk_index: number;
          content: string;
          start_char?: number | null;
          end_char?: number | null;
          token_count?: number | null;
          embedding: Embedding;
          embedding_model?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          user_id?: string;
          chunk_index?: number;
          content?: string;
          start_char?: number | null;
          end_char?: number | null;
          token_count?: number | null;
          embedding?: Embedding;
          embedding_model?: string;
        };
        Relationships: [];
      };

      source_similarities: {
        Row: {
          id: string;
          user_id: string;
          source_a_id: string;
          source_b_id: string;
          similarity_score: number;
          relationship_type: Database['public']['Enums']['similarity_type'];
          detected_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_a_id: string;
          source_b_id: string;
          similarity_score: number;
          relationship_type?: Database['public']['Enums']['similarity_type'];
          detected_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_a_id?: string;
          source_b_id?: string;
          similarity_score?: number;
          relationship_type?: Database['public']['Enums']['similarity_type'];
          detected_at?: string;
        };
        Relationships: [];
      };

      collections: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      collection_sources: {
        Row: {
          collection_id: string;
          source_id: string;
          added_at: string;
        };
        Insert: {
          collection_id: string;
          source_id: string;
          added_at?: string;
        };
        Update: {
          collection_id?: string;
          source_id?: string;
          added_at?: string;
        };
        Relationships: [];
      };
    };

    Views: Record<never, never>;

    Functions: {
      match_chunks: {
        Args: {
          query_embedding: Embedding;
          match_count?: number;
          filter_source_ids?: string[] | null;
        };
        Returns: {
          chunk_id: string;
          source_id: string;
          chunk_index: number;
          content: string;
          start_char: number | null;
          end_char: number | null;
          similarity: number;
        }[];
      };
      match_sources: {
        Args: {
          query_embedding: Embedding;
          match_count?: number;
          exclude_source_id?: string | null;
        };
        Returns: {
          source_id: string;
          title: string | null;
          url: string;
          similarity: number;
        }[];
      };
    };

    Enums: {
      source_type:
        | 'article'
        | 'paper'
        | 'blog'
        | 'linkedin_post'
        | 'report'
        | 'press_release'
        | 'other';
      source_status: 'unread' | 'skimmed' | 'read' | 'synthesized';
      ingest_status:
        | 'pending'
        | 'fetching'
        | 'extracting'
        | 'chunking'
        | 'embedding'
        | 'complete'
        | 'failed';
      similarity_type: 'duplicate' | 'related' | 'contradicts';
    };

    CompositeTypes: Record<never, never>;
  };
};

/* Convenience aliases for application code. */

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

export type Source = Tables<'sources'>;
export type Topic = Tables<'topics'>;
export type Chunk = Tables<'chunks'>;
export type Collection = Tables<'collections'>;
export type SourceSimilarity = Tables<'source_similarities'>;

export type MatchedChunk = PublicSchema['Functions']['match_chunks']['Returns'][number];
export type MatchedSource = PublicSchema['Functions']['match_sources']['Returns'][number];
