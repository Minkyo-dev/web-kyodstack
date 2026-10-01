-- G1: direction layer RLS, cross-user FKs, one active purpose/path, switch_path, retired guards, view.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.missions (id, user_id, title) values
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-00000000000b', 'B mission');
insert into public.identities (id, user_id, name) values
  ('00000000-0000-4000-b000-0000000000b2', '00000000-0000-4000-a000-00000000000b', 'B identity');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare
  a constant uuid := '00000000-0000-4000-a000-00000000000a';
  m uuid; m2 uuid; ident uuid; pr uuid; t uuid; t2 uuid; prj uuid;
  p1 public.paths; p2 public.paths;
begin
  assert (select count(*) from public.missions) = 0, 'A cannot see B mission';
  assert (select count(*) from public.identities) = 0, 'A cannot see B identity';

  -- purposes: one active
  insert into public.purposes (user_id, statement) values (a, 'Live free');
  begin
    insert into public.purposes (user_id, statement) values (a, 'Second');
    raise exception 'FAIL: two active purposes';
  exception when unique_violation then null; end;

  -- RLS on insert
  begin
    insert into public.missions (user_id, title) values ('00000000-0000-4000-a000-00000000000b', 'spoof');
    raise exception 'FAIL: inserted for B';
  exception when insufficient_privilege then null; end;

  insert into public.missions (user_id, title) values (a, 'Speak English') returning id into m;
  insert into public.missions (user_id, title) values (a, 'Ship MVP') returning id into m2;
  insert into public.identities (user_id, name) values (a, 'English Speaker') returning id into ident;
  insert into public.mission_identities (user_id, mission_id, identity_id) values (a, m, ident);

  -- cross-user FKs
  begin
    insert into public.mission_identities (user_id, mission_id, identity_id)
    values (a, m, '00000000-0000-4000-b000-0000000000b2');
    raise exception 'FAIL: linked B identity';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.tasks (user_id, title, mission_id) values (a, 'x', '00000000-0000-4000-b000-0000000000b1');
    raise exception 'FAIL: task on B mission';
  exception when foreign_key_violation then null; end;

  -- closed_at check
  begin
    update public.missions set status = 'achieved' where id = m2;
    raise exception 'FAIL: achieved without closed_at';
  exception when check_violation then null; end;

  -- criteria kind check
  begin
    insert into public.mission_criteria (user_id, mission_id, label, kind) values (a, m, 'n', 'numeric');
    raise exception 'FAIL: numeric without target';
  exception when check_violation then null; end;

  -- first path through switch_path, one active path only
  p1 := public.switch_path(m, 'Input first', 'Listen a lot');
  assert p1.status = 'active', 'first path active';
  begin
    insert into public.paths (user_id, mission_id, title, approach) values (a, m, 'dup', 'dup');
    raise exception 'FAIL: two active paths';
  exception when unique_violation then null; end;
  insert into public.protocols (user_id, path_id, mission_id, title, intended_minutes)
  values (a, p1.id, m, 'Shadowing', 20) returning id into pr;

  -- task links: protocol implies the same mission; protocol needs a mission
  begin
    insert into public.tasks (user_id, title, mission_id, protocol_id) values (a, 'x', m2, pr);
    raise exception 'FAIL: protocol of another mission';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.tasks (user_id, title, protocol_id) values (a, 'x', pr);
    raise exception 'FAIL: protocol without mission';
  exception when check_violation then null; end;
  insert into public.tasks (user_id, title, mission_id, protocol_id) values (a, 'linked', m, pr) returning id into t;

  -- project-derived effective mission
  insert into public.projects (user_id, name, mission_id) values (a, 'MVP', m2) returning id into prj;
  insert into public.tasks (user_id, title, project_id) values (a, 'via project', prj) returning id into t2;
  assert (select effective_mission_id from public.task_plan_actual where task_id = t2) = m2, 'effective from project';
  assert (select effective_mission_id from public.task_plan_actual where task_id = t) = m, 'effective from task';

  -- switch: old retired, its protocols archived, one active
  p2 := public.switch_path(m, 'Output first', 'Speak daily', 'Grammar drills');
  assert (select status from public.paths where id = p1.id) = 'retired', 'old path retired';
  assert (select retired_at from public.paths where id = p1.id) is not null, 'retired_at set';
  assert (select status from public.protocols where id = pr) = 'archived', 'old protocol archived';
  assert (select count(*) from public.paths where mission_id = m and status = 'active') = 1, 'one active path';
  assert (select protocol_id from public.tasks where id = t) = pr, 'task keeps its protocol';

  -- retired guards
  begin
    update public.paths set title = 'edit' where id = p1.id;
    raise exception 'FAIL: edited retired path';
  exception when check_violation then null; end;
  begin
    insert into public.protocols (user_id, path_id, mission_id, title) values (a, p1.id, m, 'late');
    raise exception 'FAIL: protocol on retired path';
  exception when check_violation then null; end;
  begin
    update public.protocols set title = 'edit' where id = pr;
    raise exception 'FAIL: edited protocol of retired path';
  exception when check_violation then null; end;

  -- switch_path on B's mission / a closed mission
  begin
    perform public.switch_path('00000000-0000-4000-b000-0000000000b1', 't', 'a');
    raise exception 'FAIL: switched B path';
  exception when no_data_found then null; end;
  update public.missions set status = 'dropped', closed_at = now() where id = m2;
  begin
    perform public.switch_path(m2, 't', 'a');
    raise exception 'FAIL: switched closed mission';
  exception when no_data_found then null; end;
end $$;
rollback;
