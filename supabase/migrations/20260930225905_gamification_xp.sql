-- Gamification E1: XP ledger + player profile cache.
-- Spec: docs/superpowers/specs/2026-09-30-xp-level-design.md

create table public.player_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  level integer not null default 1 check (level >= 1),
  total_xp integer not null default 0 check (total_xp >= 0),
  gamification_enabled boolean not null default false,
  quest_terminology boolean not null default false,
  animations_enabled boolean not null default true,
  achievement_toasts boolean not null default true,
  backfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger player_profiles_set_updated_at before update on public.player_profiles
  for each row execute function public.set_updated_at();

alter table public.player_profiles enable row level security;
create policy player_profiles_select_own on public.player_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy player_profiles_insert_own on public.player_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy player_profiles_update_own on public.player_profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.player_profiles from anon;
revoke insert, update, delete on public.player_profiles from authenticated;
grant insert (user_id, gamification_enabled, quest_terminology, animations_enabled, achievement_toasts)
  on public.player_profiles to authenticated;
grant update (gamification_enabled, quest_terminology, animations_enabled, achievement_toasts, backfilled_at)
  on public.player_profiles to authenticated;

create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  rule text not null check (rule in ('focus', 'completion', 'commitment')),
  source_type text not null,
  source_id uuid not null,
  local_date date not null,
  xp integer not null check (xp between 1 and 120),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, rule, source_id)
);
create index xp_events_user_day_idx on public.xp_events (user_id, local_date);

alter table public.xp_events enable row level security;
create policy xp_events_select_own on public.xp_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy xp_events_insert_own on public.xp_events
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy xp_events_delete_own on public.xp_events
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.xp_events from anon;
revoke update on public.xp_events from authenticated;

create or replace function public.xp_level(p_total integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_level integer := 1;
  v_rest integer := greatest(coalesce(p_total, 0), 0);
begin
  while v_rest >= 100 + 50 * v_level loop
    v_rest := v_rest - (100 + 50 * v_level);
    v_level := v_level + 1;
  end loop;
  return v_level;
end $$;

-- Cache = ledger sum. Definer so the trigger can write the cache columns users cannot.
create or replace function public.refresh_player_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct n.user_id) into v_users from new_rows n;
  else
    select array_agg(distinct o.user_id) into v_users from old_rows o;
  end if;
  if v_users is null then
    return null;
  end if;
  insert into public.player_profiles as p (user_id, total_xp, level)
  select u, t.total, public.xp_level(t.total)
  from unnest(v_users) as u
  cross join lateral (
    select coalesce(sum(x.xp), 0)::integer as total from public.xp_events x where x.user_id = u
  ) as t
  on conflict (user_id) do update set total_xp = excluded.total_xp, level = excluded.level;
  return null;
end $$;
revoke execute on function public.refresh_player_cache() from public, anon, authenticated;

create trigger xp_events_cache_insert after insert on public.xp_events
  referencing new table as new_rows for each statement execute function public.refresh_player_cache();
create trigger xp_events_cache_delete after delete on public.xp_events
  referencing old table as old_rows for each statement execute function public.refresh_player_cache();

-- Idempotent award. Authenticated callers always award to themselves; the service role passes p_user_id.
create or replace function public.award_xp(p_events jsonb, p_user_id uuid default null)
returns table (total_xp integer, level integer, previous_level integer)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := coalesce(auth.uid(), p_user_id);
  v_prev integer;
begin
  if v_user is null then
    raise exception 'user required' using errcode = '42501';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'events must be an array' using errcode = '22023';
  end if;
  select coalesce((select p.level from public.player_profiles p where p.user_id = v_user), 1) into v_prev;
  insert into public.xp_events (user_id, rule, source_type, source_id, local_date, xp, metadata)
  select v_user, e->>'rule', e->>'source_type', (e->>'source_id')::uuid, (e->>'local_date')::date,
         (e->>'xp')::integer, coalesce(e->'metadata', '{}'::jsonb)
  from jsonb_array_elements(p_events) as e
  on conflict (user_id, rule, source_id) do nothing;
  return query
    select p.total_xp, p.level, v_prev from public.player_profiles p where p.user_id = v_user;
end $$;
revoke execute on function public.award_xp(jsonb, uuid) from public, anon;
grant execute on function public.award_xp(jsonb, uuid) to authenticated, service_role;
