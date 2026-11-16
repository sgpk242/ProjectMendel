# Mendel progress

Last updated: 2026-11-16

Updated by Claude at each milestone. Durable rules and the decisions log live in `CLAUDE.md`.

## Done

- **Phases 0–3:** scaffold, schema, RLS, auth; six-stage ingest pipeline with dedup and similarity; dashboard search, filters, quick actions, collections, source detail; funding tracker, Product Idea Radar and product pages, papers feed.
- **Phase 3+:** PWA mobile capture (Android share sheet), Wikipedia descriptions on product pages.
- **S1 — full-text compound extraction** (migration 011): its own stage after ingest returns; works for papers, press releases, news and white papers; skips references and boilerplate; each compound records its source chunk.
- **S2 — PubChem normalization** (012): compounds dedupe on PubChem CID; reviewed merge flow on `/maintenance`.
- **S3 — theses** (013, 014): `/theses` with review dates and overdue flags, linking from source pages, suggested related sources; confidence field removed.
- **Feed:** "Commercial" query type (wires and trade press, 015) separate from open-web News; per-type query guides; tile renamed "Web-Scraped Sources for Review".
- **Industrial / Pharma toggle** on the Product Idea Radar (016), with AI tagging and a picker on product pages.
- **Maintenance** in the nav.
- **Fixes:** re-extract RLS failure (017); Groq requests sized to the tokens-per-minute limit, with split-and-retry on 413.
- **Test suite:** 34 Vitest unit tests (`npm test`) and 19 pgTAP database tests (`npm run test:db`).

## Next

1. **Structured event extraction:** dated launches, partnerships, funding rounds, offtake and capacity announcements, and approvals, linked to companies and compounds.
2. **Trend view** built on those events.
3. **Scheduled feed refresh.**
4. **Company newsrooms** as commercial sources.
5. **Chat** with citations (currently stubbed).

## Open questions

- **Live data:** finish `/maintenance` in order (look up names → apply merges → tag industrial / pharma → re-extract, including partially extracted sources) and report any errors. PubChem lookups and Groq tagging haven't been verified against the live services yet.
- **Groq tier:** the free tier makes a long paper take about 10–12 minutes and has a daily token cap that can stall a big backfill. Stay on it, or upgrade and set `GROQ_TPM_LIMIT`?
- **Commercial feed:** does the first refresh return results? Jina's handling of `OR` in the deal terms is unverified; if nothing comes back, blank `COMMERCIAL_QUERY_TERMS`.
- **Hosting:** which Vercel plan? Several routes set `maxDuration` 300, and free-tier compound extraction runs well past that.
- **Database tests on your PC:** `npm run test:db` needs Docker Desktop. Install it, or rely on the tests being run in Claude's sessions?
- **Cloud environment:** add `api.openalex.org` and `en.wikipedia.org` to the ProjectMendel environment (PubChem is already allowed) and start sessions on it.
