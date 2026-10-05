-- ADR 0046 V5: practice sessions/items/attempts are own-row; a session and its items are created together; at most
-- three attempts per item.
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
  s uuid;
  i uuid;
begin
  select * into w from public.vocab_upsert_words(a, '[{"notion_page_id":"p1","term":"ubiquitous","topics":[]}]'::jsonb);
  s := public.vocab_create_practice(a, 'B2', 'manual', null, array[w.id], 'gen-v1', 'fake-1',
    jsonb_build_array(jsonb_build_object('target_word_ids', jsonb_build_array(w.id), 'prompt_ko', '요즘 스마트폰은 어디에나 있어요.', 'hint_ko', '')));
  assert (select cefr from public.vocab_practice_sessions where id = s) = 'B2', 'session';
  select id into i from public.vocab_practice_items where session_id = s;
  assert (select position from public.vocab_practice_items where id = i) = 1, 'item position';
  insert into public.vocab_practice_attempts (item_id, user_id, answer, feedback) values (i, a, 'one', '{}'), (i, a, 'two', '{}'), (i, a, 'three', '{}');
  begin
    insert into public.vocab_practice_attempts (item_id, user_id, answer, feedback) values (i, a, 'four', '{}');
    assert false, 'at most three attempts';
  exception when check_violation then null; end;
  begin
    insert into public.vocab_practice_attempts (item_id, user_id, answer, feedback) values (i, a, '', '{}');
    assert false, 'empty answer';
  exception when check_violation then null; end;
  begin
    perform public.vocab_create_practice(a, 'Z9', 'manual', null, array[w.id], 'v', 'm', '[]'::jsonb);
    assert false, 'cefr check';
  exception when check_violation then null; end;
  begin
    perform public.vocab_create_practice('00000000-0000-4000-a000-00000000000b', 'B1', 'manual', null, array[w.id], 'v', 'm', '[]'::jsonb);
    assert false, 'A cannot create for B';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.vocab_practice_sessions) = 0, 'B cannot read A sessions';
  assert (select count(*) from public.vocab_practice_items) = 0, 'B cannot read A items';
  assert (select count(*) from public.vocab_practice_attempts) = 0, 'B cannot read A attempts';
end $$;
reset role;
select 'PASS vocab_practice';
rollback;
