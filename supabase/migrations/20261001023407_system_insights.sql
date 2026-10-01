-- F2: weekly system analysis + AI-picked daily quests.
-- Spec: docs/superpowers/specs/2026-09-30-system-analysis-ai-quests-design.md
create table public.system_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('weekly_analysis')),
  period_start date not null,
  period_end date not null,
  input jsonb not null,
  content jsonb not null,
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);
create index system_insights_user_created_idx on public.system_insights (user_id, kind, created_at desc);
alter table public.system_insights enable row level security;
create policy system_insights_select_own on public.system_insights for select to authenticated using (user_id = (select auth.uid()));
create policy system_insights_insert_own on public.system_insights for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on public.system_insights from anon;
revoke update, delete on public.system_insights from authenticated;

alter table public.scheduler_settings
  add column insight_weekday smallint check (insight_weekday between 0 and 6),
  add column insight_hour smallint not null default 8 check (insight_hour between 0 and 23);
update public.scheduler_settings set insight_weekday = week_starts_on;

alter table public.quests drop constraint quests_generated_by_check;
alter table public.quests add constraint quests_generated_by_check check (generated_by in ('system', 'ai'));
alter table public.quests add column reason text check (char_length(reason) <= 80);
