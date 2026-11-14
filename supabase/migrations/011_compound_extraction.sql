-- Mendel — compound extraction as its own pipeline stage
--
-- Compounds used to be extracted inside classify(), which only reads the
-- first 12,000 characters of a source — so compounds discussed in the
-- results/discussion of long papers were missed. Extraction now runs over
-- the full text in batches, after the ingest response has gone out, and
-- tracks its own progress separately from ingest_status:
--
--   compounds_status null      = extracted the legacy way (first 12K chars),
--                                 never re-run — the backfill's work list
--   'pending' / 'running'       = queued / in progress
--   'complete' / 'failed'       = done / failed (compounds_error says why)
--
-- source_product_ideas.chunk_id records which chunk a compound's context
-- snippet came from, so it can be traced back to the passage.

create type compound_status as enum ('pending', 'running', 'complete', 'failed');

alter table sources
  add column compounds_status compound_status,
  add column compounds_error  text;

alter table source_product_ideas
  add column chunk_id uuid references chunks on delete set null;
