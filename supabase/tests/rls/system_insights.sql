-- F2: system_insights RLS, quests.generated_by 'ai' + reason, insight settings checks.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.system_insights (user_id, kind, period_start, period_end, input, content, model, prompt_version)
values ('00000000-0000-4000-a000-00000000000b', 'weekly_analysis', '2026-09-21', '2026-09-27', '{}', '{}', 'fake-1', 'analysis-v1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ begin
  insert into public.system_insights (user_id, kind, period_start, period_end, input, content, model, prompt_version)
  values ('00000000-0000-4000-a000-00000000000a', 'weekly_analysis', '2026-09-28', '2026-10-04', '{}', '{"explanations":[]}', 'fake-1', 'analysis-v1');
  assert (select count(*) from public.system_insights) = 1, 'A sees only own insight';
  begin
    insert into public.system_insights (user_id, kind, period_start, period_end, input, content)
    values ('00000000-0000-4000-a000-00000000000a', 'gossip', '2026-09-28', '2026-10-04', '{}', '{}');
    raise exception 'FAIL: unknown kind';
  exception when check_violation then null; end;
  begin
    update public.system_insights set content = '{}';
    raise exception 'FAIL: user updated an insight';
  exception when insufficient_privilege then null; end;
  -- insight settings
  assert (select count(*) from public.scheduler_settings) = 1, 'A has a settings row';
  update public.scheduler_settings set insight_weekday = 3, insight_hour = 21;
  update public.scheduler_settings set insight_weekday = null;
  begin
    update public.scheduler_settings set insight_hour = 24;
    raise exception 'FAIL: hour 24';
  exception when check_violation then null; end;
  -- AI quests
  perform public.create_quest('{"type":"daily","title":"집중의 날","period_start":"2026-09-30","period_end":"2026-09-30","reward_xp":50,"rules_version":"quest-v1","spare":[]}',
    '[{"position":1,"metric":"focus_minutes","params":{},"target_value":60}]');
  update public.quests set generated_by = 'ai', reason = '오후 집중이 잘 지켜져요';
  assert (select generated_by from public.quests) = 'ai', 'ai quest';
end $$;
rollback;
