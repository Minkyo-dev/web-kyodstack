-- F1: AI feature provenance, call ledger (daily cap), work-log interpretation.
-- Spec: docs/superpowers/specs/2026-09-30-ai-classification-worklog-design.md

create table public.task_features (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null,
  feature_type text not null check (feature_type in ('task_type', 'domain', 'complexity', 'skills')),
  feature_value jsonb not null,
  source text not null check (source in ('ai', 'user', 'system')),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);
create unique index task_features_one_open on public.task_features (task_id, feature_type) where status = 'proposed';
create index task_features_user_task_idx on public.task_features (user_id, task_id);

alter table public.task_features enable row level security;
create policy task_features_select_own on public.task_features for select to authenticated using (user_id = (select auth.uid()));
create policy task_features_insert_own on public.task_features for insert to authenticated with check (user_id = (select auth.uid()));
create policy task_features_update_own on public.task_features for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.task_features from anon;
revoke delete on public.task_features from authenticated;

create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  model text,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index ai_calls_user_created_idx on public.ai_calls (user_id, created_at);
alter table public.ai_calls enable row level security;
create policy ai_calls_select_own on public.ai_calls for select to authenticated using (user_id = (select auth.uid()));
create policy ai_calls_insert_own on public.ai_calls for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on public.ai_calls from anon;
revoke update, delete on public.ai_calls from authenticated;

alter table public.work_logs
  add column ai_interpretation jsonb,
  add column interpretation_model text,
  add column interpretation_version text,
  add column confirmed_blocker boolean;
