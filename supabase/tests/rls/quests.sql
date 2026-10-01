-- Gamification E2: quests RLS, atomic create/swap, one active recovery, per-rule XP limit, equipped title check.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

-- service role creates a quest for B
select public.create_quest(
  '{"type":"daily","title":"모멘텀 쌓기","period_start":"2026-09-30","period_end":"2026-09-30","reward_xp":50,"rules_version":"quest-v1","spare":[]}',
  '[{"position":1,"metric":"focus_minutes","params":{},"target_value":60}]',
  '00000000-0000-4000-a000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare q uuid; q2 uuid; o uuid; begin
  q := public.create_quest(
    '{"type":"daily","title":"모멘텀 쌓기","period_start":"2026-09-30","period_end":"2026-09-30","reward_xp":50,"rules_version":"quest-v1","spare":[{"metric":"early_session","params":{"before":"12:00"},"target_value":1}]}',
    '[{"position":1,"metric":"focus_minutes","params":{},"target_value":60},{"position":2,"metric":"complete_tasks","params":{},"target_value":1}]');
  assert q is not null, 'created';
  q2 := public.create_quest(
    '{"type":"daily","title":"x","period_start":"2026-09-30","period_end":"2026-09-30","reward_xp":50,"rules_version":"quest-v1","spare":[]}',
    '[{"position":1,"metric":"focus_minutes","params":{},"target_value":30}]');
  assert q2 is null, 'second daily for the same day is a no-op';
  assert (select count(*) from public.quests) = 1, 'A sees only own quest';
  assert (select count(*) from public.quest_objectives where quest_id = q) = 2, 'objectives created with the quest';

  select id into o from public.quest_objectives where quest_id = q and position = 2;
  perform public.swap_quest_objective(o, '{"metric":"early_session","params":{"before":"12:00"},"target_value":1}', '[]');
  assert (select metric from public.quest_objectives where id = o) = 'early_session', 'swapped';
  assert (select swap_used from public.quests where id = q), 'swap used';
  begin
    perform public.swap_quest_objective(o, '{"metric":"kept_commitments","params":{},"target_value":1}', '[]');
    raise exception 'FAIL: second swap';
  exception when check_violation then null; end;

  -- one active recovery quest
  perform public.create_quest('{"type":"recovery","title":"다시 시작","period_start":"2026-09-28","period_end":"2026-09-29","reward_xp":40,"rules_version":"quest-v1","spare":[]}',
    '[{"position":1,"metric":"started_session","params":{},"target_value":1}]');
  begin
    perform public.create_quest('{"type":"recovery","title":"다시 시작","period_start":"2026-09-30","period_end":"2026-10-01","reward_xp":40,"rules_version":"quest-v1","spare":[]}',
      '[{"position":1,"metric":"started_session","params":{},"target_value":1}]');
    raise exception 'FAIL: two active recovery quests';
  exception when unique_violation then null; end;

  -- quest XP up to 300, others up to 120
  perform public.award_xp(format('[{"rule":"quest","source_type":"quest","source_id":"%s","local_date":"2026-09-30","xp":300}]', q)::jsonb);
  begin
    perform public.award_xp('[{"rule":"focus","source_type":"work_session","source_id":"00000000-0000-4000-c000-000000000001","local_date":"2026-09-30","xp":121}]');
    raise exception 'FAIL: focus over 120';
  exception when check_violation then null; end;

  -- achievements/titles: insert own, no update; equip only unlocked
  -- the award above already created A's profile through the cache trigger
  update public.player_profiles set gamification_enabled = true;
  begin
    update public.player_profiles set equipped_title = 'builder';
    raise exception 'FAIL: equipped a locked title';
  exception when check_violation then null; end;
  insert into public.user_achievements (user_id, key) values ('00000000-0000-4000-a000-00000000000a', 'first_step');
  insert into public.user_titles (user_id, key) values ('00000000-0000-4000-a000-00000000000a', 'builder');
  update public.player_profiles set equipped_title = 'builder';
  update public.player_profiles set equipped_title = null;
  begin
    update public.user_titles set key = 'system_thinker';
    raise exception 'FAIL: user updated a title';
  exception when insufficient_privilege then null; end;
  -- own delete (E2E cleanup) cascades objectives
  delete from public.quests where id = q;
  assert (select count(*) from public.quest_objectives where quest_id = q) = 0, 'objectives cascade';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.quests where user_id = '00000000-0000-4000-a000-00000000000b') = 1, 'B untouched';
end $$;
rollback;
