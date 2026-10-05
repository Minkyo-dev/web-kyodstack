-- ADR 0046 V1: vocab_words / vocab_cards are own-row; vocab_upsert_words writes a word and its two cards atomically,
-- never lets an older Notion edit overwrite a newer one, and can't write for another user.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
select public.vocab_upsert_words('00000000-0000-4000-a000-00000000000b', '[{"notion_page_id":"pb","term":"B word","topics":[]}]'::jsonb);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare
  a constant uuid := '00000000-0000-4000-a000-00000000000a';
  w public.vocab_words;
  n int;
begin
  assert (select count(*) from public.vocab_words) = 0, 'A cannot read B words';
  assert (select count(*) from public.vocab_cards) = 0, 'A cannot read B cards';
  update public.vocab_words set term = 'x';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot update B words';

  select * into w from public.vocab_upsert_words(a, '[{"notion_page_id":"p1","notion_url":"https://www.notion.so/p1","term":"ubiquitous","meaning":"어디에나 있는","topics":["IT","일상"],"cefr":"C1","notion_status":"새 단어","notion_last_edited_at":"2026-10-05T10:01:00Z"}]'::jsonb);
  assert w.term = 'ubiquitous' and w.topics = '{IT,일상}' and w.cefr = 'C1', 'upsert inserts the fields';
  assert (select count(*) from public.vocab_cards where word_id = w.id) = 2, 'two cards';
  assert (select array_agg(direction order by direction) from public.vocab_cards where word_id = w.id) = '{recall,recognition}', 'both directions';

  perform public.vocab_upsert_words(a, '[{"notion_page_id":"p1","term":"ubiquitous","meaning":"편재하는","topics":[],"notion_last_edited_at":"2026-10-05T10:05:00Z"}]'::jsonb);
  assert (select meaning from public.vocab_words where id = w.id) = '편재하는', 'newer edit updates';
  assert (select count(*) from public.vocab_cards where word_id = w.id) = 2, 'no duplicate cards';

  perform public.vocab_upsert_words(a, '[{"notion_page_id":"p1","term":"stale","topics":[],"notion_last_edited_at":"2026-10-05T09:00:00Z"}]'::jsonb);
  assert (select term from public.vocab_words where id = w.id) = 'ubiquitous', 'older edit is ignored';

  update public.vocab_words set deleted_at = now() where id = w.id;
  perform public.vocab_upsert_words(a, '[{"notion_page_id":"p1","term":"ubiquitous","topics":[],"notion_last_edited_at":"2026-10-05T10:06:00Z"}]'::jsonb);
  assert (select deleted_at is null from public.vocab_words where id = w.id), 'a returning page is restored';

  begin
    perform public.vocab_upsert_words('00000000-0000-4000-a000-00000000000b', '[{"notion_page_id":"evil","term":"x","topics":[]}]'::jsonb);
    assert false, 'A cannot write words for B';
  exception when insufficient_privilege then null; end;
  begin
    perform public.vocab_upsert_words(a, '[{"notion_page_id":"p9","term":"x","topics":[],"cefr":"B3"}]'::jsonb);
    assert false, 'cefr check';
  exception when check_violation then null; end;
  begin
    perform public.vocab_upsert_words(a, '[{"notion_page_id":"p9","term":"","topics":[]}]'::jsonb);
    assert false, 'term required';
  exception when check_violation then null; end;

  delete from public.vocab_words where id = w.id;
  assert (select count(*) from public.vocab_cards) = 0, 'cards cascade with the word';
end $$;

select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', true);
set local role anon;
do $$ begin
  begin perform count(*) from public.vocab_words; assert false, 'anon words'; exception when insufficient_privilege then null; end;
  begin perform public.vocab_upsert_words('00000000-0000-4000-a000-00000000000a', '[]'::jsonb); assert false, 'anon rpc'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS vocab_words';
rollback;
