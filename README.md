# Mendel

Personal research intelligence. Capture URLs, ingest their full content, organize
them in a searchable dashboard, and interrogate the corpus through an LLM chat
interface grounded in what you have read.

**Status: Phase 2** — ingest pipeline (paste a URL, get a classified, chunked,
embedded, dedup-checked source), plus a searchable/filterable dashboard, quick
actions, collections, and a rich source detail view. Chat is still a stub.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Database | Supabase Postgres + pgvector |
| Auth | Supabase email/password |
| Embeddings | Cohere `embed-v4.0` @ 1024 dims, via Vercel AI Gateway |
| Hosting | Vercel (later — local dev for now) |

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in your keys
```

Apply the database migrations to your Supabase project:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
npm run db:types      # regenerate src/lib/types/database.ts from the live schema
```

If you would rather not use the CLI, the three files in `supabase/migrations/`
are plain SQL — run them in order in the Supabase SQL editor.

Then:

```bash
npm run dev
```

Sign up at `/`. Supabase enables email confirmation by default, so either click
the link in the confirmation email or turn confirmations off under
**Authentication → Sign In / Providers** for local development.

## Ingest pipeline

`/api/ingest` runs a URL through six discrete stages, each its own module
under `src/lib/pipeline/` so they can be tested and iterated independently:

| Stage | File | What it does |
|---|---|---|
| Extract | `extract.ts` | Jina Reader — full text, title, description, published date |
| Classify | `classify.ts` | Groq (`openai/gpt-oss-120b`) — summary, topic tags, source type, author |
| Chunk | `chunk.ts` | Pure function — paragraph-boundary splitting, ~600 tokens/chunk, overlap |
| Embed | `embed.ts` | Cohere `embed-v4.0` — one vector per chunk, batched, plus the source-level mean |
| Store | `store.ts` | Writes the source row, upserts topics, inserts chunks — through the caller's RLS |
| Similarity | `similarity.ts` | `match_sources` RPC — flags ≥0.95 cosine similarity as a duplicate, ≥0.75 as related |

`ingest.ts` orchestrates the stages and advances `sources.ingest_status` at
each transition, so a failure partway through is visible on the row (`ingest_error`)
rather than silent. The route runs the whole pipeline synchronously before
responding — fine for local dev and for Vercel Pro's 300s limit at realistic
article lengths; if that stops being true, the route becomes a thin enqueue
against a background job, using the same `ingest_status` state machine.

Requires `JINA_API_KEY`, `GROQ_API_KEY`, and `COHERE_API_KEY` in
`.env.local`.

## Dashboard search & filtering

`/dashboard` is backed by one RPC, `search_sources`
(`supabase/migrations/004_search_sources_rpc.sql`), which handles ranked
full-text search, every facet filter, sorting, and pagination in a single
round trip:

- **Search** runs `websearch_to_tsquery` against the existing `sources.fts`
  column (weighted title > summary > note > body) and ranks with
  `ts_rank_cd`, so title matches surface first. A source whose *topic name*
  matches the query but whose text doesn't is still returned, at a lower
  fixed rank — covering "I know I tagged something EPA-related" as well as
  "I know the word EPA is somewhere in it".
- **Filters** — source type, reading status, topic, interest-rating range,
  reading-time bucket, and date range — all compose as SQL predicates in the
  same query, and are encoded in the URL (`src/lib/search-params.ts`) so a
  filtered view is shareable/bookmarkable and survives a refresh.
- **Pagination** is offset-based, 30 per page, using a window-function
  `total_count` from the same query rather than a second round trip.

Every source card carries inline quick actions — reading status, interest
rating, note, and collection membership — that PATCH `/api/source/[id]` (or
POST/DELETE the collections endpoints) and refresh in place; the same
controls appear, enlarged, on the source detail page alongside topic
relevance scores, similar sources (from `source_similarities`), and
collection memberships.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run db:types` | Regenerate `src/lib/types/database.ts` |
| `npm run db:diff` | Diff local schema against the linked project |

## Schema notes

The data model lives in `supabase/migrations/`. A few decisions that are cheap
now and expensive later:

- **`vector(1024)` throughout.** 1024 sits under pgvector's 2000-dimension
  ceiling for HNSW indexes, so both vector columns are directly indexable.
  Changing the dimension means dropping the indexes and re-embedding the corpus;
  `chunks.embedding_model` records which model produced each row so that
  migration can be done incrementally.
- **`sources.url_canonical`.** Dedup keys off a normalized URL
  (`src/lib/url.ts`), not the raw one, so the same article arriving with
  different `utm_*` parameters is recognized as one source.
- **`ingest_status` is separate from `status`.** `status` tracks *reading*
  (unread → synthesized); `ingest_status` tracks the *pipeline*. Ingestion is
  multi-step and fails partway on flaky URLs, and a half-ingested row has to be
  distinguishable from an unread one so it can be retried.
- **`chunks.user_id` is denormalized** from `sources`. Chunks are what every RAG
  query touches, and carrying the owner there lets RLS use a plain indexed
  predicate instead of a correlated subquery on every candidate row.
- **`sources.fts` is a generated column**, weighted title > summary > note >
  body. Being a real column rather than an expression index means queries can
  `ts_rank` it directly, which is what hybrid keyword+vector retrieval needs.
- **`source_similarities` stores each pair once**, enforced by
  `CHECK (source_a_id < source_b_id)`. Only symmetric relationship types exist
  for now; a directional one (`updates`) needs an explicit direction column.

Vector search goes through the `match_chunks` / `match_sources` RPCs — PostgREST
cannot express `ORDER BY embedding <=> $1`. Both are `SECURITY INVOKER` so the
caller's RLS applies, and neither returns embedding columns.

## Security

- `.env.local.example` is committed and must only ever hold placeholders. Real
  values go in `.env.local`, which is gitignored.
- The publishable (anon) key is safe in the browser: RLS is enabled on every
  table and policies are scoped to `auth.uid()`.
- `SUPABASE_SECRET_KEY` bypasses RLS. Any server code using it must filter by
  `user_id` explicitly.

## Roadmap

- **Phase 0** — scaffolding, schema, auth. ✅
- **Phase 1** — ingest pipeline: fetch, extract, chunk, embed, classify, dedup. ✅
- **Phase 2** — dashboard search/filtering, quick actions, collections CRUD,
  rich source detail view. ✅
- **Phase 3** — RAG chat with citations, hybrid keyword + vector retrieval.
- **Phase 4** — contradiction detection, deeper collection tooling.

### Backlog (not yet scoped or scheduled)

Ideas captured for later — each would likely be its own dashboard tile:

- **Funding opportunities tracker** — history of funding opportunities (e.g.
  DOE chemicals grants): what's open, deadlines, past awards.
- **Product idea radar** — candidate future biomanufacturing products, the
  papers behind them, and who's actively working on them.
- **Weekly new-papers feed** — a recurring pull of newly published papers for
  review, to triage into the main source library.
