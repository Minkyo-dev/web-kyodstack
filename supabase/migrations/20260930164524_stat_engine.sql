-- Stat engine + progress (sub-project D2).
-- Spec: docs/superpowers/specs/2026-09-30-stat-engine-progress-design.md

alter table public.scheduler_settings
  add column planned_work_days smallint[] not null default '{1,2,3,4,5}'
    check (cardinality(planned_work_days) between 1 and 7 and planned_work_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  add column min_meaningful_minutes integer not null default 30 check (min_meaningful_minutes between 5 and 480),
  add column commit_lead_minutes integer not null default 120 check (commit_lead_minutes between 0 and 1440);

create table public.stat_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  computed_on date not null,
  stat_type text not null check (stat_type in ('calibration', 'reliability', 'consistency', 'recovery')),
  scope text not null default 'overall',
  value numeric,
  bias numeric,
  typical_error numeric,
  sample_count integer not null check (sample_count >= 0),
  window_start date not null,
  window_end date not null,
  formula_version text not null,
  created_at timestamptz not null default now(),
  unique (user_id, computed_on, stat_type, scope)
);
create index stat_snapshots_user_day_idx on public.stat_snapshots (user_id, computed_on);

alter table public.stat_snapshots enable row level security;
create policy stat_snapshots_select_own on public.stat_snapshots
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.stat_snapshots from anon;
revoke insert, update, delete on public.stat_snapshots from authenticated;
