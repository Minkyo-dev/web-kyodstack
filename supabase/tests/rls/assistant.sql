-- ADR 0039/0040: assistant_briefs and assistant_proposals are own-only (no update); a reflection's next task must be the owner's and is cleared
-- when that task is deleted.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.tasks (id, user_id, title) values
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-a000-00000000000a', 'A task'),
  ('00000000-0000-4000-c000-0000000000b1', '00000000-0000-4000-a000-00000000000b', 'B task');
insert into public.assistant_briefs (user_id, local_date, line, prompt_version) values
  ('00000000-0000-4000-a000-00000000000b', '2026-10-02', 'B line', 'brief-line-v1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare n int; begin
  assert (select count(*) from public.assistant_briefs) = 0, 'A cannot read B briefs';
  insert into public.assistant_briefs (user_id, local_date, line, prompt_version)
    values ('00000000-0000-4000-a000-00000000000a', '2026-10-02', 'A line', 'brief-line-v1');
  assert (select count(*) from public.assistant_briefs) = 1, 'A reads own brief';
  begin
    insert into public.assistant_briefs (user_id, local_date, line, prompt_version)
      values ('00000000-0000-4000-a000-00000000000b', '2026-10-03', 'x', 'v');
    assert false, 'A cannot insert for B';
  exception when insufficient_privilege then null; end;
  begin
    update public.assistant_briefs set line = 'edited';
    assert false, 'no update';
  exception when insufficient_privilege then null; end;
  delete from public.assistant_briefs where user_id = '00000000-0000-4000-a000-00000000000b';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot delete B briefs';

  -- next task: own task ok, B's task rejected by the composite FK
  insert into public.daily_reflections (user_id, reflection_date, next_task_id, blocker, win)
    values ('00000000-0000-4000-a000-00000000000a', '2026-10-02', '00000000-0000-4000-c000-0000000000a1', 'time', 'shipped');
  begin
    update public.daily_reflections set next_task_id = '00000000-0000-4000-c000-0000000000b1';
    assert false, 'foreign next task rejected';
  exception when foreign_key_violation then null; end;
  begin
    update public.daily_reflections set blocker = 'lazy';
    assert false, 'unknown blocker rejected';
  exception when check_violation then null; end;
  delete from public.tasks where id = '00000000-0000-4000-c000-0000000000a1';
  assert (select next_task_id from public.daily_reflections where reflection_date = '2026-10-02') is null, 'cleared on task delete';
  assert (select user_id from public.daily_reflections where reflection_date = '2026-10-02') is not null, 'reflection kept';
end $$;

-- ADR 0040: proposals are own-only; only status/decided_at can change; one focus per user and week.
reset role;
insert into public.assistant_proposals (user_id, week_start, kind, target_key, title, reason, payload, focus, rules_version) values
  ('00000000-0000-4000-a000-00000000000b', '2026-09-28', 'review', 'b', 'B', 'B', '{}', true, 'coach-v1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare n int; begin
  assert (select count(*) from public.assistant_proposals) = 0, 'A cannot read B proposals';
  insert into public.assistant_proposals (user_id, week_start, kind, target_key, title, reason, payload, focus, rules_version)
    values ('00000000-0000-4000-a000-00000000000a', '2026-09-28', 'review', 'a1', 'A', 'A', '{}', true, 'coach-v1');
  begin
    insert into public.assistant_proposals (user_id, week_start, kind, target_key, title, reason, payload, focus, rules_version)
      values ('00000000-0000-4000-a000-00000000000a', '2026-09-28', 'review', 'a2', 'A2', 'A2', '{}', true, 'coach-v1');
    assert false, 'one focus per week';
  exception when unique_violation then null; end;
  update public.assistant_proposals set status = 'applied', decided_at = now() where target_key = 'a1';
  assert (select status from public.assistant_proposals where target_key = 'a1') = 'applied', 'own decision';
  begin
    update public.assistant_proposals set payload = '{"x":1}' where target_key = 'a1';
    assert false, 'payload is write-once';
  exception when insufficient_privilege then null; end;
  begin
    update public.assistant_proposals set status = 'bogus' where target_key = 'a1';
    assert false, 'status check';
  exception when check_violation then null; end;
  update public.assistant_proposals set status = 'dismissed' where target_key = 'b';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot decide B proposals';
  begin
    insert into public.assistant_proposals (user_id, week_start, kind, target_key, title, reason, payload, rules_version)
      values ('00000000-0000-4000-a000-00000000000b', '2026-09-28', 'review', 'x', 'x', 'x', '{}', 'coach-v1');
    assert false, 'A cannot insert for B';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', true);
set local role anon;
do $$ begin
  begin
    perform count(*) from public.assistant_briefs;
    assert false, 'anon has no access';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.assistant_proposals;
    assert false, 'anon has no access to proposals';
  exception when insufficient_privilege then null; end;
end $$;
select 'PASS assistant';
rollback;
