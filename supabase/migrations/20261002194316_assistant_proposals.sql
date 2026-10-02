-- ADR 0040: assistant P2 — one proposal inbox (weekly coaching writes into it).
create table public.assistant_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  kind text not null check (kind in ('rule_minutes', 'habit_days', 'review')),
  target_key text not null check (char_length(target_key) between 1 and 120),
  title text not null check (char_length(title) between 1 and 80),
  reason text not null check (char_length(reason) between 1 and 300),
  payload jsonb not null,
  evidence jsonb not null default '{}'::jsonb,
  focus boolean not null default false,
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'dismissed')),
  rules_version text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (user_id, week_start, kind, target_key)
);
create unique index assistant_proposals_one_focus on public.assistant_proposals(user_id, week_start) where focus;
create index assistant_proposals_user_week_idx on public.assistant_proposals(user_id, week_start);

alter table public.assistant_proposals enable row level security;
create policy assistant_proposals_select_own on public.assistant_proposals for select to authenticated using (user_id = (select auth.uid()));
create policy assistant_proposals_insert_own on public.assistant_proposals for insert to authenticated with check (user_id = (select auth.uid()));
create policy assistant_proposals_update_own on public.assistant_proposals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Own delete exists only so E2E cleanup can remove what a test created (same stance as xp_events, ADR 0016).
create policy assistant_proposals_delete_own on public.assistant_proposals for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.assistant_proposals from anon;
-- Payload and evidence are written once; only the decision can change.
revoke update on public.assistant_proposals from authenticated;
grant update (status, decided_at) on public.assistant_proposals to authenticated;
