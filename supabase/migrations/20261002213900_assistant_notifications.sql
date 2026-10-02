-- ADR 0043: assistant P4 — web push subscriptions, preferences, send log, and a 5-minute Supabase Cron tick.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 1 and 2000),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
revoke update on public.push_subscriptions from authenticated;

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  block_soon boolean not null default true,
  habit_missed boolean not null default true,
  checkin boolean not null default true,
  change_quiet boolean not null default true,
  quiet_start smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 7 check (quiet_end between 0 and 23),
  daily_cap smallint not null default 4 check (daily_cap between 1 and 10),
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy notification_prefs_select_own on public.notification_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy notification_prefs_insert_own on public.notification_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_prefs_update_own on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notification_prefs from anon;

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('block_soon', 'habit_missed', 'checkin', 'change_quiet', 'test')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  local_date date not null,
  title text not null check (char_length(title) between 1 and 200),
  sent_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notification_log_user_date_idx on public.notification_log(user_id, local_date);
alter table public.notification_log enable row level security;
create policy notification_log_select_own on public.notification_log for select to authenticated using (user_id = (select auth.uid()));
-- Own delete exists only so E2E cleanup can remove what a test created (same stance as xp_events, ADR 0016).
create policy notification_log_delete_own on public.notification_log for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.notification_log from anon;
revoke insert, update on public.notification_log from authenticated;

-- 5-minute tick: Supabase Cron → pg_net → the job route. URL and secret live in Vault; without them it is a no-op.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.notify_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_job_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_job_secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function private.notify_tick() from public, anon, authenticated;

select cron.schedule('assistant-notify', '*/5 * * * *', 'select private.notify_tick()');
