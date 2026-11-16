-- Mendel — classify feed items by commercial signal
--
-- Commercial queries surface partnership, funding and other deal articles
-- that are worth reading even when they name no compound. Each feed item
-- gets the type of signal it most likely carries (set by Groq from the title
-- and snippet when the feed refreshes) and a one-line note on what happened.
-- null = not classified yet.

create type feed_signal as enum (
  'funding',
  'partnership',
  'acquisition',
  'product_launch',
  'offtake_supply',
  'capacity',
  'regulatory',
  'setback',
  'research',
  'market_analysis',
  'other'
);

alter table feed_items
  add column signal_type feed_signal,
  add column signal_note text;
