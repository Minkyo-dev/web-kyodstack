-- G1 follow-up: set_purpose and save_mission are atomic and scoped to the caller.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.identities (id, user_id, name) values
  ('00000000-0000-4000-b000-0000000000b2', '00000000-0000-4000-a000-00000000000b', 'B identity');
insert into public.missions (id, user_id, title) values
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-00000000000b', 'B mission');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare
  a constant uuid := '00000000-0000-4000-a000-00000000000a';
  p1 public.purposes; p2 public.purposes; m public.missions; i1 uuid; i2 uuid; closed timestamptz;
begin
  -- set_purpose: archives the old one, exactly one active; a failing insert keeps the old one active.
  p1 := public.set_purpose('  Live free  ');
  assert p1.statement = 'Live free' and p1.user_id = a, 'trimmed, own';
  p2 := public.set_purpose('Build things');
  assert (select status from public.purposes where id = p1.id) = 'archived', 'old archived';
  assert (select count(*) from public.purposes where status = 'active') = 1, 'one active';
  begin
    perform public.set_purpose('   ');
    raise exception 'FAIL: blank purpose';
  exception when check_violation then null; end;
  assert (select status from public.purposes where id = p2.id) = 'active', 'failed set keeps the old purpose active';

  -- save_mission create: purpose + identities in one call.
  insert into public.identities (user_id, name) values (a, 'One') returning id into i1;
  insert into public.identities (user_id, name) values (a, 'Two') returning id into i2;
  m := public.save_mission(null, 'Ship', null, null, 'active', array[i1, i1, i2]);
  assert m.purpose_id = p2.id and m.user_id = a, 'linked to the active purpose';
  assert (select count(*) from public.mission_identities where mission_id = m.id) = 2, 'deduped links';

  -- a foreign identity rolls back the whole save: title and links unchanged.
  begin
    perform public.save_mission(m.id, 'Renamed', null, null, 'active', array[i1, '00000000-0000-4000-b000-0000000000b2'::uuid]);
    raise exception 'FAIL: linked B identity';
  exception when foreign_key_violation then null; end;
  assert (select title from public.missions where id = m.id) = 'Ship', 'title rolled back';
  assert (select count(*) from public.mission_identities where mission_id = m.id) = 2, 'links rolled back';

  -- update: close sets closed_at once; reopening clears it.
  m := public.save_mission(m.id, 'Ship', 'MVP', '2026-12-01', 'achieved', array[i2]);
  assert m.closed_at is not null and m.deadline = '2026-12-01', 'closed';
  closed := m.closed_at;
  m := public.save_mission(m.id, 'Ship it', 'MVP', '2026-12-01', 'achieved', array[i2]);
  assert m.closed_at = closed, 'closed_at kept while status unchanged';
  m := public.save_mission(m.id, 'Ship it', 'MVP', null, 'active', '{}');
  assert m.closed_at is null and (select count(*) from public.mission_identities where mission_id = m.id) = 0, 'reopened, links cleared';

  -- another user's mission is not found.
  begin
    perform public.save_mission('00000000-0000-4000-b000-0000000000b1', 'x', null, null, 'active', '{}');
    raise exception 'FAIL: saved B mission';
  exception when no_data_found then null; end;
end $$;
rollback;
