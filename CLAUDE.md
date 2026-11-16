@AGENTS.md

# Mendel

Session-to-session status (done / next / open questions) lives in `PROGRESS.md`; read it at the start of a session.

## Goal

Mendel is my personal research intelligence app for industrial biomanufacturing. It captures URLs, fully ingests them, and helps me (a) build fluency to speak with industry experts, (b) build conviction on where the industry is heading for my career, and (c) produce commercial insights on biomanufactured products, primarily commercial ingredients, secondarily pharma starting materials, and as a low priority, government-contract manufacturing. The direction as of Nov 2026 is to shift from a library of papers toward tracking commercial signals and recording my own testable theses.

## Tech stack

- **Framework:** Next.js 16.3 App Router, React 19, TypeScript, Tailwind CSS v4. `next.config.ts` only sets `allowedDevOrigins` for ngrok/cloudflared tunnels.
- **Database:** Supabase Postgres + pgvector (`@supabase/supabase-js`, `@supabase/ssr`); migrations in `supabase/migrations/`.
- **Auth:** Supabase email/password; session refreshed in `src/proxy.ts` → `src/lib/supabase/middleware.ts`.
- **Extraction:** Jina Reader (`r.jina.ai`), `src/lib/pipeline/extract.ts`.
- **Classification:** Groq `openai/gpt-oss-120b` via `groq-sdk`, `src/lib/pipeline/classify.ts`.
- **Embeddings:** Cohere `embed-v4.0` called directly at `api.cohere.com`, 1024 dims (`vector(1024)`).
- **Feeds and lookups:** OpenAlex + Jina Search (`src/lib/feed/`; "Commercial" queries are restricted to the sites in `commercial-sites.ts`); Wikipedia REST for product descriptions (`src/lib/wikipedia.ts`); PubChem PUG REST for compound normalization (`src/lib/pubchem.ts`, cached in `compound_lookups`).
- **Mobile:** PWA with a Web Share Target (`src/app/manifest.ts`, `/capture`, `public/sw.js`).
- **Hosting:** local dev today; Vercel planned. `/api/ingest` sets `maxDuration`.

## Conventions

- **Files:** kebab-case. Components in `src/components/<area>/`. Pages are server components that query Supabase directly via `createClient()` (`src/lib/supabase/server.ts`). Client components mutate through `src/app/api/<resource>/[id]/route.ts`, then call `router.refresh()`.
- **API routes:** call `supabase.auth.getUser()` first and return 401 without a user. Validate the body by hand; errors return `{ error }` with a status code.
- **Pipeline:** one stage per module in `src/lib/pipeline/`, exchanging the plain-data types in `pipeline/types.ts`, not DB rows. `ingest.ts` orchestrates and advances `sources.ingest_status` at each step; failures record `ingest_error` and re-throw. Persistence lives in `store.ts`.
- **Migrations:** `NNN_snake_case.sql`, zero-padded and sequential, each with a header comment explaining why. Never edit an applied migration; add a new one.
- **RLS:** enabled on every table, policies `to authenticated` using `(select auth.uid())`. Owner tables check `user_id = (select auth.uid())`, with `with check` on insert and update. Junction tables check ownership via `exists (select 1 from sources ...)`. The secret key bypasses RLS, so any code using it must filter by `user_id`.
- **DB types:** `npm run db:types` regenerates `src/lib/types/database.ts` from the live project; Claude hand-edits it to match each new migration. Never put helpers in it (they live in `src/lib/embedding.ts`).
- **Enums:** mirror DB enums as `as const` arrays plus label maps in `src/lib/constants.ts`.
- **One-off data fixes** go on `/maintenance` (in the nav) as an authenticated, session-scoped flow: no secret key, preview before writing.
- **Compound markets:** `product_ideas.market` is industrial / pharma / both (null = untagged). The model only fills untagged rows; a manual tag is never overwritten.
- **Product-idea ratings:** `interest_rating` null = never rated, 0 = de-listed, 1–5 = rated (only 1–5 show on the radar).

## Testing

- **Before every commit**, in this order: `npm run build` → `npm run typecheck` → `npm run lint` → `npm test`. Build first: it generates the `PageProps` types typecheck needs.
- **Unit tests** (Vitest, `npm test`; `npm run test:watch` while working): `src/**/*.test.ts`, next to the code they cover. No network and no real keys — mock `fetch` with `vi.stubGlobal` and `groq-sdk` with `vi.mock`.
- **Database tests** (pgTAP, `npm run test:db`): `supabase/tests/*.test.sql`, run by `supabase test db` against the local Supabase stack (`npx supabase start`, needs Docker Desktop), never the live project. Each file runs in one transaction and rolls back; act as a user with `set local role authenticated` + `set local request.jwt.claims = '{"sub": "..."}'`. Run whenever a migration or RLS policy changes.
- **What gets a test:** every new pure-logic module, every bug fix (a test that fails without the fix), and every migration that touches RLS or constraints (a case in `supabase/tests/rls.test.sql`).

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-09-11 | Supabase Postgres + pgvector in one database | Relational data, RLS and vectors in one place; no separate vector store to sync |
| 2026-09-11 | `vector(1024)` everywhere; `chunks.embedding_model` recorded | Under pgvector's 2000-dim HNSW limit; allows incremental re-embedding later |
| 2026-09-11 | Dedup sources on `url_canonical` | The same article with tracking params must be one source |
| 2026-09-11 | `ingest_status` separate from reading `status` | A half-ingested row must be distinguishable from an unread one, and retryable |
| 2026-09-11 | `chunks.user_id` denormalized; `sources.fts` as a generated column | Cheap RLS on the hottest table; FTS rankable for hybrid retrieval |
| 2026-09-11 | Synchronous ingest in the route for now | Simple and fits time limits at realistic lengths; move to a job queue when it doesn't |
| 2026-09-11 | Jina Reader for extraction; Cohere embed-v4.0 for embeddings | Full-text markdown from any URL; strong embeddings at 1024 dims |
| 2026-09-11 | Classification moved from Claude to Groq; model `gpt-oss-120b` | Provider switch; llama-3.3-70b wasn't available on this Groq account |
| 2026-09-12 | Compounds extracted during classify, uncapped, deduped on `lower(name)` | Product radar built from ingested sources; same pattern as topics |
| 2026-09-12 | `interest_rating = 0` means de-listed | Distinguishes "dismissed" from "never looked at" |
| 2026-09-12 | `source_type` split into scientific / non-peer-reviewed / white paper | "article" mixed peer-reviewed papers with news coverage |
| 2026-09-18 | PWA share target + async ingest via `after()` (202 response) | Two-tap mobile capture without waiting on the pipeline |
| 2026-09-19 | Wikipedia extract fetched lazily on first product view, cached on the row | Works for existing compounds and keeps ingest fast |
| 2026-11-14 | Reprioritized toward commercial signals and a theses table; executing S1 to S3 | Shift from a library of papers to commercial signals and testable calls |
| 2026-11-14 | Compound extraction is its own stage over the full text, in ~16K-char batches, run after the response | classify read only the first 12K chars; full text takes minutes under Groq tokens-per-minute limits |
| 2026-11-14 | End matter (references, "About {Company}", forward-looking statements, related links) excluded for every source type | Boilerplate inflated compound counts; press releases and news matter as much as papers |
| 2026-11-14 | Compounds dedupe on PubChem CID, falling back to `lower(name)`; a CID is accepted only if the name is one of its synonyms | Synonyms split counts; short names like "PHA" can match the wrong compound |
| 2026-11-14 | `compound_lookups` cache is shared, not owner-scoped | Public PubChem data; each name is looked up once |
| 2026-11-14 | Existing duplicates merged via a reviewed flow; de-listed vs rated decided per merge | Merges can't be undone |
| 2026-11-14 | `theses` + `thesis_sources` (stance: supports / contradicts / context) | Record calls with a review date and accumulate evidence for and against |
| 2026-11-14 | Dropped `theses.confidence` | A numeric confidence wasn't useful; the claim, change-my-mind and linked evidence carry the signal |
| 2026-11-14 | Thesis source suggestions: embed the claim, `match_chunks`, best passage per source; linked only when a stance is picked | Connect new theses to the existing library without unreviewed links |
| 2026-11-14 | Feed "Commercial" query type: Jina Search restricted to wires and trade press, plus deal terms | Open-web search buried commercial signals |
| 2026-11-14 | "News (open web)" results exclude the commercial sites | Keep News and Commercial queries from spending results on the same publications |
| 2026-11-14 | Compounds tagged industrial / pharma / both; radar toggles between them | Commercial ingredients and pharma starting materials are separate markets to track |
| 2026-11-14 | Junction-table links require owning both sides, on insert and update (`source_product_ideas`, migration 017) | Re-extraction upserts links; without an update policy RLS rejected them |
| 2026-11-15 | Groq request size derived from `GROQ_TPM_LIMIT` (input + `max_tokens` must fit); split and retry on 413 | Free tier rejects any single request over 8000 tokens; fixed-size batches lost compounds |
| 2026-11-16 | Vitest unit tests + pgTAP database tests; status moved from CLAUDE.md to `PROGRESS.md` | Guard fixes against regressions; keep CLAUDE.md to durable rules |
| 2026-11-16 | Feed web results must be individual, dated articles: listing pages (homepages, category / tag / archive / search pages) dropped by URL and title; undated results dropped | Category pages and homepages crowded out articles; an article has a title and a publish date |
| 2026-11-16 | Feed items classified by commercial signal (funding, partnership, acquisition, product launch, offtake / supply, capacity, regulatory, setback, research, market analysis) from title + snippet; the signal follows the item onto the source when ingested (018, 019) | Deal articles worth reading often name no compound; tags travel with the article into the library |
| 2026-11-16 | Products get a molecule class (small molecule, protein, enzyme, …); descriptions chosen by class: PubChem for small molecules, Wikipedia only on an exact-title match for a generic name, else the source's own description (020) | Wikipedia search on the brand "Sweelin" returned the composer Sweelinck; proteins and brands rarely have a PubChem or Wikipedia entry |
| 2026-11-16 | Descriptions are refreshed per product with a Refresh button, not reset in bulk | Most cached descriptions are fine; fix the wrong ones where they're noticed |
| 2026-11-16 | `product_aliases`: every name a compound goes by (names, brands, abbreviations, PubChem synonyms), unique per user; new mentions match on CID, then any alias (020) | A later source using only a brand name must land on the same product page |
| 2026-11-16 | Product header = the generic name used by the most sources (counted from `source_product_ideas.names_used`), never a brand unless nothing else exists; can be pinned by hand | Show the most common term; counting per link keeps re-extraction from inflating counts |
| 2026-11-16 | Production route (method, detail, evidence URL) stored per source–compound link; found from the article, else by a deep dig at ingest: up to 3 relevant article links, then one web search per compound, at most 5 pages, quote-verified | Different producers make the same compound different ways; the route is often on the company's page, not the article |
| 2026-11-16 | GRAS notice scraping deferred to the roadmap | Logged as a next step |
| 2026-11-16 | Major decisions are logged in CLAUDE.md as they're made, not only on request | Keep the log current |

## Working with me

### User preferences

- Whenever a file is edited, tell the user the entire set of commands they
  need to run before starting the server (e.g. `npm install` if a
  dependency changed, `npm run db:push` / `npm run db:types` if a migration
  changed, etc.) — not just the ones related to that specific edit.
- That command list must always include, in order, whenever Claude pushed
  commits this session:
  1. `git checkout src/lib/types/database.ts` — the user runs
     `npm run db:types` locally against their live Supabase project, which
     rewrites this file to differ from Claude's hand-committed version;
     leaving that local diff in place blocks the next `git pull`. Discard
     it first.
  2. `git pull` — never assume this is implicit or obvious; state it
     explicitly every time, even though it seems basic.
  3. Then the rest of the usual list (`npm install`, `npm run db:push`,
     `npm run db:types`, etc.) as needed for that push's changes.
  4. `npm run dev` to start the server — always state this explicitly as
     the final step, every time, even though it seems basic.
- State the command list as just the commands to run — no note about which
  ones were skipped or why something wasn't needed (e.g. don't add "no
  npm install needed, no new dependencies"). Silence on a command is enough.
- The user develops on a Windows PC (terminal, not Mac). Give shell
  instructions in PowerShell/CMD form, not macOS/Homebrew commands.

### Progress and wrap-up

- At each milestone (a feature, fix or migration landed, or a question opened or answered), update `PROGRESS.md`: done / next / open questions, plus its "Last updated" date.
- Append major decisions to the decisions log as they're made, in the same commit as the change. Never delete old decisions, and never put session status in CLAUDE.md.
