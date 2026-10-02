-- ADR 0042: assistant P3 — chat messages; chat may propose create_task into the P2 inbox.
create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  proposal_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index assistant_messages_user_created_idx on public.assistant_messages(user_id, created_at desc);
alter table public.assistant_messages enable row level security;
create policy assistant_messages_select_own on public.assistant_messages for select to authenticated using (user_id = (select auth.uid()));
create policy assistant_messages_insert_own on public.assistant_messages for insert to authenticated with check (user_id = (select auth.uid()));
create policy assistant_messages_delete_own on public.assistant_messages for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.assistant_messages from anon;
revoke update on public.assistant_messages from authenticated;

alter table public.assistant_proposals drop constraint assistant_proposals_kind_check;
alter table public.assistant_proposals add constraint assistant_proposals_kind_check
  check (kind in ('rule_minutes', 'habit_days', 'review', 'create_task'));
