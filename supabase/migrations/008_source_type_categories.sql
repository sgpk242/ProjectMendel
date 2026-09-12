-- Mendel — split the ambiguous 'article'/'paper' source types
--
-- 'article' had covered both peer-reviewed journal papers and industry
-- news/aggregator coverage, which meant a Nature paper and a trade blog
-- post landed in different buckets ('paper' vs 'article') inconsistently
-- depending on how the LLM read the page. Split into explicit categories
-- and add a white-paper category industry/vendor reports didn't have a
-- home in before.
--
-- `rename value` keeps every existing row's classification intact — it
-- only changes the label, not the underlying enum member, so no data
-- migration is needed. `add value` cannot be referenced in the same
-- transaction it's added in, but this migration doesn't need to.

alter type source_type rename value 'paper' to 'scientific_paper';
alter type source_type rename value 'article' to 'non_peer_reviewed_article';
alter type source_type add value 'white_paper';
