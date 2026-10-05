-- ADR 0046 V2: reviews apply/undo atomically (idempotent, reps-checked), the outbox coalesces per word,
-- Notion 상태 transitions suspend/unsuspend cards, and every new table is own-row.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
select public.vocab_upsert_words('00000000-0000-4000-a000-00000000000b', '[{"notion_page_id":"pb","term":"B","topics":[]}]'::jsonb);
insert into public.vocab_settings (user_id) values ('00000000-0000-4000-a000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare
  a constant uuid := '00000000-0000-4000-a000-00000000000a';
  w public.vocab_words;
  w2 public.vocab_words;
  c public.vocab_cards;
  r jsonb;
  after_card jsonb := '{"fsrs_state":"review","due":"2026-10-08T10:00:00Z","stability":3.1,"difficulty":5.2,"elapsed_days":0,"scheduled_days":3,"learning_steps":0,"reps":1,"lapses":0,"last_review":"2026-10-05T10:00:00Z"}';
  rv jsonb := '{"client_review_id":"11111111-1111-4111-8111-111111111111","rating":3,"reviewed_at":"2026-10-05T10:00:00Z","duration_ms":4200,"algo_version":"fsrs-6@test"}';
begin
  assert (select count(*) from public.vocab_settings) = 0, 'A cannot read B settings';
  select * into w from public.vocab_upsert_words(a, '[{"notion_page_id":"p1","term":"ubiquitous","topics":[],"notion_status":"새 단어","notion_last_edited_at":"2026-10-05T10:00:00Z"}]'::jsonb);
  select * into c from public.vocab_cards where word_id = w.id and direction = 'recognition';

  r := public.vocab_apply_review(c.id, 0, after_card, rv);
  assert r->>'status' = 'applied', 'applied';
  assert (select reps from public.vocab_cards where id = c.id) = 1, 'card updated';
  assert (select fsrs_state from public.vocab_cards where id = c.id) = 'review', 'state updated';
  assert (select count(*) from public.vocab_reviews where card_id = c.id) = 1, 'review logged';
  assert (select before->>'fsrs_state' from public.vocab_reviews where card_id = c.id) = 'new', 'before taken from the row';

  r := public.vocab_apply_review(c.id, 0, after_card, rv);
  assert r->>'status' = 'duplicate', 'same client_review_id is a no-op';
  assert (select count(*) from public.vocab_reviews where card_id = c.id) = 1, 'still one review';

  begin
    perform public.vocab_apply_review(c.id, 0, after_card, jsonb_set(rv, '{client_review_id}', '"22222222-2222-4222-8222-222222222222"'));
    assert false, 'stale reps must conflict';
  exception when sqlstate 'V0409' then null; end;

  r := public.vocab_undo_review(c.id);
  assert (select reps from public.vocab_cards where id = c.id) = 0, 'undo restores reps';
  assert (select fsrs_state from public.vocab_cards where id = c.id) = 'new', 'undo restores state';
  assert (select count(*) from public.vocab_reviews where card_id = c.id) = 0, 'undo deletes the review';
  begin
    perform public.vocab_undo_review(c.id);
    assert false, 'nothing to undo';
  exception when no_data_found then null; end;

  perform public.vocab_enqueue_writeback(a, w.id, '{"status":"학습 중","nextReview":"2026-10-08"}');
  perform public.vocab_enqueue_writeback(a, w.id, '{"status":"학습 중","nextReview":"2026-10-09"}');
  assert (select count(*) from public.vocab_outbox where word_id = w.id and done_at is null) = 1, 'one pending row per word';
  assert (select payload->>'nextReview' from public.vocab_outbox where word_id = w.id) = '2026-10-09', 'latest payload wins';

  -- Notion 상태 → 학습 완료 suspends; leaving it unsuspends and makes the cards due now.
  perform public.vocab_upsert_words(a, '[{"notion_page_id":"p1","term":"ubiquitous","topics":[],"notion_status":"학습 완료","notion_last_edited_at":"2026-10-05T11:00:00Z"}]'::jsonb);
  assert (select count(*) from public.vocab_cards where word_id = w.id and suspended_at is not null) = 2, 'learned in Notion suspends';
  update public.vocab_cards set due = '2030-01-01' where word_id = w.id;
  perform public.vocab_upsert_words(a, '[{"notion_page_id":"p1","term":"ubiquitous","topics":[],"notion_status":"학습 중","notion_last_edited_at":"2026-10-05T12:00:00Z"}]'::jsonb);
  assert (select count(*) from public.vocab_cards where word_id = w.id and suspended_at is null and due <= now()) = 2, 'cleared in Notion unsuspends, due now';
  perform public.vocab_upsert_words(a, '[{"notion_page_id":"p1","term":"ubiquitous","topics":[],"notion_status":"학습 중","notion_next_review":"2026-10-20","notion_last_edited_at":"2026-10-05T13:00:00Z"}]'::jsonb);
  assert (select count(*) from public.vocab_cards where word_id = w.id and suspended_at is null) = 2, 'same status: no transition';
  assert (select notion_next_review from public.vocab_words where id = w.id) = '2026-10-20', 'next review mirrored';

  select * into w2 from public.vocab_upsert_words(a, '[{"notion_page_id":"p2","term":"done","topics":[],"notion_status":"학습 완료"}]'::jsonb);
  assert (select count(*) from public.vocab_cards where word_id = w2.id and suspended_at is not null) = 2, 'a word first seen as 학습 완료 starts suspended';

  insert into public.vocab_settings (user_id, new_per_day) values (a, 10);
  begin
    update public.vocab_settings set directions = '{}';
    assert false, 'directions must not be empty';
  exception when check_violation then null; end;
  begin
    update public.vocab_settings set desired_retention = 0.99;
    assert false, 'retention range';
  exception when check_violation then null; end;
  begin
    perform public.vocab_enqueue_writeback('00000000-0000-4000-a000-00000000000b', w.id, '{}');
    assert false, 'A cannot enqueue for B';
  exception when insufficient_privilege or foreign_key_violation then null; end;
end $$;

select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', true);
set local role anon;
do $$ begin
  begin perform count(*) from public.vocab_reviews; assert false, 'anon reviews'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.vocab_outbox; assert false, 'anon outbox'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS vocab_study';
rollback;
