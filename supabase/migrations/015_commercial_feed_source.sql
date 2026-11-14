-- Mendel — "commercial" feed query type
--
-- 'web' queries search the open web exactly as typed, so commercial news
-- (product launches, partnerships, funding, offtake and capacity deals)
-- competes with everything else. 'commercial' queries search only a curated
-- list of press-release wires and trade publications
-- (src/lib/feed/commercial-sites.ts) with deal-related terms added.

alter type feed_source_type add value if not exists 'commercial';
