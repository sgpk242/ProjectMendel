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
- **Test suite:** Vitest unit tests (`npm test`) and 24 pgTAP database tests (`npm run test:db`).
- **Feed cleanup:** web searches drop listing pages (category, tag, topic, author, archive, search and section pages, homepages), and stored ones are hidden on `/feed` and the dashboard tile; spinner and error message on "Ingest"; "Papers" labels renamed to "Sources"; dashboard tile renamed "Manual Source Upload".
- **Feed articles only + signals** (018): web results need a publish date (Jina date field, URL, or a byline date near the top of the page), which is now stored and shown. Each refresh classifies unclassified new/reviewed items with Groq (title + snippet) into a signal type (funding, partnership, acquisition, product launch, offtake/supply, capacity, regulatory, setback, research, market analysis, other) plus a one-line note; `/feed` filters by signal. Refresh reports added / skipped / classified counts.
- **Signals follow articles into the library** (019): ingesting a feed item copies its signal and note onto the source (classifying it on the spot if the refresh hadn't); shown as a badge on library cards and an editable "Signal" picker plus "What happened" note on the source page. The migration backfills sources already ingested from classified feed items. Directly captured sources start untagged.
- **Compound identity** (020):
  - **Molecule category** on every product (small molecule, protein, enzyme…). Set at extraction while empty, editable on the product page, with a `/maintenance` backfill.
  - **Descriptions by class:** PubChem for small molecules; Wikipedia only on an exact-title match for a generic name, never a brand; otherwise the source's own description. Each product has a Refresh button.
  - **Aliases** (`product_aliases`): names, brands, abbreviations and PubChem synonyms. A new mention matching any alias links to the existing product. Shown on the product page, where any alias can be made the header or removed.
  - **Header** = the generic name the most sources use, unless pinned by hand.
  - **Production routes** per source: taken from the article; otherwise a deep dig at ingest (up to 3 relevant article links, then a web search, at most 5 pages, quote-verified). Shown under "How it's made" with evidence links.
  - **Re-extract on `/maintenance`** now covers every source extracted before this, to collect brands, categories and routes.

## Next

1. **Structured event extraction:** dated launches, partnerships, funding rounds, offtake and capacity announcements, and approvals, linked to companies and compounds.
2. **Trend view** built on those events.
3. **Scheduled feed refresh.**
4. **Company newsrooms** as commercial sources.
5. **Chat** with citations (currently stubbed).
6. **GRAS notice scraping into the feed:** FDA GRAS notices as a feed source type.

## Open questions

- **Live data:** finish `/maintenance` in order (look up names → apply merges → tag industrial / pharma → re-extract, including partially extracted sources) and report any errors. PubChem lookups and Groq tagging haven't been verified against the live services yet.
- **Groq tier:** the free tier makes a long paper take about 10–12 minutes and has a daily token cap that can stall a big backfill. Stay on it, or upgrade and set `GROQ_TPM_LIMIT`?
- **Commercial feed:** does the first refresh return results? Jina's handling of `OR` in the deal terms is unverified; if nothing comes back, blank `COMMERCIAL_QUERY_TERMS`.
- **Undated-page filter is unverified against live Jina:** if a refresh reports many "undated" skips and few new items, Jina Search isn't returning page text or dates in the shape assumed; send the refresh message.
- **After pulling 020:**
  1. Run `/maintenance` → "Classify molecule categories".
  2. Run "Re-extract", which collects brands and production routes for existing sources and takes a few minutes per source.
  3. On a product with a wrong description (e.g. the Sweelin page), click Refresh.

  Existing products keep their current header until a source is re-extracted.
- **Deep dig cost:** each ingest now makes up to 5 extra page reads and Groq calls after the response, which adds to Groq free-tier time and the Vercel `maxDuration` concern below.
- **Listing-page filter:** it judges by URL patterns and titles. If a category page still gets through, send the URL so its pattern can be added. A WordPress category nested two levels deep (`/category/a/b/`) is let through on purpose: GEN files real articles at `/topics/<area>/<slug>/`.
- **Hosting:** which Vercel plan? Several routes set `maxDuration` 300, and free-tier compound extraction runs well past that.
- **Database tests on your PC:** `npm run test:db` needs Docker Desktop. Install it, or rely on the tests being run in Claude's sessions?
- **Cloud environment:** add `api.openalex.org` and `en.wikipedia.org` to the ProjectMendel environment (PubChem is already allowed) and start sessions on it.
