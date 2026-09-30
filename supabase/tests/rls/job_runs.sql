-- job_runs: users can read their own rows but never write; the unique key blocks duplicates.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

-- As a trusted job (table owner here), record one run for A.
insert into public.job_runs (job_name, user_id, run_key, status)
values ('daily_planner', '00000000-0000-4000-a000-00000000000a', '2026-09-30', 'succeeded');

do $$
begin
  insert into public.job_runs (job_name, user_id, run_key, status)
  values ('daily_planner', '00000000-0000-4000-a000-00000000000a', '2026-09-30', 'running');
  raise exception 'FAIL: duplicate run accepted';
exception when unique_violation then null;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.job_runs) = 1, 'A reads own run';
  begin
    insert into public.job_runs (job_name, user_id, run_key, status)
    values ('weekly_review', '00000000-0000-4000-a000-00000000000a', 'x', 'running');
    raise exception 'FAIL: user wrote a job run';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.job_runs set status = 'failed';
    raise exception 'FAIL: user updated a job run';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.job_runs) = 0, 'B cannot read A runs';
end $$;

select 'PASS job_runs' as result;
rollback;
