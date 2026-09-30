-- Scheduler core (spec §17, first implementation sequence step 4).
-- projects / milestones / AI tables arrive in later phases.
--
-- Composite foreign keys on (id, user_id) guarantee at the DB level that child
-- rows reference parents owned by the same user (spec §44).

create table public.scheduler_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  workday_start time not null default '08:00',
  workday_end time not null default '22:00',
  working_days smallint[] not null default array[1,2,3,4,5],
  slot_minutes integer not null default 15 check (slot_minutes in (5, 10, 15, 30, 60)),
  min_block_minutes integer not null default 15 check (min_block_minutes > 0),
  max_focus_block_minutes integer not null default 120
    check (max_focus_block_minutes >= min_block_minutes),
  default_break_minutes integer not null default 10 check (default_break_minutes >= 0),
  auto_schedule_mode text not null default 'auto_duration'
    check (auto_schedule_mode in ('off', 'suggest_only', 'auto_duration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (workday_end > workday_start)
);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  category text,
  default_estimate_minutes integer
    check (default_estimate_minutes is null or default_estimate_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  status text not null default 'inbox'
    check (status in ('inbox', 'planned', 'in_progress', 'completed', 'cancelled')),
  priority smallint not null default 3 check (priority between 1 and 5),
  complexity smallint not null default 3 check (complexity between 1 and 5),
  target_date date,
  due_at timestamptz,
  user_estimated_minutes integer
    check (user_estimated_minutes is null or user_estimated_minutes > 0),
  recommended_minutes integer
    check (recommended_minutes is null or recommended_minutes > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id),
  foreign key (template_id, user_id)
    references public.task_templates(id, user_id)
    on delete set null (template_id),
  check ((status = 'completed') = (completed_at is not null))
);

create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'manual'
    check (source in ('manual', 'duration_recommendation', 'ai_recommendation')),
  status text not null default 'planned'
    check (status in ('planned', 'completed', 'skipped', 'cancelled')),
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  check (ends_at > starts_at)
);
-- No exclusion constraint: overlaps are a UX warning, not a DB error (spec §17.7).

create table public.schedule_block_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  schedule_block_id uuid not null,
  change_type text not null
    check (change_type in ('created', 'moved', 'resized', 'auto_adjusted', 'cancelled')),
  actor text not null check (actor in ('user', 'system', 'ai')),
  previous_starts_at timestamptz,
  previous_ends_at timestamptz,
  new_starts_at timestamptz,
  new_ends_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (schedule_block_id, user_id)
    references public.schedule_blocks(id, user_id) on delete cascade
);

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null,
  schedule_block_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  source text not null default 'timer' check (source in ('timer', 'manual')),
  focus_score smallint check (focus_score is null or focus_score between 1 and 5),
  mood_score smallint check (mood_score is null or mood_score between 1 and 5),
  energy_score smallint check (energy_score is null or energy_score between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (schedule_block_id, user_id)
    references public.schedule_blocks(id, user_id)
    on delete set null (schedule_block_id),
  check (ended_at is null or ended_at > started_at),
  check (source = 'timer' or ended_at is not null)
);

create table public.daily_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reflection_date date not null,
  mood_score smallint check (mood_score between 1 and 5),
  focus_score smallint check (focus_score between 1 and 5),
  energy_score smallint check (energy_score between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reflection_date)
);

-- Indexes (spec §18, core subset).
create index tasks_user_target_date_status_idx on public.tasks(user_id, target_date, status);
create index tasks_user_template_idx on public.tasks(user_id, template_id);
create index schedule_blocks_user_start_end_idx on public.schedule_blocks(user_id, starts_at, ends_at);
create index schedule_blocks_task_idx on public.schedule_blocks(task_id);
create index schedule_revisions_block_idx on public.schedule_block_revisions(schedule_block_id, created_at);
create index work_sessions_user_started_idx on public.work_sessions(user_id, started_at);
create index work_sessions_task_idx on public.work_sessions(task_id, started_at);
create index work_sessions_block_idx on public.work_sessions(schedule_block_id);
create unique index work_sessions_one_active_per_user_idx
  on public.work_sessions(user_id) where ended_at is null;
-- daily_reflections(user_id, reflection_date) is covered by its unique constraint.

-- updated_at triggers.
create trigger scheduler_settings_set_updated_at before update on public.scheduler_settings
  for each row execute function public.set_updated_at();
create trigger task_templates_set_updated_at before update on public.task_templates
  for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger schedule_blocks_set_updated_at before update on public.schedule_blocks
  for each row execute function public.set_updated_at();
create trigger work_sessions_set_updated_at before update on public.work_sessions
  for each row execute function public.set_updated_at();
create trigger daily_reflections_set_updated_at before update on public.daily_reflections
  for each row execute function public.set_updated_at();
