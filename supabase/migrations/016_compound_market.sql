-- Mendel — tag compounds by market: industrial, pharma, or both
--
-- The Product Idea Radar toggles between industrial compounds (food and feed
-- ingredients, chemicals, materials, cosmetics, ag) and pharma compounds
-- (APIs, pharma starting materials and intermediates). Tags are set by the
-- compound-extraction model for new compounds, by a one-time /maintenance
-- pass for existing ones, and can be corrected on the product page.
-- null = not tagged yet; the radar shows untagged compounds under both.

create type compound_market as enum ('industrial', 'pharma', 'both');

alter table product_ideas add column market compound_market;
