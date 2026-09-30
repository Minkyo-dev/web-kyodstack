-- Calendar planning: missed marking, unschedule, missed transitions, RLS.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

insert into public.tasks (id, user_id, title, status)
values
  ('60000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'missed one', 'planned'),
  ('60000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a', 'linked', 'planned'),
  ('60000000-0000-4000-a000-0000000000a3', '00000000-0000-4000-a000-00000000000a', 'matched', 'planned'),
  ('60000000-0000-4000-a000-0000000000a4', '00000000-0000-4000-a000-00000000000a', 'future', 'planned'),
  ('60000000-0000-4000-a000-0000000000a5', '00000000-0000-4000-a000-00000000000a', 'two blocks', 'planned');

insert into public.schedule_blocks (id, user_id, task_id, starts_at, ends_at)
values
  ('70000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-00000000000a', now() - interval '3 hours', now() - interval '2 hours'),
  ('70000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-0000000000a2', now() - interval '3 hours', now() - interval '2 hours'),
  ('70000000-0000-4000-a000-0000000000a3', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-0000000000a3', now() - interval '3 hours', now() - interval '2 hours'),
  ('70000000-0000-4000-a000-0000000000a4', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-0000000000a4', now() + interval '1 hour', now() + interval '2 hours'),
  ('70000000-0000-4000-a000-0000000000a5', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-0000000000a5', now() + interval '1 hour', now() + interval '2 hours'),
  ('70000000-0000-4000-a000-0000000000a6', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-0000000000a5', now() + interval '3 hours', now() + interval '4 hours');

-- linked session (started from the block) and a matching session (same task, inside the window)
insert into public.work_sessions (user_id, task_id, schedule_block_id, started_at, ended_at, source)
values
  ('00000000-0000-4000-a000-00000000000a', '60000000-0000-4000-a000-0000000000a2',
   '70000000-0000-4000-a000-0000000000a2', now() - interval '170 minutes', now() - interval '150 minutes', 'manual'),
  ('00000000-0000-4000-a000-00000000000a', '60000000-0000-4000-a000-0000000000a3',
   null, now() - interval '200 minutes', now() - interval '190 minutes', 'manual');

do $$
declare n int;
begin
  -- A cannot mark B
  begin
    perform public.mark_missed_blocks('00000000-0000-4000-a000-00000000000b');
    raise exception 'FAIL: marked another user';
  exception when insufficient_privilege then null;
  end;

  n := public.mark_missed_blocks('00000000-0000-4000-a000-00000000000a');
  assert n = 1, format('exactly one missed, got %s', n);
  assert (select status from public.schedule_blocks where id = '70000000-0000-4000-a000-00000000000a') = 'missed',
    'past block without session is missed';
  assert (select status from public.schedule_blocks where id = '70000000-0000-4000-a000-0000000000a2') = 'planned',
    'linked session keeps planned';
  assert (select status from public.schedule_blocks where id = '70000000-0000-4000-a000-0000000000a3') = 'planned',
    'matching session (start − 30 min window) keeps planned';
  assert (select status from public.schedule_blocks where id = '70000000-0000-4000-a000-0000000000a4') = 'planned',
    'future block untouched';
  assert public.mark_missed_blocks('00000000-0000-4000-a000-00000000000a') = 0, 'idempotent';

  -- missed transitions: planned/completed rejected, cancelled allowed
  begin
    perform public.set_schedule_block_status('70000000-0000-4000-a000-00000000000a', 'planned');
    raise exception 'FAIL: missed → planned';
  exception when check_violation then null;
  end;
  begin
    perform public.set_schedule_block_status('70000000-0000-4000-a000-00000000000a', 'completed');
    raise exception 'FAIL: missed → completed';
  exception when check_violation then null;
  end;
  begin
    perform public.move_schedule_block('70000000-0000-4000-a000-00000000000a', now(), now() + interval '1 hour');
    raise exception 'FAIL: moved a missed block';
  exception when check_violation then null;
  end;

  -- unschedule the missed block: task has no other planned block → inbox
  perform public.unschedule_block('70000000-0000-4000-a000-00000000000a');
  assert (select status from public.schedule_blocks where id = '70000000-0000-4000-a000-00000000000a') = 'cancelled',
    'missed → cancelled';
  assert (select status from public.tasks where id = '60000000-0000-4000-a000-00000000000a') = 'inbox',
    'task back to inbox';
  assert (select count(*) from public.schedule_block_revisions
           where schedule_block_id = '70000000-0000-4000-a000-00000000000a' and change_type = 'cancelled') = 1,
    'cancel revision written';

  -- unschedule one of two planned blocks: task stays planned
  perform public.unschedule_block('70000000-0000-4000-a000-0000000000a5');
  assert (select status from public.tasks where id = '60000000-0000-4000-a000-0000000000a5') = 'planned',
    'other planned block keeps the task planned';

  -- cannot unschedule a cancelled block
  begin
    perform public.unschedule_block('70000000-0000-4000-a000-0000000000a5');
    raise exception 'FAIL: unscheduled twice';
  exception when check_violation then null;
  end;

  -- setting column default
  assert (select show_actual_default from public.scheduler_settings) = false, 'setting defaults to false';
end;
$$;

-- B cannot unschedule A's block
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.unschedule_block('70000000-0000-4000-a000-0000000000a4');
    raise exception 'FAIL: B unscheduled A block';
  exception when no_data_found then null;
  end;
  assert public.mark_missed_blocks('00000000-0000-4000-a000-00000000000b') = 0, 'B marks nothing of A';
end;
$$;

-- service role (auth.uid() null) may mark any user
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  assert public.mark_missed_blocks('00000000-0000-4000-a000-00000000000a') = 0, 'service role call works';
end;
$$;

select 'PASS calendar_planning' as result;
rollback;
