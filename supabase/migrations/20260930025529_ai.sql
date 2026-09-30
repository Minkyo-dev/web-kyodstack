-- Phase 5: AI weekly review and recommendations (spec §17.12, §17.13, §34).
-- AI is advisory: generation writes only here. A task exists only after the user
-- accepts, through accept_ai_recommendation().

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  metrics jsonb not null,
  summary text not null,
  positives jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index weekly_reviews_user_week_idx on public.weekly_reviews(user_id, week_start desc);

create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid,
  milestone_id uuid,
  recommendation_date date not null,
  recommendation_type text not null
    check (recommendation_type in ('daily_task', 'milestone_task', 'schedule_adjustment')),
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  priority smallint check (priority is null or priority between 1 and 5),
  rationale text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired')),
  provider text,
  model text,
  prompt_version text,
  input_snapshot jsonb,
  output_snapshot jsonb,
  -- Traceability: the task created on acceptance.
  task_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade,
  foreign key (milestone_id, user_id) references public.milestones(id, user_id) on delete set null (milestone_id),
  foreign key (milestone_id, project_id) references public.milestones(id, project_id) on delete set null (milestone_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete set null (task_id),
  check (milestone_id is null or project_id is not null),
  check ((status = 'pending') = (decided_at is null))
);
create index ai_recommendations_user_date_status_idx
  on public.ai_recommendations(user_id, recommendation_date, status);
create index ai_recommendations_project_user_idx on public.ai_recommendations(project_id, user_id);
create index ai_recommendations_milestone_user_idx on public.ai_recommendations(milestone_id, user_id);
create index ai_recommendations_milestone_project_idx on public.ai_recommendations(milestone_id, project_id);
create index ai_recommendations_task_user_idx on public.ai_recommendations(task_id, user_id);

create trigger weekly_reviews_set_updated_at before update on public.weekly_reviews
  for each row execute function public.set_updated_at();

alter table public.weekly_reviews enable row level security;
alter table public.ai_recommendations enable row level security;

do $$
declare t text;
begin
  foreach t in array array['weekly_reviews', 'ai_recommendations'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end $$;

revoke all on public.weekly_reviews, public.ai_recommendations from anon;

-- Accept (spec §34, §56): create the task and mark the recommendation accepted,
-- atomically. The user may edit title/estimate before accepting.
create or replace function public.accept_ai_recommendation(
  p_recommendation_id uuid,
  p_title text default null,
  p_estimated_minutes integer default null,
  p_target_date date default null
)
returns public.tasks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rec public.ai_recommendations;
  v_task public.tasks;
begin
  select * into v_rec
    from public.ai_recommendations
   where id = p_recommendation_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'recommendation not found' using errcode = 'P0002';
  end if;
  if v_rec.status <> 'pending' then
    raise exception 'recommendation already decided' using errcode = '23514';
  end if;

  insert into public.tasks (
    user_id, title, description, user_estimated_minutes, priority,
    project_id, milestone_id, target_date
  )
  values (
    v_uid,
    coalesce(nullif(trim(p_title), ''), v_rec.title),
    v_rec.description,
    coalesce(p_estimated_minutes, v_rec.estimated_minutes),
    coalesce(v_rec.priority, 3),
    v_rec.project_id,
    v_rec.milestone_id,
    coalesce(p_target_date, v_rec.recommendation_date)
  )
  returning * into v_task;

  update public.ai_recommendations
     set status = 'accepted', decided_at = now(), task_id = v_task.id
   where id = v_rec.id;

  return v_task;
end;
$$;

revoke execute on function public.accept_ai_recommendation(uuid, text, integer, date) from public, anon;
grant execute on function public.accept_ai_recommendation(uuid, text, integer, date) to authenticated;
