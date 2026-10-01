-- Project archive: archived_at is the user's own, settable and clearable; B cannot archive A's project.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.projects (id, user_id, name) values
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-a000-00000000000a', 'A project');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.projects set archived_at = now();
  get diagnostics n = row_count;
  assert n = 0, 'B cannot archive A project';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ begin
  assert (select archived_at from public.projects where id = '00000000-0000-4000-c000-0000000000a1') is null, 'starts unarchived';
  update public.projects set archived_at = now() where id = '00000000-0000-4000-c000-0000000000a1';
  assert (select archived_at from public.projects where id = '00000000-0000-4000-c000-0000000000a1') is not null, 'archived';
  update public.projects set archived_at = null where id = '00000000-0000-4000-c000-0000000000a1';
  assert (select archived_at from public.projects where id = '00000000-0000-4000-c000-0000000000a1') is null, 'restored';
end $$;
rollback;
