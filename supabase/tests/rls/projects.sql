-- Projects/milestones: RLS isolation and §44 relationship rules enforced by the DB.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

insert into public.projects (id, user_id, name) values
  ('40000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'MLB Dashboard'),
  ('40000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a', 'Other project');
insert into public.milestones (id, user_id, project_id, name) values
  ('50000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a',
   '40000000-0000-4000-a000-00000000000a', 'M1 Data Ingestion');
insert into public.tasks (id, user_id, title, project_id, milestone_id) values
  ('20000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Ingest games',
   '40000000-0000-4000-a000-00000000000a', '50000000-0000-4000-a000-00000000000a');

do $$
begin
  -- milestone of project 1 cannot be attached with project 2 (§44)
  begin
    update public.tasks set project_id = '40000000-0000-4000-a000-0000000000a2'
     where id = '20000000-0000-4000-a000-00000000000a';
    raise exception 'FAIL: milestone/project mismatch accepted';
  exception when foreign_key_violation then null;
  end;
  -- milestone without project
  begin
    update public.tasks set project_id = null where id = '20000000-0000-4000-a000-00000000000a';
    raise exception 'FAIL: milestone without project accepted';
  exception when check_violation then null;
  end;
  -- project with linked tasks cannot be hard-deleted
  begin
    delete from public.projects where id = '40000000-0000-4000-a000-00000000000a';
    raise exception 'FAIL: deleted a project with tasks';
  exception when foreign_key_violation then null;
  end;
  assert (select project_id from public.task_plan_actual) = '40000000-0000-4000-a000-00000000000a',
    'view exposes project_id';
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

do $$
declare n int;
begin
  assert (select count(*) from public.projects) = 0, 'B cannot read A projects';
  assert (select count(*) from public.milestones) = 0, 'B cannot read A milestones';
  update public.projects set name = 'x';
  get diagnostics n = row_count;
  assert n = 0, 'B cannot update A projects';

  insert into public.projects (id, user_id, name)
  values ('40000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'B project');

  begin
    insert into public.tasks (user_id, title, project_id)
    values ('00000000-0000-4000-a000-00000000000b', 'x', '40000000-0000-4000-a000-00000000000a');
    raise exception 'FAIL: B linked A project';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.milestones (user_id, project_id, name)
    values ('00000000-0000-4000-a000-00000000000b', '40000000-0000-4000-a000-00000000000a', 'x');
    raise exception 'FAIL: B added milestone to A project';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.tasks (user_id, title, project_id, milestone_id)
    values ('00000000-0000-4000-a000-00000000000b', 'x',
            '40000000-0000-4000-a000-00000000000b', '50000000-0000-4000-a000-00000000000a');
    raise exception 'FAIL: B used A milestone';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Account deletion still cascades through projects/milestones/tasks.
reset role;
delete from auth.users where id = '00000000-0000-4000-a000-00000000000a';
do $$
begin
  assert (select count(*) from public.projects where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'account delete cascades projects';
  assert (select count(*) from public.tasks where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'account delete cascades tasks';
end $$;

set local role anon;
do $$
begin
  perform 1 from public.projects;
  raise exception 'FAIL: anon read projects';
exception when insufficient_privilege then null;
end $$;

select 'PASS projects' as result;
rollback;
