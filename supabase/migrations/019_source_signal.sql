-- Mendel — carry a feed item's commercial signal onto the ingested source
--
-- Feed items are classified by signal (funding, partnership, …; migration
-- 018). The tag should follow the article into the library, so sources get
-- the same two columns, filled from the feed item when it is ingested and
-- correctable on the source page. Sources captured directly (not from the
-- feed) stay null.
--
-- Backfill: sources already ingested from a classified feed item take its
-- signal. Only null rows are touched.

alter table sources
  add column signal_type feed_signal,
  add column signal_note text;

update sources s
set signal_type = f.signal_type,
    signal_note = f.signal_note
from feed_items f
where f.ingested_source_id = s.id
  and f.user_id = s.user_id
  and f.signal_type is not null
  and s.signal_type is null;
