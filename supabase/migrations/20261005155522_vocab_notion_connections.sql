-- ADR 0046: 단어장 V0 — one Notion connection per user. Tokens are AES-256-GCM ciphertext sealed by the server
-- (lib/notion/token-crypto); the key never reaches the database.
create table public.notion_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'reauth_required', 'disconnected')),
  workspace_id text check (char_length(workspace_id) <= 100),
  workspace_name text check (char_length(workspace_name) <= 200),
  bot_id text check (char_length(bot_id) <= 100),
  access_token_enc text check (char_length(access_token_enc) <= 4000),
  refresh_token_enc text check (char_length(refresh_token_enc) <= 4000),
  database_id text check (char_length(database_id) <= 100),
  data_source_id text check (char_length(data_source_id) <= 100),
  database_url text check (char_length(database_url) <= 500),
  property_ids jsonb check (property_ids is null or jsonb_typeof(property_ids) = 'object'),
  schema_version smallint check (schema_version > 0),
  last_pulled_at timestamptz,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notion_connections_active_has_token check (status <> 'active' or access_token_enc is not null)
);
alter table public.notion_connections enable row level security;
create policy notion_connections_select_own on public.notion_connections for select to authenticated using (user_id = (select auth.uid()));
create policy notion_connections_insert_own on public.notion_connections for insert to authenticated with check (user_id = (select auth.uid()));
create policy notion_connections_update_own on public.notion_connections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notion_connections_delete_own on public.notion_connections for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.notion_connections from anon;
create trigger notion_connections_set_updated_at before update on public.notion_connections
  for each row execute function public.set_updated_at();
