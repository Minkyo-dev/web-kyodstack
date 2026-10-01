-- Gamification E2: quests, objectives, achievements, titles.
-- Spec: docs/superpowers/specs/2026-09-30-quests-achievements-design.md

alter table public.xp_events drop constraint xp_events_rule_check;
alter table public.xp_events add constraint xp_events_rule_check
  check (rule in ('focus', 'completion', 'commitment', 'quest'));
alter table public.xp_events drop constraint xp_events_xp_check;
alter table public.xp_events add constraint xp_events_xp_check
  check (xp >= 1 and xp <= case when rule = 'quest' then 300 else 120 end);

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('daily', 'weekly', 'recovery')),
  status text not null default 'active' check (status in ('active', 'cleared', 'expired')),
  title text not null check (char_length(title) between 1 and 60),
  period_start date not null,
  period_end date not null,
  reward_xp integer not null check (reward_xp between 1 and 300),
  swap_used boolean not null default false,
  spare jsonb not null default '[]',
  generated_by text not null default 'system' check (generated_by = 'system'),
  rules_version text not null,
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  check (period_end >= period_start),
  unique (user_id, type, period_start),
  unique (id, user_id)
);
create unique index quests_one_active_recovery on public.quests (user_id) where type = 'recovery' and status = 'active';
create index quests_user_status_idx on public.quests (user_id, status);

create table public.quest_objectives (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  metric text not null check (metric in (
    'focus_minutes', 'complete_planned_tasks', 'complete_tasks', 'domain_minutes', 'domain_sessions',
    'kept_commitments', 'kept_commitment_rate', 'days_within_capacity', 'early_session', 'booked_block',
    'started_session')),
  params jsonb not null default '{}',
  target_value numeric not null check (target_value > 0),
  current_value numeric not null default 0,
  completed_at timestamptz,
  foreign key (quest_id, user_id) references public.quests(id, user_id) on delete cascade,
  unique (quest_id, position)
);
create index quest_objectives_user_idx on public.quest_objectives (user_id);

create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);
create table public.user_titles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.quests enable row level security;
alter table public.quest_objectives enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_titles enable row level security;

create policy quests_select_own on public.quests for select to authenticated using (user_id = (select auth.uid()));
create policy quests_insert_own on public.quests for insert to authenticated with check (user_id = (select auth.uid()));
create policy quests_update_own on public.quests for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy quest_objectives_select_own on public.quest_objectives for select to authenticated using (user_id = (select auth.uid()));
create policy quest_objectives_insert_own on public.quest_objectives for insert to authenticated with check (user_id = (select auth.uid()));
create policy quest_objectives_update_own on public.quest_objectives for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_achievements_select_own on public.user_achievements for select to authenticated using (user_id = (select auth.uid()));
create policy user_achievements_insert_own on public.user_achievements for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_titles_select_own on public.user_titles for select to authenticated using (user_id = (select auth.uid()));
create policy user_titles_insert_own on public.user_titles for insert to authenticated with check (user_id = (select auth.uid()));

-- Own delete exists only so E2E cleanup can remove what a test created (same stance as xp_events, ADR 0016).
create policy quests_delete_own on public.quests for delete to authenticated using (user_id = (select auth.uid()));
create policy user_achievements_delete_own on public.user_achievements for delete to authenticated using (user_id = (select auth.uid()));
create policy user_titles_delete_own on public.user_titles for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.quests, public.quest_objectives, public.user_achievements, public.user_titles from anon;
revoke delete on public.quest_objectives from authenticated;
revoke update on public.user_achievements, public.user_titles from authenticated;

alter table public.player_profiles add column equipped_title text;
grant update (equipped_title) on public.player_profiles to authenticated;

create or replace function public.check_equipped_title()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.equipped_title is not null and not exists (
    select 1 from public.user_titles t where t.user_id = new.user_id and t.key = new.equipped_title
  ) then
    raise exception 'title not unlocked' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger player_profiles_check_title before insert or update of equipped_title on public.player_profiles
  for each row execute function public.check_equipped_title();

-- Quest + objectives in one transaction; null when that type already exists for the period.
create or replace function public.create_quest(p_quest jsonb, p_objectives jsonb, p_user_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user_id);
  v_id uuid;
begin
  if v_user is null then
    raise exception 'user required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_objectives) <> 'array' or jsonb_array_length(p_objectives) = 0 then
    raise exception 'objectives required' using errcode = '22023';
  end if;
  insert into public.quests (user_id, type, title, period_start, period_end, reward_xp, spare, rules_version)
  values (v_user, p_quest->>'type', p_quest->>'title', (p_quest->>'period_start')::date, (p_quest->>'period_end')::date,
          (p_quest->>'reward_xp')::integer, coalesce(p_quest->'spare', '[]'::jsonb), p_quest->>'rules_version')
  on conflict (user_id, type, period_start) do nothing
  returning id into v_id;
  if v_id is null then
    return null;
  end if;
  insert into public.quest_objectives (quest_id, user_id, position, metric, params, target_value)
  select v_id, v_user, (o->>'position')::smallint, o->>'metric', coalesce(o->'params', '{}'::jsonb), (o->>'target_value')::numeric
  from jsonb_array_elements(p_objectives) as o;
  return v_id;
end $$;
revoke execute on function public.create_quest(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.create_quest(jsonb, jsonb, uuid) to authenticated, service_role;

-- One swap per daily quest; the objective must be incomplete and the quest active.
create or replace function public.swap_quest_objective(p_objective_id uuid, p_objective jsonb, p_spare jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quest uuid;
begin
  select o.quest_id into v_quest
  from public.quest_objectives o
  join public.quests q on q.id = o.quest_id and q.user_id = o.user_id
  where o.id = p_objective_id and o.completed_at is null
    and q.type = 'daily' and q.status = 'active' and not q.swap_used
  for update of q;
  if v_quest is null then
    raise exception 'swap not allowed' using errcode = '23514';
  end if;
  update public.quests set swap_used = true, spare = coalesce(p_spare, '[]'::jsonb) where id = v_quest;
  update public.quest_objectives
  set metric = p_objective->>'metric', params = coalesce(p_objective->'params', '{}'::jsonb),
      target_value = (p_objective->>'target_value')::numeric, current_value = 0, completed_at = null
  where id = p_objective_id;
end $$;
revoke execute on function public.swap_quest_objective(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.swap_quest_objective(uuid, jsonb, jsonb) to authenticated;
