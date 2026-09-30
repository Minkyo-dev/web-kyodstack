-- task_duration_profiles: own rows only, cannot attach to another user's template.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

insert into public.task_templates (id, user_id, name)
values ('10000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Technical Blog');
insert into public.task_duration_profiles
  (user_id, task_template_id, complexity_bucket, sample_count, recommended_correction_factor)
values ('00000000-0000-4000-a000-00000000000a', '10000000-0000-4000-a000-00000000000a', 0, 3, 1.33);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

do $$
declare n int;
begin
  assert (select count(*) from public.task_duration_profiles) = 0, 'B cannot read A profiles';
  update public.task_duration_profiles set recommended_correction_factor = 9;
  get diagnostics n = row_count;
  assert n = 0, 'B cannot update A profiles';
  delete from public.task_duration_profiles;
  get diagnostics n = row_count;
  assert n = 0, 'B cannot delete A profiles';
  begin
    insert into public.task_duration_profiles (user_id, task_template_id, complexity_bucket)
    values ('00000000-0000-4000-a000-00000000000b', '10000000-0000-4000-a000-00000000000a', 0);
    raise exception 'FAIL: B profiled A template';
  exception when foreign_key_violation then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
begin
  assert (select recommended_correction_factor from public.task_duration_profiles) = 1.33, 'A row untouched';
end $$;

reset role;
set local role anon;
do $$
begin
  perform 1 from public.task_duration_profiles;
  raise exception 'FAIL: anon read profiles';
exception when insufficient_privilege then null;
end $$;

select 'PASS duration_profiles' as result;
rollback;
