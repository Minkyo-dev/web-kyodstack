-- Gamification E1: RLS, column privileges, award_xp idempotence, cache trigger, level curve.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

do $$ begin
  assert public.xp_level(0) = 1 and public.xp_level(149) = 1 and public.xp_level(150) = 2, 'level 1→2 at 150';
  assert public.xp_level(349) = 2 and public.xp_level(350) = 3, 'level 2→3 at 350';
end $$;

-- service role awards for B
select * from public.award_xp('[{"rule":"focus","source_type":"work_session","source_id":"00000000-0000-4000-b000-000000000001","local_date":"2026-09-29","xp":30}]', '00000000-0000-4000-a000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare r record; begin
  -- profile insert limited to settings columns
  insert into public.player_profiles (user_id, gamification_enabled) values ('00000000-0000-4000-a000-00000000000a', true);
  begin
    update public.player_profiles set total_xp = 9999;
    raise exception 'FAIL: user wrote cache';
  exception when insufficient_privilege then null; end;
  update public.player_profiles set animations_enabled = false, backfilled_at = now();

  select * into r from public.award_xp('[
    {"rule":"focus","source_type":"work_session","source_id":"00000000-0000-4000-c000-000000000001","local_date":"2026-09-29","xp":100},
    {"rule":"completion","source_type":"task","source_id":"00000000-0000-4000-c000-000000000002","local_date":"2026-09-29","xp":20},
    {"rule":"commitment","source_type":"schedule_block","source_id":"00000000-0000-4000-c000-000000000003","local_date":"2026-09-30","xp":10,"metadata":{"score":1}}
  ]');
  assert r.total_xp = 130 and r.level = 1 and r.previous_level = 1, 'first award';
  -- same sources again: idempotent; a new one crosses level 2
  select * into r from public.award_xp('[
    {"rule":"focus","source_type":"work_session","source_id":"00000000-0000-4000-c000-000000000001","local_date":"2026-09-29","xp":100},
    {"rule":"focus","source_type":"work_session","source_id":"00000000-0000-4000-c000-000000000004","local_date":"2026-09-30","xp":25}
  ]');
  assert r.total_xp = 155 and r.level = 2 and r.previous_level = 1, 'idempotent + level up';
  -- p_user_id is ignored for an authenticated caller
  perform public.award_xp('[{"rule":"focus","source_type":"work_session","source_id":"00000000-0000-4000-c000-000000000005","local_date":"2026-09-30","xp":1}]', '00000000-0000-4000-a000-00000000000b');
  assert (select count(*) from public.xp_events) = 5, 'A sees only own events (c5 went to A, not B)';
  assert (select total_xp from public.player_profiles) = 156, 'cache follows ledger';
  begin
    perform public.award_xp('[{"rule":"hack","source_type":"x","source_id":"00000000-0000-4000-c000-000000000009","local_date":"2026-09-30","xp":5}]');
    raise exception 'FAIL: unknown rule';
  exception when check_violation then null; end;
  begin
    perform public.award_xp('[{"rule":"focus","source_type":"x","source_id":"00000000-0000-4000-c000-000000000009","local_date":"2026-09-30","xp":500}]');
    raise exception 'FAIL: xp over 120';
  exception when check_violation then null; end;
  begin
    update public.xp_events set xp = 120;
    raise exception 'FAIL: user updated xp';
  exception when insufficient_privilege then null; end;
  -- own delete (E2E cleanup) recomputes the cache
  delete from public.xp_events where source_id = '00000000-0000-4000-c000-000000000005';
  assert (select total_xp from public.player_profiles) = 155, 'delete recomputes cache';
end $$;

reset role;
do $$ begin
  assert (select total_xp from public.player_profiles where user_id = '00000000-0000-4000-a000-00000000000b') = 30, 'B untouched by A';
  assert (select count(*) from public.xp_events where user_id = '00000000-0000-4000-a000-00000000000b') = 1, 'B has 1 event';
end $$;
rollback;
