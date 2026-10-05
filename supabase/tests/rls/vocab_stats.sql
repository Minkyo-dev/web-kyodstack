-- ADR 0046 V3: per-local-day review counts (DST-safe, own rows only) and the vocab_due notification kind.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare
  a constant uuid := '00000000-0000-4000-a000-00000000000a';
  w public.vocab_words;
  c uuid;
  d record;
begin
  select * into w from public.vocab_upsert_words(a, '[{"notion_page_id":"p1","term":"x","topics":[]}]'::jsonb);
  select id into c from public.vocab_cards where word_id = w.id and direction = 'recognition';
  -- 2026-11-01 is the DST change in Toronto; 03:30Z on Nov 2 is still Nov 1 local (UTC-5).
  insert into public.vocab_reviews (user_id, card_id, client_review_id, rating, reviewed_at, before, after, algo_version) values
    (a, c, gen_random_uuid(), 3, '2026-11-01T14:00:00Z', '{"fsrs_state":"new"}', '{}', 't'),
    (a, c, gen_random_uuid(), 1, '2026-11-02T03:30:00Z', '{"fsrs_state":"review"}', '{}', 't'),
    (a, c, gen_random_uuid(), 3, '2026-11-02T15:00:00Z', '{"fsrs_state":"review"}', '{}', 't');
  select * into d from public.vocab_review_days(a, 'America/Toronto', '2026-10-01T00:00:00Z') where local_date = '2026-11-01';
  assert d.reviews = 2 and d.again = 1 and d.studied = 1 and d.studied_ok = 0, 'Nov 1 local: 2 reviews, 1 again, 1 studied, 0 ok';
  select * into d from public.vocab_review_days(a, 'America/Toronto', '2026-10-01T00:00:00Z') where local_date = '2026-11-02';
  assert d.reviews = 1 and d.studied_ok = 1, 'Nov 2 local';
  assert (select count(*) from public.vocab_review_days('00000000-0000-4000-a000-00000000000b', 'America/Toronto', '2026-10-01T00:00:00Z')) = 0, 'another user sees nothing';
  insert into public.notification_prefs (user_id, vocab_due) values (a, false);
  assert (select vocab_due from public.notification_prefs where user_id = a) = false, 'vocab_due pref';
end $$;
reset role;
insert into public.notification_log (user_id, kind, dedupe_key, local_date, title) values ('00000000-0000-4000-a000-00000000000a', 'vocab_due', 'vocab:2026-11-01', '2026-11-01', 't');
select 'PASS vocab_stats';
rollback;
