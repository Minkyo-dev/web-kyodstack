-- Phase 6: background job ledger (spec §45-§48).
-- One row per (job, user, run_key) makes every job idempotent: duplicate or delayed
-- cron invocations find the row and skip, and failed runs can be retried.
-- Written only by trusted jobs (service role); users may read their own rows.

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null check (job_name in ('daily_planner', 'weekly_review', 'duration_profile_refresh')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  run_key text not null,
  status text not null check (status in ('running', 'succeeded', 'skipped', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  detail jsonb,
  unique (job_name, user_id, run_key)
);

create index job_runs_user_started_idx on public.job_runs(user_id, started_at desc);

alter table public.job_runs enable row level security;

create policy "job_runs_select_own" on public.job_runs
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.job_runs from anon;
revoke insert, update, delete on public.job_runs from authenticated;
