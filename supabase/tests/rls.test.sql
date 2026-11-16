-- Row-level security and data-integrity tests (pgTAP).
--
-- Run with `npx supabase start` then `npm run test:db` (= `supabase test db`),
-- which runs every file in supabase/tests against the local Supabase stack
-- with all migrations applied — never the live project. Everything happens
-- inside one transaction that is rolled back.
--
-- Acting as a user: `set local role authenticated` plus a JWT `sub` claim,
-- which is what auth.uid() reads.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

-- ------------------------------------------------------------- fixtures ---
-- Inserted as the table owner, so RLS doesn't apply here.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.test');

insert into sources (id, user_id, url, url_canonical) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'https://x.test/1', 'https://x.test/1'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'https://x.test/2', 'https://x.test/2'),
  ('a0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'https://y.test/3', 'https://y.test/3');

insert into product_ideas (id, user_id, name) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Reb M'),
  ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'rebaudioside M'),
  ('b0000000-0000-0000-0000-0000000000ff', '22222222-2222-2222-2222-222222222222', 'Other user compound');

insert into source_product_ideas (source_id, product_idea_id, context, relevance_score) values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'old', 0.5),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'b ctx', 0.9);

insert into theses (id, user_id, claim) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Owner thesis'),
  ('c0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Other thesis');

insert into thesis_sources (thesis_id, source_id, stance) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'supports');

-- ------------------------------------------------------- as the owner ---

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is((select count(*)::int from sources), 2, 'owner sees only their own sources');
select is((select count(*)::int from theses), 1, 'owner sees only their own theses');
select is((select count(*)::int from thesis_sources), 1, 'owner sees their thesis links');

select lives_ok(
  $$ insert into source_product_ideas (source_id, product_idea_id, context, relevance_score)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'new', 0.8)
     on conflict (source_id, product_idea_id) do update set context = excluded.context $$,
  're-extraction can upsert an existing compound link (017)'
);
select is(
  (select context from source_product_ideas where source_id = 'a0000000-0000-0000-0000-000000000001'),
  'new', 'the upsert updated the existing link'
);

select throws_ok(
  $$ insert into source_product_ideas (source_id, product_idea_id)
     values ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-0000000000ff') $$,
  '42501', null, 'cannot link own source to another user''s compound'
);
select throws_ok(
  $$ update source_product_ideas set product_idea_id = 'b0000000-0000-0000-0000-0000000000ff'
     where source_id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'cannot re-point a link at another user''s compound'
);
select throws_ok(
  $$ insert into thesis_sources (thesis_id, source_id, stance)
     values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'context') $$,
  '42501', null, 'cannot link own thesis to another user''s source'
);
select throws_ok(
  $$ insert into theses (user_id, claim) values ('11111111-1111-1111-1111-111111111111', '   ') $$,
  '23514', null, 'a thesis needs a non-blank claim'
);

-- ------------------------------------------------- as the other user ---

set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is((select count(*)::int from theses), 1, 'other user sees only their own thesis');
select is((select count(*)::int from source_product_ideas), 0, 'other user sees none of the owner''s compound links');

update source_product_ideas set context = 'hijacked';

select throws_ok(
  $$ select merge_product_ideas('b0000000-0000-0000-0000-000000000002',
       array['b0000000-0000-0000-0000-000000000001']::uuid[], 'x', null, null, null, null, '{}') $$,
  'P0001', null, 'other user cannot merge the owner''s compounds'
);

-- --------------------------------------------------------- unchanged? ---

reset role;
select is(
  (select context from source_product_ideas where source_id = 'a0000000-0000-0000-0000-000000000001'),
  'new', 'other user''s update changed nothing'
);

-- ----------------------------------------------------------- merging ---

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select lives_ok(
  $$ select merge_product_ideas('b0000000-0000-0000-0000-000000000002',
       array['b0000000-0000-0000-0000-000000000001']::uuid[], 'Rebaudioside M', 4, null,
       92023628, 'Rebaudioside M', array['Reb M']) $$,
  'owner can merge duplicate compounds'
);
select is(
  (select count(*)::int from source_product_ideas where product_idea_id = 'b0000000-0000-0000-0000-000000000002'),
  2, 'merge keeps every source link'
);
select is(
  (select count(*)::int from product_ideas where id = 'b0000000-0000-0000-0000-000000000001'),
  0, 'merge removes the absorbed row'
);

-- ------------------------------------------------- uniqueness (012) ---

reset role;

select throws_ok(
  $$ insert into product_ideas (user_id, name, pubchem_cid)
     values ('11111111-1111-1111-1111-111111111111', 'Another name', 92023628) $$,
  '23505', null, 'one compound per PubChem CID per user'
);
select throws_ok(
  $$ insert into product_ideas (user_id, name)
     values ('11111111-1111-1111-1111-111111111111', 'OTHER USER COMPOUND'),
            ('11111111-1111-1111-1111-111111111111', 'other user compound') $$,
  '23505', null, 'names without a CID are unique case-insensitively'
);
select lives_ok(
  $$ insert into product_ideas (user_id, name, pubchem_cid)
     values ('11111111-1111-1111-1111-111111111111', 'Rebaudioside M', 4242) $$,
  'a name may repeat when the rows have different CIDs'
);

select * from finish();
rollback;
