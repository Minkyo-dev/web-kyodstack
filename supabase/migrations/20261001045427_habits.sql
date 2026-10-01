-- G2: habits (check / focus rule, ISO weekdays, optional protocol) and daily habit_checks; xp rule 'habit'.
-- Spec: docs/superpowers/specs/2026-10-01-habits-g2-design.md, ADR 0021.
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  rule text not null check (rule in ('check', 'focus')),
  target_minutes smallint check (target_minutes between 5 and 600),
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  protocol_id uuid,
  mission_id uuid,
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint habits_protocol_id_mission_id_fkey foreign key (protocol_id, mission_id)
    references public.protocols(id, mission_id),
  constraint habits_mission_id_user_id_fkey foreign key (mission_id, user_id)
    references public.missions(id, user_id),
  constraint habits_protocol_mission_together check ((protocol_id is null) = (mission_id is null)),
  constraint habits_rule_shape check (
    (rule = 'check' and target_minutes is null)
    or (rule = 'focus' and protocol_id is not null and target_minutes is not null))
);
create index habits_user_status_idx on public.habits(user_id, status, sort_order);
create index habits_protocol_mission_idx on public.habits(protocol_id, mission_id);
create index habits_mission_user_idx on public.habits(mission_id, user_id);

create table public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  habit_id uuid not null,
  local_date date not null,
  source text not null check (source in ('manual', 'focus')),
  minutes numeric check (minutes is null or minutes >= 0),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (habit_id, local_date),
  constraint habit_checks_habit_id_user_id_fkey foreign key (habit_id, user_id)
    references public.habits(id, user_id) on delete cascade
);
create index habit_checks_user_date_idx on public.habit_checks(user_id, local_date);
create index habit_checks_habit_user_idx on public.habit_checks(habit_id, user_id);

create trigger habits_set_updated_at before update on public.habits
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['habits', 'habit_checks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- XP rule 'habit' (ADR 0021): +10 per check, capped in code at 30 per local day.
alter table public.xp_events drop constraint xp_events_rule_check;
alter table public.xp_events add constraint xp_events_rule_check
  check (rule in ('focus', 'completion', 'commitment', 'quest', 'habit'));
