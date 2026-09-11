/**
 * Helpers for crossing the wire boundary of a pgvector column.
 *
 * Deliberately kept out of `src/lib/types/database.ts` — that file is
 * replaced wholesale by `npm run db:types` (`supabase gen types typescript`),
 * which knows nothing about hand-added helpers and will silently drop them
 * on the next regeneration. This file is never touched by codegen.
 *
 * `vector(1024)` columns surface over PostgREST as the text form of a JSON
 * array, e.g. `"[0.1,0.2,...]"` — a plain `string` in the generated types.
 * `Embedding` names that shape; `toVector`/`fromVector` convert at the
 * insert/read boundary so pipeline code works with `number[]` everywhere else.
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
