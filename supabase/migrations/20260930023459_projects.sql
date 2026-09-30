-- Phase 4: projects and milestones (spec §17.3, §17.4, §29, §44).

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  status text not null default 'active'
    check (status in ('planned', 'active', 'paused', 'completed', 'cancelled')),
  priority smallint not null default 3 check (priority between 1 and 5),
  start_date date,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (target_date is null or start_date is null or target_date >= start_date)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  target_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, project_id),
  -- Spec §17.4: the project must belong to the same user.
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade
);

-- Projects/milestones are closed with status = 'cancelled', never hard-deleted while tasks
-- reference them. NO ACTION (checked at statement end) still lets an account deletion
-- cascade through everything.
alter table public.tasks
  add column project_id uuid,
  add column milestone_id uuid,
  add constraint tasks_project_id_user_id_fkey
    foreign key (project_id, user_id) references public.projects(id, user_id),
  add constraint tasks_milestone_id_user_id_fkey
    foreign key (milestone_id, user_id) references public.milestones(id, user_id),
  -- Spec §44: milestone.project_id == task.project_id.
  add constraint tasks_milestone_id_project_id_fkey
    foreign key (milestone_id, project_id) references public.milestones(id, project_id),
  add constraint tasks_milestone_requires_project
    check (milestone_id is null or project_id is not null);

create index tasks_user_project_status_idx on public.tasks(user_id, project_id, status);
create index tasks_project_user_idx on public.tasks(project_id, user_id);
create index tasks_milestone_user_idx on public.tasks(milestone_id, user_id);
create index tasks_milestone_project_idx on public.tasks(milestone_id, project_id);
create index milestones_user_project_target_idx on public.milestones(user_id, project_id, target_date);
create index milestones_project_user_idx on public.milestones(project_id, user_id);

create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger milestones_set_updated_at before update on public.milestones
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.milestones enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projects', 'milestones'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end $$;

revoke all on public.projects, public.milestones from anon;

-- Expose project/milestone on the plan-vs-actual view (new columns are appended).
create or replace view public.task_plan_actual
with (security_invoker = true) as
select
  t.id as task_id,
  t.user_id,
  t.template_id,
  t.complexity,
  t.user_estimated_minutes,
  t.status,
  t.completed_at,
  coalesce(p.planned_minutes, 0)::numeric as planned_minutes,
  coalesce(p.skipped_minutes, 0)::numeric as skipped_minutes,
  coalesce(a.actual_minutes, 0)::numeric as actual_minutes,
  coalesce(a.session_count, 0)::int as session_count,
  a.average_focus,
  coalesce(r.reschedule_count, 0)::int as reschedule_count,
  t.project_id,
  t.milestone_id
from public.tasks t
left join lateral (
  select
    sum(extract(epoch from (b.ends_at - b.starts_at)) / 60.0) as planned_minutes,
    sum(extract(epoch from (b.ends_at - b.starts_at)) / 60.0)
      filter (where b.status = 'skipped') as skipped_minutes
  from public.schedule_blocks b
  where b.task_id = t.id and b.status <> 'cancelled'
) p on true
left join lateral (
  select
    sum(extract(epoch from (w.ended_at - w.started_at)) / 60.0) as actual_minutes,
    count(*) as session_count,
    round(avg(w.focus_score), 2) as average_focus
  from public.work_sessions w
  where w.task_id = t.id and w.ended_at is not null
) a on true
left join lateral (
  select count(*) as reschedule_count
  from public.schedule_block_revisions rv
  join public.schedule_blocks b on b.id = rv.schedule_block_id
  where b.task_id = t.id and rv.change_type in ('moved', 'resized')
) r on true;
