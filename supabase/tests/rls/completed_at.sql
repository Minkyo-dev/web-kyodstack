-- ADR 0037 §8: completed_at is stamped on the first move into 'completed', kept while there, cleared on leaving.
-- B cannot complete A's project.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.projects (id, user_id, name) values
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-a000-00000000000a', 'A project');
insert into public.milestones (id, user_id, project_id, name) values
  ('00000000-0000-4000-c000-0000000000b1', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-c000-0000000000a1', 'A milestone');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.projects set status = 'completed';
  get diagnostics n = row_count;
  assert n = 0, 'B cannot complete A project';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare first timestamptz; begin
  assert (select completed_at from public.milestones where id = '00000000-0000-4000-c000-0000000000b1') is null, 'starts null';
  update public.milestones set status = 'completed', completed_at = '2000-01-01' where id = '00000000-0000-4000-c000-0000000000b1';
  first := (select completed_at from public.milestones where id = '00000000-0000-4000-c000-0000000000b1');
  assert first is not null and first > '2001-01-01', 'stamped by the trigger, not the client';
  update public.milestones set name = 'renamed', completed_at = null where id = '00000000-0000-4000-c000-0000000000b1';
  assert (select completed_at from public.milestones where id = '00000000-0000-4000-c000-0000000000b1') = first, 'kept while completed';
  update public.milestones set status = 'in_progress' where id = '00000000-0000-4000-c000-0000000000b1';
  assert (select completed_at from public.milestones where id = '00000000-0000-4000-c000-0000000000b1') is null, 'cleared on reopen';
  update public.projects set status = 'completed' where id = '00000000-0000-4000-c000-0000000000a1';
  assert (select completed_at from public.projects where id = '00000000-0000-4000-c000-0000000000a1') is not null, 'project stamped';
end $$;
select 'PASS completed_at';
rollback;
