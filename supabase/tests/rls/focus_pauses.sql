-- Focus flow: pauses, work logs, stop/switch functions, view v2, RLS.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

-- B owns a running session (created as B)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
insert into public.tasks (id, user_id, title)
values ('30000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'B task');
insert into public.work_sessions (id, user_id, task_id, started_at, source)
values ('40000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000b',
        '30000000-0000-4000-a000-00000000000b', now() - interval '10 minutes', 'timer');

-- Switch to A
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
insert into public.tasks (id, user_id, title, user_estimated_minutes)
values
  ('30000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'A task', 60),
  ('30000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a', 'A task 2', 30);

do $$
declare
  s public.work_sessions;
  s2 public.work_sessions;
  p public.work_session_pauses;
  n int;
begin
  -- A cannot pause B's session
  begin
    perform public.pause_work_session('40000000-0000-4000-a000-00000000000b');
    raise exception 'FAIL: paused another user''s session';
  exception when no_data_found then null;
  end;
  assert (select count(*) from public.work_session_pauses) = 0, 'A sees no pauses of B';
  assert (select count(*) from public.work_logs) = 0, 'A sees no logs of B';

  -- Start, pause with reason, second pause rejected
  s := public.start_work_session('30000000-0000-4000-a000-00000000000a', null);
  p := public.pause_work_session(s.id, 'coffee');
  assert p.resumed_at is null and p.reason = 'coffee', 'open pause with reason';
  begin
    perform public.pause_work_session(s.id);
    raise exception 'FAIL: second open pause';
  exception when check_violation then null;
  end;

  -- Resume closes it; resume again rejected
  p := public.resume_work_session(s.id);
  assert p.resumed_at is not null, 'resumed';
  begin
    perform public.resume_work_session(s.id);
    raise exception 'FAIL: resume when not paused';
  exception when check_violation then null;
  end;

  -- Make the timeline deterministic: session 60 min ago, pause 40..30 min ago (10 min)
  update public.work_sessions set started_at = now() - interval '60 minutes' where id = s.id;
  update public.work_session_pauses
     set paused_at = now() - interval '40 minutes', resumed_at = now() - interval '30 minutes'
   where id = p.id;

  -- End before the pause → rejected, nothing changes
  begin
    perform public.stop_work_session(s.id, now() - interval '35 minutes');
    raise exception 'FAIL: end inside a pause';
  exception when check_violation then
    assert sqlerrm = 'end before pause', 'message end before pause';
  end;
  assert (select ended_at from public.work_sessions where id = s.id) is null, 'still running';

  -- Pause again, then stop while paused: open pause closes at ended_at; log upserted; task completed
  p := public.pause_work_session(s.id);
  update public.work_session_pauses set paused_at = now() - interval '5 minutes' where id = p.id;
  perform public.stop_work_session(s.id, null, 4::smallint, 3::smallint, null, 'done', true);
  assert (select resumed_at from public.work_session_pauses where id = p.id)
       = (select ended_at from public.work_sessions where id = s.id), 'open pause closed at end';
  assert (select status from public.tasks where id = s.task_id) = 'completed', 'completed atomically';
  select count(*) into n from public.work_logs where session_id = s.id;
  assert n = 1, 'exactly one log';
  assert (select focus_score from public.work_logs where session_id = s.id) = 4, 'log focus';

  -- Stopping again rejected
  begin
    perform public.stop_work_session(s.id);
    raise exception 'FAIL: double stop';
  exception when check_violation then null;
  end;

  -- View: 60 min wall − 10 − 5 = 45 focused, 15 paused
  assert (select round(actual_minutes) from public.task_plan_actual where task_id = s.task_id) = 45,
    'actual subtracts pauses';
  assert (select round(paused_minutes) from public.task_plan_actual where task_id = s.task_id) = 15,
    'paused minutes';
  assert (select average_focus from public.task_plan_actual where task_id = s.task_id) = 4,
    'average focus from logs';

  -- Switch: start task 2, switch back to task 1's sibling → exactly one open session, no log for the held one
  s2 := public.start_work_session('30000000-0000-4000-a000-0000000000a2', null);
  -- now() is constant inside a transaction; move the start back so ended_at > started_at holds
  update public.work_sessions set started_at = now() - interval '10 minutes' where id = s2.id;
  perform public.pause_work_session(s2.id);
  perform public.switch_work_session('30000000-0000-4000-a000-0000000000a2', null);
  assert (select ended_at from public.work_sessions where id = s2.id) is not null, 'held session ended';
  assert (select count(*) from public.work_session_pauses where session_id = s2.id and resumed_at is null) = 0,
    'held session pause closed';
  assert (select count(*) from public.work_logs where session_id = s2.id) = 0, 'no log on hold';
  select count(*) into n from public.work_sessions where ended_at is null;
  assert n = 1, 'exactly one open session after switch';
  assert (select status from public.tasks where id = '30000000-0000-4000-a000-0000000000a2') = 'in_progress',
    'held task stays in_progress';

  -- Log for another user's task rejected by composite FK
  begin
    insert into public.work_logs (user_id, task_id, note)
    values ('00000000-0000-4000-a000-00000000000a', '30000000-0000-4000-a000-00000000000b', 'x');
    raise exception 'FAIL: log on B task';
  exception when foreign_key_violation then null;
  end;
  -- Log owned by B rejected by RLS
  begin
    insert into public.work_logs (user_id, task_id, note)
    values ('00000000-0000-4000-a000-00000000000b', '30000000-0000-4000-a000-00000000000b', 'x');
    raise exception 'FAIL: log as B';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- anon sees nothing
set local role anon;
do $$
begin
  begin
    perform 1 from public.work_logs limit 1;
    raise exception 'FAIL: anon read work_logs';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.work_session_pauses limit 1;
    raise exception 'FAIL: anon read pauses';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select 'PASS focus_pauses' as result;
rollback;
