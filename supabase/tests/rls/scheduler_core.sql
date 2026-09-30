-- RLS tests for scheduler core tables (spec §49.3).
begin;

-- Fixture users (the signup trigger creates profiles + scheduler_settings).
insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

-- ── As user A: create one row in every table ─────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

insert into public.task_templates (id, user_id, name)
values ('10000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'A template');

insert into public.tasks (id, user_id, template_id, title)
values ('20000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a',
        '10000000-0000-4000-a000-00000000000a', 'A task');

insert into public.schedule_blocks (id, user_id, task_id, starts_at, ends_at)
values ('30000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a',
        '20000000-0000-4000-a000-00000000000a', '2026-09-29 14:00Z', '2026-09-29 15:00Z');

insert into public.schedule_block_revisions (user_id, schedule_block_id, change_type, actor, new_starts_at, new_ends_at)
values ('00000000-0000-4000-a000-00000000000a', '30000000-0000-4000-a000-00000000000a',
        'created', 'user', '2026-09-29 14:00Z', '2026-09-29 15:00Z');

insert into public.work_sessions (user_id, task_id, schedule_block_id, started_at)
values ('00000000-0000-4000-a000-00000000000a', '20000000-0000-4000-a000-00000000000a',
        '30000000-0000-4000-a000-00000000000a', '2026-09-29 14:05Z');

insert into public.daily_reflections (user_id, reflection_date, focus_score)
values ('00000000-0000-4000-a000-00000000000a', '2026-09-29', 4);

do $$
begin
  assert (select count(*) from public.profiles) = 1, 'A should see exactly own profile';
  assert (select count(*) from public.scheduler_settings) = 1, 'A should see own settings';
  assert (select count(*) from public.task_templates) = 1, 'A reads own template';
  assert (select count(*) from public.tasks) = 1, 'A reads own task';
  assert (select count(*) from public.schedule_blocks) = 1, 'A reads own block';
  assert (select count(*) from public.schedule_block_revisions) = 1, 'A reads own revision';
  assert (select count(*) from public.work_sessions) = 1, 'A reads own session';
  assert (select count(*) from public.daily_reflections) = 1, 'A reads own reflection';
end $$;

-- One active timer per user.
do $$
begin
  insert into public.work_sessions (user_id, task_id, started_at)
  values ('00000000-0000-4000-a000-00000000000a', '20000000-0000-4000-a000-00000000000a', now());
  raise exception 'FAIL: second active timer was allowed';
exception when unique_violation then null;
end $$;

-- Revisions are append-only.
do $$
declare n int;
begin
  update public.schedule_block_revisions set actor = 'ai';
  get diagnostics n = row_count;
  assert n = 0, 'revision update must be blocked';
  delete from public.schedule_block_revisions;
  get diagnostics n = row_count;
  assert n = 0, 'revision delete must be blocked';
end $$;

-- ── As user B: A's rows are invisible and immutable ───────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

do $$
declare n int;
begin
  assert (select count(*) from public.profiles) = 1, 'B sees only own profile';
  assert (select count(*) from public.task_templates) = 0, 'B cannot read A templates';
  assert (select count(*) from public.tasks) = 0, 'B cannot read A tasks';
  assert (select count(*) from public.schedule_blocks) = 0, 'B cannot read A blocks';
  assert (select count(*) from public.schedule_block_revisions) = 0, 'B cannot read A revisions';
  assert (select count(*) from public.work_sessions) = 0, 'B cannot read A sessions';
  assert (select count(*) from public.daily_reflections) = 0, 'B cannot read A reflections';

  update public.tasks set title = 'hacked';
  get diagnostics n = row_count;
  assert n = 0, 'B cannot update A tasks';
  update public.schedule_blocks set starts_at = starts_at + interval '1 hour';
  get diagnostics n = row_count;
  assert n = 0, 'B cannot update A blocks';
  update public.profiles set timezone = 'UTC' where id = '00000000-0000-4000-a000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, 'B cannot update A profile';

  delete from public.tasks;
  get diagnostics n = row_count;
  assert n = 0, 'B cannot delete A tasks';
  delete from public.work_sessions;
  get diagnostics n = row_count;
  assert n = 0, 'B cannot delete A sessions';
end $$;

-- B cannot insert rows owned by A.
do $$
begin
  insert into public.tasks (user_id, title) values ('00000000-0000-4000-a000-00000000000a', 'spoof');
  raise exception 'FAIL: B inserted a task as A';
exception when insufficient_privilege then null;
end $$;

-- B cannot attach own rows to A's parents (composite FK, spec §44).
do $$
begin
  insert into public.schedule_blocks (user_id, task_id, starts_at, ends_at)
  values ('00000000-0000-4000-a000-00000000000b', '20000000-0000-4000-a000-00000000000a',
          now(), now() + interval '1 hour');
  raise exception 'FAIL: B scheduled A task';
exception when foreign_key_violation then null;
end $$;

do $$
begin
  insert into public.tasks (user_id, template_id, title)
  values ('00000000-0000-4000-a000-00000000000b', '10000000-0000-4000-a000-00000000000a', 'x');
  raise exception 'FAIL: B used A template';
exception when foreign_key_violation then null;
end $$;

-- ── Anonymous: no table privileges at all (scheduler_hardening migration) ─
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'scheduler_settings', 'task_templates', 'tasks', 'schedule_blocks',
    'schedule_block_revisions', 'work_sessions', 'daily_reflections', 'work_logs', 'work_session_pauses'
  ] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'FAIL: anon could select from %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

select 'PASS scheduler_core RLS' as result;
rollback;
