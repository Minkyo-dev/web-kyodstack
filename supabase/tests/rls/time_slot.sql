-- ADR 0044: the proposal kind check accepts time_slot; unknown kinds still fail. Own-only access is covered by assistant.sql.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ begin
  insert into public.assistant_proposals (user_id, week_start, kind, target_key, title, reason, payload, rules_version)
    values ('00000000-0000-4000-a000-00000000000a', '2026-09-28', 'time_slot', 'p', 't', 'r', '{}', 'coach-v2');
  assert (select count(*) from public.assistant_proposals where kind = 'time_slot') = 1, 'time_slot accepted';
  begin
    insert into public.assistant_proposals (user_id, week_start, kind, target_key, title, reason, payload, rules_version)
      values ('00000000-0000-4000-a000-00000000000a', '2026-09-28', 'bogus', 'p', 't', 'r', '{}', 'coach-v2');
    assert false, 'unknown kind rejected';
  exception when check_violation then null; end;
end $$;
rollback;
