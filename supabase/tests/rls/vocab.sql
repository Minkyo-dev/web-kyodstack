-- ADR 0046 V0: notion_connections is own-row only; an active row needs a token; anon has no access.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.notion_connections (user_id, access_token_enc, workspace_id)
values ('00000000-0000-4000-a000-00000000000b', 'v1:x:y:z', 'ws-b');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare n int;
begin
  assert (select count(*) from public.notion_connections) = 0, 'A cannot read B connection';
  update public.notion_connections set status = 'disconnected';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot update B connection';
  delete from public.notion_connections;
  get diagnostics n = row_count;
  assert n = 0, 'A cannot delete B connection';
  begin
    insert into public.notion_connections (user_id, access_token_enc) values ('00000000-0000-4000-a000-00000000000b', 'v1:a:b:c');
    assert false, 'A cannot insert for B';
  exception when insufficient_privilege then null; end;

  insert into public.notion_connections (user_id, access_token_enc, workspace_id) values ('00000000-0000-4000-a000-00000000000a', 'v1:a:b:c', 'ws-a');
  begin
    update public.notion_connections set access_token_enc = null;
    assert false, 'an active connection needs a token';
  exception when check_violation then null; end;
  begin
    update public.notion_connections set status = 'bogus';
    assert false, 'status check';
  exception when check_violation then null; end;
  begin
    update public.notion_connections set property_ids = '[]'::jsonb;
    assert false, 'property_ids is an object';
  exception when check_violation then null; end;
  update public.notion_connections set status = 'disconnected', access_token_enc = null, refresh_token_enc = null;
  get diagnostics n = row_count;
  assert n = 1, 'A disconnects own row';
  assert (select updated_at >= created_at from public.notion_connections), 'updated_at trigger';
end $$;

select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', true);
set local role anon;
do $$ begin
  begin perform count(*) from public.notion_connections; assert false, 'anon has no access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS vocab';
rollback;
