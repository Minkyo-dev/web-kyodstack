-- G2: habits / habit_checks RLS, FKs, rule checks, one check per day, xp rule 'habit'.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.missions (id, user_id, title) values
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-00000000000b', 'B mission');
insert into public.habits (id, user_id, title, rule, weekdays) values
  ('00000000-0000-4000-b000-0000000000b3', '00000000-0000-4000-a000-00000000000b', 'B habit', 'check', '{1}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare
  a constant uuid := '00000000-0000-4000-a000-00000000000a';
  m uuid; m2 uuid; p public.paths; pr uuid; h uuid; hf uuid; c uuid; n int;
begin
  assert (select count(*) from public.habits) = 0, 'A cannot see B habit';
  update public.habits set title = 'x';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot update B habit';

  insert into public.missions (user_id, title) values (a, 'Speak') returning id into m;
  insert into public.missions (user_id, title) values (a, 'Other') returning id into m2;
  p := public.switch_path(m, 'Input', 'Listen');
  insert into public.protocols (user_id, path_id, mission_id, title) values (a, p.id, m, 'Shadowing') returning id into pr;

  insert into public.habits (user_id, title, rule, weekdays) values (a, 'Workout', 'check', '{1,3,5}') returning id into h;
  insert into public.habits (user_id, title, rule, target_minutes, weekdays, protocol_id, mission_id)
  values (a, 'Listen 20', 'focus', 20, '{1,2,3,4,5}', pr, m) returning id into hf;

  begin
    insert into public.habits (user_id, title, rule, target_minutes, weekdays) values (a, 'x', 'focus', 20, '{1}');
    raise exception 'FAIL: focus without protocol';
  exception when check_violation then null; end;
  begin
    insert into public.habits (user_id, title, rule, weekdays, protocol_id, mission_id) values (a, 'x', 'check', '{1}', pr, m2);
    raise exception 'FAIL: protocol of another mission';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.habits (user_id, title, rule, weekdays, mission_id) values (a, 'x', 'check', '{1}', m);
    raise exception 'FAIL: mission without protocol';
  exception when check_violation then null; end;
  begin
    insert into public.habits (user_id, title, rule, weekdays) values (a, 'x', 'check', '{}');
    raise exception 'FAIL: empty weekdays';
  exception when check_violation then null; end;
  begin
    insert into public.habits (user_id, title, rule, weekdays) values (a, 'x', 'check', '{8}');
    raise exception 'FAIL: weekday 8';
  exception when check_violation then null; end;
  begin
    insert into public.habits (user_id, title, rule, weekdays, protocol_id, mission_id)
    values (a, 'x', 'check', '{1}', null, '00000000-0000-4000-b000-0000000000b1');
    raise exception 'FAIL: B mission';
  exception when check_violation or foreign_key_violation then null; end;

  insert into public.habit_checks (user_id, habit_id, local_date, source) values (a, h, '2026-09-30', 'manual') returning id into c;
  begin
    insert into public.habit_checks (user_id, habit_id, local_date, source) values (a, h, '2026-09-30', 'manual');
    raise exception 'FAIL: two checks a day';
  exception when unique_violation then null; end;
  begin
    insert into public.habit_checks (user_id, habit_id, local_date, source)
    values (a, '00000000-0000-4000-b000-0000000000b3', '2026-09-30', 'manual');
    raise exception 'FAIL: checked B habit';
  exception when foreign_key_violation then null; end;

  perform public.award_xp(jsonb_build_array(jsonb_build_object(
    'rule', 'habit', 'source_type', 'habit_check', 'source_id', c, 'local_date', '2026-09-30', 'xp', 10, 'metadata', '{}'::jsonb)));
  assert (select xp from public.xp_events where source_id = c) = 10, 'habit xp accepted';

  delete from public.habits where id = h;
  assert (select count(*) from public.habit_checks where habit_id = h) = 0, 'checks cascade';
end $$;
rollback;
