-- Work sessions: timer start/stop rules, one active timer, view isolation.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

insert into public.tasks (id, user_id, title, user_estimated_minutes)
values
  ('20000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'A task', 60),
  ('20000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a', 'A task 2', 30);

do $$
declare
  b public.schedule_blocks;
  s public.work_sessions;
begin
  b := public.create_schedule_block('20000000-0000-4000-a000-00000000000a',
         '2026-09-29 14:00Z', '2026-09-29 15:00Z');

  -- start from a block → links both ids, task becomes in_progress
  s := public.start_work_session(null, b.id);
  assert s.task_id = b.task_id and s.schedule_block_id = b.id, 'block start links task + block';
  assert s.ended_at is null and s.source = 'timer', 'running timer';
  assert (select status from public.tasks where id = b.task_id) = 'in_progress', 'task in_progress';

  -- second timer rejected
  begin
    perform public.start_work_session('20000000-0000-4000-a000-0000000000a2', null);
    raise exception 'FAIL: second active timer';
  exception when unique_violation then null;
  end;

  -- mismatched task/block rejected
  begin
    perform public.start_work_session('20000000-0000-4000-a000-0000000000a2', b.id);
    raise exception 'FAIL: mismatched block/task';
  exception when check_violation then null;
  end;

  -- stop (plain update) then a finished manual session; scores live in work_logs
  update public.work_sessions
     set ended_at = started_at + interval '50 minutes'
   where id = s.id;
  insert into public.work_logs (user_id, task_id, session_id, focus_score)
  values ('00000000-0000-4000-a000-00000000000a', b.task_id, s.id, 4);
  insert into public.work_sessions (user_id, task_id, started_at, ended_at, source)
  values ('00000000-0000-4000-a000-00000000000a', b.task_id,
          '2026-09-29 20:00Z', '2026-09-29 20:30Z', 'manual')
  returning * into s;
  insert into public.work_logs (user_id, task_id, session_id, focus_score)
  values ('00000000-0000-4000-a000-00000000000a', b.task_id, s.id, 2);

  -- manual session must be closed
  begin
    insert into public.work_sessions (user_id, task_id, started_at, source)
    values ('00000000-0000-4000-a000-00000000000a', b.task_id, now(), 'manual');
    raise exception 'FAIL: open manual session';
  exception when check_violation then null;
  end;

  -- closed tasks cannot start a timer
  update public.tasks set status = 'completed', completed_at = now()
   where id = '20000000-0000-4000-a000-0000000000a2';
  begin
    perform public.start_work_session('20000000-0000-4000-a000-0000000000a2', null);
    raise exception 'FAIL: timer on completed task';
  exception when check_violation then null;
  end;

  -- view: planned 60, actual 80, 2 sessions, avg focus 3
  assert (select planned_minutes from public.task_plan_actual where task_id = b.task_id) = 60, 'planned 60';
  assert (select actual_minutes from public.task_plan_actual where task_id = b.task_id) = 80, 'actual 80';
  assert (select session_count from public.task_plan_actual where task_id = b.task_id) = 2, '2 sessions';
  assert (select average_focus from public.task_plan_actual where task_id = b.task_id) = 3, 'avg focus 3';
  perform set_config('test.block_id', b.id::text, true);
end $$;

-- B: sees nothing in the view, cannot start on A's task/block
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.task_plan_actual) = 0, 'B sees no A rows in view';
  begin
    perform public.start_work_session('20000000-0000-4000-a000-00000000000a', null);
    raise exception 'FAIL: B started A task';
  exception when no_data_found then null;
  end;
  begin
    perform public.start_work_session(null, current_setting('test.block_id')::uuid);
    raise exception 'FAIL: B started A block';
  exception when no_data_found then null;
  end;
end $$;

reset role;
set local role anon;
do $$
begin
  perform 1 from public.task_plan_actual;
  raise exception 'FAIL: anon read view';
exception when insufficient_privilege then null;
end $$;

select 'PASS work_sessions' as result;
rollback;
