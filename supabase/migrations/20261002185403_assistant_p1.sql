-- ADR 0039: assistant P1 — evening check-in fields, cached coach line, evening hour.
alter table public.daily_reflections
  add column win text check (char_length(win) <= 280),
  add column blocker text check (blocker in ('time', 'energy', 'interruption', 'overplanned', 'unclear', 'none')),
  add column next_task_id uuid,
  add constraint daily_reflections_next_task_fkey
    foreign key (next_task_id, user_id) references public.tasks(id, user_id) on delete set null (next_task_id);
create index daily_reflections_next_task_idx on public.daily_reflections(next_task_id) where next_task_id is not null;

alter table public.scheduler_settings
  add column evening_hour smallint not null default 18 check (evening_hour between 12 and 23);

create table public.assistant_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  line text not null check (char_length(line) between 1 and 120),
  model text,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);
alter table public.assistant_briefs enable row level security;
create policy assistant_briefs_select_own on public.assistant_briefs for select to authenticated using (user_id = (select auth.uid()));
create policy assistant_briefs_insert_own on public.assistant_briefs for insert to authenticated with check (user_id = (select auth.uid()));
-- Own delete exists only so E2E cleanup can remove what a test created (same stance as xp_events, ADR 0016).
create policy assistant_briefs_delete_own on public.assistant_briefs for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.assistant_briefs from anon;
revoke update on public.assistant_briefs from authenticated;
