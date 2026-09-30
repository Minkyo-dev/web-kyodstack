-- Stat engine: work-standard checks, stat_snapshots RLS (read own; writes only by the service role).
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

-- service role writes one snapshot for A and one for B
insert into public.stat_snapshots (user_id, computed_on, stat_type, scope, value, sample_count, window_start, window_end, formula_version)
values
  ('00000000-0000-4000-a000-00000000000a', '2026-09-30', 'calibration', 'overall', 82, 9, '2026-09-02', '2026-09-30', 'stats-v1'),
  ('00000000-0000-4000-a000-00000000000b', '2026-09-30', 'calibration', 'overall', 70, 9, '2026-09-02', '2026-09-30', 'stats-v1');
do $$ begin
  begin
    insert into public.stat_snapshots (user_id, computed_on, stat_type, scope, sample_count, window_start, window_end, formula_version)
    values ('00000000-0000-4000-a000-00000000000a', '2026-09-30', 'calibration', 'overall', 0, '2026-09-02', '2026-09-30', 'stats-v1');
    raise exception 'FAIL: duplicate snapshot';
  exception when unique_violation then null; end;
  begin
    insert into public.stat_snapshots (user_id, computed_on, stat_type, scope, sample_count, window_start, window_end, formula_version)
    values ('00000000-0000-4000-a000-00000000000a', '2026-09-30', 'focus', 'overall', 0, '2026-09-02', '2026-09-30', 'stats-v1');
    raise exception 'FAIL: unknown stat type';
  exception when check_violation then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare n int; begin
  assert (select count(*) from public.stat_snapshots) = 1, 'A reads only own snapshot';
  begin
    insert into public.stat_snapshots (user_id, computed_on, stat_type, scope, sample_count, window_start, window_end, formula_version)
    values ('00000000-0000-4000-a000-00000000000a', '2026-10-01', 'calibration', 'overall', 0, '2026-09-03', '2026-10-01', 'stats-v1');
    raise exception 'FAIL: user inserted snapshot';
  exception when insufficient_privilege then null; end;
  begin update public.stat_snapshots set value = 1; raise exception 'FAIL: user updated snapshot';
  exception when insufficient_privilege then null; end;
  -- work standards: defaults and checks
  assert (select planned_work_days from public.scheduler_settings) = '{1,2,3,4,5}', 'default work days';
  assert (select min_meaningful_minutes from public.scheduler_settings) = 30, 'default min';
  assert (select commit_lead_minutes from public.scheduler_settings) = 120, 'default lead';
  begin update public.scheduler_settings set planned_work_days = '{}'; raise exception 'FAIL: empty days';
  exception when check_violation then null; end;
  begin update public.scheduler_settings set planned_work_days = '{1,7}'; raise exception 'FAIL: day 7';
  exception when check_violation then null; end;
  begin update public.scheduler_settings set min_meaningful_minutes = 2; raise exception 'FAIL: min 2';
  exception when check_violation then null; end;
  begin update public.scheduler_settings set commit_lead_minutes = 2000; raise exception 'FAIL: lead 2000';
  exception when check_violation then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.stat_snapshots; raise exception 'FAIL: anon read';
  exception when insufficient_privilege then null; end;
end $$;
select 'PASS stat_engine' as result;
rollback;
