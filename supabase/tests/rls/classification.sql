-- Classification: domains, tags, joins, duration_groups, template backfill, RLS.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
insert into public.tags (id, user_id, name) values ('80000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'b-tag');
insert into public.practice_domains (id, user_id, name) values ('90000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'B Domain');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
insert into public.tasks (id, user_id, title) values ('a0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'A task');

do $$
declare n int;
begin
  -- A sees none of B's rows
  assert (select count(*) from public.tags) = 0, 'A sees no B tags';
  assert (select count(*) from public.practice_domains) = 0, 'A sees no B domains';

  -- domains: hierarchy, case-insensitive unique, set null on delete
  insert into public.practice_domains (id, user_id, name)
  values ('90000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Data Engineering');
  insert into public.practice_domains (id, user_id, name, parent_id)
  values ('90000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a', 'Snowflake',
          '90000000-0000-4000-a000-00000000000a');
  begin
    insert into public.practice_domains (user_id, name) values ('00000000-0000-4000-a000-00000000000a', 'snowflake');
    raise exception 'FAIL: case-insensitive duplicate domain';
  exception when unique_violation then null;
  end;
  begin
    insert into public.practice_domains (user_id, name, parent_id)
    values ('00000000-0000-4000-a000-00000000000a', 'x', '90000000-0000-4000-a000-00000000000b');
    raise exception 'FAIL: parent from another user';
  exception when foreign_key_violation then null;
  end;

  -- task classification + cross-user rejection
  update public.tasks set task_type = 'coding', practice_domain_id = '90000000-0000-4000-a000-0000000000a2'
   where id = 'a0000000-0000-4000-a000-00000000000a';
  begin
    update public.tasks set task_type = 'gaming' where id = 'a0000000-0000-4000-a000-00000000000a';
    raise exception 'FAIL: unknown task type';
  exception when check_violation then null;
  end;
  begin
    update public.tasks set practice_domain_id = '90000000-0000-4000-a000-00000000000b'
     where id = 'a0000000-0000-4000-a000-00000000000a';
    raise exception 'FAIL: B domain on A task';
  exception when foreign_key_violation then null;
  end;

  -- tags + links; deleting a tag keeps the task
  insert into public.tags (id, user_id, name) values ('80000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Snowflake');
  begin
    insert into public.tags (user_id, name) values ('00000000-0000-4000-a000-00000000000a', 'SNOWFLAKE');
    raise exception 'FAIL: case-insensitive duplicate tag';
  exception when unique_violation then null;
  end;
  begin
    insert into public.tags (user_id, name) values ('00000000-0000-4000-a000-00000000000a', 'bad#name');
    raise exception 'FAIL: # in tag name';
  exception when check_violation then null;
  end;
  insert into public.task_tags (task_id, tag_id, user_id)
  values ('a0000000-0000-4000-a000-00000000000a', '80000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a');
  begin
    insert into public.task_tags (task_id, tag_id, user_id)
    values ('a0000000-0000-4000-a000-00000000000a', '80000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000a');
    raise exception 'FAIL: B tag on A task';
  exception when foreign_key_violation then null;
  end;
  delete from public.tags where id = '80000000-0000-4000-a000-00000000000a';
  assert (select count(*) from public.task_tags) = 0, 'links removed with the tag';
  assert (select count(*) from public.tasks where id = 'a0000000-0000-4000-a000-00000000000a') = 1, 'task kept';

  -- deleting a domain nulls the task's domain
  delete from public.practice_domains where id = '90000000-0000-4000-a000-0000000000a2';
  assert (select practice_domain_id from public.tasks where id = 'a0000000-0000-4000-a000-00000000000a') is null,
    'domain set null';

  -- duration_groups: own rows only
  insert into public.duration_groups (user_id, group_key, samples, sample_count)
  values ('00000000-0000-4000-a000-00000000000a', 'type:coding', '[]'::jsonb, 0);
  begin
    insert into public.duration_groups (user_id, group_key, samples, sample_count)
    values ('00000000-0000-4000-a000-00000000000b', 'type:coding', '[]'::jsonb, 0);
    raise exception 'FAIL: group as B';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Backfill function (the same code the migration ran): template → tag + links, idempotent.
insert into public.task_templates (id, user_id, name)
values ('b0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Technical Blog');
update public.tasks set template_id = 'b0000000-0000-4000-a000-00000000000a' where id = 'a0000000-0000-4000-a000-00000000000a';
-- backfill runs as the owner (execute is revoked from authenticated)
reset role;
select public.backfill_template_tags('00000000-0000-4000-a000-00000000000a');
select public.backfill_template_tags('00000000-0000-4000-a000-00000000000a');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.tags where name = 'Technical Blog') = 1, 'one tag per template';
  assert (select count(*) from public.template_tags) = 1, 'template linked once';
  assert (select count(*) from public.task_tags) = 1, 'task linked once';
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.tags limit 1;
    raise exception 'FAIL: anon read tags';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select 'PASS classification' as result;
rollback;
