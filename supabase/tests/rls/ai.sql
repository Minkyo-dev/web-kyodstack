-- AI tables: isolation, atomic accept, no double accept, weekly review idempotency.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

insert into public.projects (id, user_id, name)
values ('40000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'MLB');
insert into public.milestones (id, user_id, project_id, name)
values ('50000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a',
        '40000000-0000-4000-a000-00000000000a', 'M1');
insert into public.ai_recommendations
  (id, user_id, project_id, milestone_id, recommendation_date, recommendation_type, title, estimated_minutes, priority)
values ('60000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a',
        '40000000-0000-4000-a000-00000000000a', '50000000-0000-4000-a000-00000000000a',
        '2026-09-30', 'milestone_task', 'Implement ESPN games endpoint ingestion', 70, 2);

-- Weekly review upsert is idempotent on (user, week_start).
insert into public.weekly_reviews (user_id, week_start, metrics, summary)
values ('00000000-0000-4000-a000-00000000000a', '2026-09-28', '{}', 'v1')
on conflict (user_id, week_start) do update set summary = excluded.summary;
insert into public.weekly_reviews (user_id, week_start, metrics, summary)
values ('00000000-0000-4000-a000-00000000000a', '2026-09-28', '{}', 'v2')
on conflict (user_id, week_start) do update set summary = excluded.summary;

do $$
declare t public.tasks;
begin
  assert (select count(*) from public.weekly_reviews) = 1, 'one review per week';
  assert (select summary from public.weekly_reviews) = 'v2', 'retry replaced the review';
  assert (select count(*) from public.tasks) = 0, 'no task before acceptance';

  t := public.accept_ai_recommendation('60000000-0000-4000-a000-00000000000a', null, 80, null);
  assert t.title = 'Implement ESPN games endpoint ingestion', 'title copied';
  assert t.user_estimated_minutes = 80, 'user-edited estimate wins';
  assert t.project_id = '40000000-0000-4000-a000-00000000000a'
     and t.milestone_id = '50000000-0000-4000-a000-00000000000a', 'task linked to project/milestone';
  assert t.target_date = '2026-09-30', 'target date defaults to recommendation date';
  assert (select status from public.ai_recommendations) = 'accepted', 'accepted';
  assert (select task_id from public.ai_recommendations) = t.id, 'traceable to task';
  assert (select decided_at from public.ai_recommendations) is not null, 'decided_at set';

  begin
    perform public.accept_ai_recommendation('60000000-0000-4000-a000-00000000000a');
    raise exception 'FAIL: double accept';
  exception when check_violation then null;
  end;
  assert (select count(*) from public.tasks) = 1, 'still exactly one task';

  -- decided_at must track status
  begin
    insert into public.ai_recommendations (user_id, recommendation_date, recommendation_type, title, status)
    values ('00000000-0000-4000-a000-00000000000a', '2026-09-30', 'daily_task', 'x', 'rejected');
    raise exception 'FAIL: decided status without decided_at';
  exception when check_violation then null;
  end;
end $$;

insert into public.ai_recommendations (id, user_id, recommendation_date, recommendation_type, title)
values ('60000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a', '2026-09-30', 'daily_task', 'pending one');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$
declare n int;
begin
  assert (select count(*) from public.ai_recommendations) = 0, 'B cannot read A recommendations';
  assert (select count(*) from public.weekly_reviews) = 0, 'B cannot read A reviews';
  begin
    perform public.accept_ai_recommendation('60000000-0000-4000-a000-0000000000a2');
    raise exception 'FAIL: B accepted A recommendation';
  exception when no_data_found then null;
  end;
  update public.ai_recommendations set status = 'rejected', decided_at = now();
  get diagnostics n = row_count;
  assert n = 0, 'B cannot reject A recommendation';
  begin
    insert into public.ai_recommendations (user_id, project_id, recommendation_date, recommendation_type, title)
    values ('00000000-0000-4000-a000-00000000000b', '40000000-0000-4000-a000-00000000000a', '2026-09-30', 'daily_task', 'x');
    raise exception 'FAIL: B linked A project';
  exception when foreign_key_violation then null;
  end;
end $$;

reset role;
set local role anon;
do $$
begin
  perform public.accept_ai_recommendation('60000000-0000-4000-a000-0000000000a2');
  raise exception 'FAIL: anon accepted';
exception when insufficient_privilege then null;
end $$;

select 'PASS ai' as result;
rollback;
