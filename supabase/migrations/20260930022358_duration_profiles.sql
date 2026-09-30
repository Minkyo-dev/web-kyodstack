-- Phase 3: learned duration profiles (spec §17.11, §26).
-- Derived data: a cache rebuilt from tasks + work_sessions by the TypeScript
-- estimator service. complexity_bucket = 0 means "all complexities".

create table public.task_duration_profiles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_template_id uuid not null,
  complexity_bucket smallint not null default 0 check (complexity_bucket between 0 and 5),
  sample_count integer not null default 0 check (sample_count >= 0),
  median_actual_minutes numeric,
  p75_actual_minutes numeric,
  median_plan_actual_ratio numeric,
  ewma_plan_actual_ratio numeric,
  recommended_correction_factor numeric
    check (recommended_correction_factor is null or recommended_correction_factor > 0),
  calculated_at timestamptz not null default now(),
  primary key (user_id, task_template_id, complexity_bucket),
  foreign key (task_template_id, user_id)
    references public.task_templates(id, user_id) on delete cascade
);

create index task_duration_profiles_template_user_idx
  on public.task_duration_profiles(task_template_id, user_id);

alter table public.task_duration_profiles enable row level security;

create policy "task_duration_profiles_select_own" on public.task_duration_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "task_duration_profiles_insert_own" on public.task_duration_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "task_duration_profiles_update_own" on public.task_duration_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "task_duration_profiles_delete_own" on public.task_duration_profiles
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.task_duration_profiles from anon;

-- Sample lookup for the estimator: completed tasks of one template, newest first.
create index tasks_user_template_completed_idx
  on public.tasks(user_id, template_id, completed_at desc)
  where status = 'completed';
