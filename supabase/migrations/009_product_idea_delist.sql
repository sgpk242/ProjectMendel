-- Mendel — allow "de-listing" a product idea
--
-- interest_rating semantics: null = never rated (never shown on the Product
-- Idea Radar tile); 1-5 = rated, shown on the tile; 0 = explicitly
-- de-listed by the user from the product details page — distinct from
-- "never rated" so the app can tell "hasn't been looked at" apart from
-- "looked at and dismissed" if that distinction is ever surfaced, but
-- treated the same as null for tile visibility (both are excluded).

alter table product_ideas
  drop constraint product_ideas_interest_rating_check;

alter table product_ideas
  add constraint product_ideas_interest_rating_check
  check (interest_rating between 0 and 5);
