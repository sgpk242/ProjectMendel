-- Mendel — track when Groq's classification output hit its token limit
--
-- `finish_reason === 'length'` on the classify() response means the model's
-- JSON was cut off mid-output rather than completing naturally — the
-- summary, topics, or (most likely, since it's now uncapped) the compounds
-- array may be incomplete. Surfaced on the source detail page rather than
-- silently accepted.

alter table sources
  add column classification_truncated boolean not null default false;
