-- G1: direction layer — purpose, identities, missions (+ identities, criteria), paths, protocols,
-- task/project links, switch_path. Spec: docs/superpowers/specs/2026-09-30-direction-layer-g1-design.md, ADR 0020.

create table public.purposes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  statement text not null check (length(trim(statement)) between 1 and 280),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index purposes_one_active_idx on public.purposes(user_id) where status = 'active';

create table public.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  description text check (description is null or length(description) <= 280),
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index identities_user_idx on public.identities(user_id, status, sort_order);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose_id uuid,
  title text not null check (length(trim(title)) between 1 and 120),
  outcome text check (outcome is null or length(outcome) <= 500),
  deadline date,
  status text not null default 'active' check (status in ('active', 'achieved', 'dropped')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint missions_purpose_id_user_id_fkey foreign key (purpose_id, user_id)
    references public.purposes(id, user_id) on delete set null (purpose_id),
  check ((status = 'active') = (closed_at is null))
);
create index missions_user_status_idx on public.missions(user_id, status);
create index missions_purpose_user_idx on public.missions(purpose_id, user_id);

create table public.mission_identities (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mission_id uuid not null,
  identity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (mission_id, identity_id),
  constraint mission_identities_mission_id_user_id_fkey foreign key (mission_id, user_id)
    references public.missions(id, user_id) on delete cascade,
  constraint mission_identities_identity_id_user_id_fkey foreign key (identity_id, user_id)
    references public.identities(id, user_id) on delete cascade
);
create index mission_identities_identity_user_idx on public.mission_identities(identity_id, user_id);
create index mission_identities_mission_user_idx on public.mission_identities(mission_id, user_id);

create table public.mission_criteria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mission_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 120),
  kind text not null check (kind in ('check', 'numeric')),
  target_value numeric,
  current_value numeric,
  unit text check (unit is null or length(unit) <= 12),
  met_at timestamptz,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint mission_criteria_mission_id_user_id_fkey foreign key (mission_id, user_id)
    references public.missions(id, user_id) on delete cascade,
  check ((kind = 'check' and target_value is null) or (kind = 'numeric' and target_value > 0))
);
create index mission_criteria_mission_user_idx on public.mission_criteria(mission_id, user_id, position);

create table public.paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mission_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 80),
  approach text not null check (length(trim(approach)) between 1 and 1000),
  trade_offs text check (trade_offs is null or length(trade_offs) <= 1000),
  status text not null default 'active' check (status in ('active', 'retired')),
  started_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, mission_id),
  constraint paths_mission_id_user_id_fkey foreign key (mission_id, user_id)
    references public.missions(id, user_id),
  check ((status = 'retired') = (retired_at is not null))
);
create unique index paths_one_active_idx on public.paths(mission_id) where status = 'active';
create index paths_mission_user_idx on public.paths(mission_id, user_id);

create table public.protocols (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  path_id uuid not null,
  mission_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 80),
  steps text[] not null default '{}' check (cardinality(steps) <= 12),
  intended_minutes smallint check (intended_minutes between 5 and 600),
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, mission_id),
  constraint protocols_path_id_mission_id_fkey foreign key (path_id, mission_id)
    references public.paths(id, mission_id),
  constraint protocols_mission_id_user_id_fkey foreign key (mission_id, user_id)
    references public.missions(id, user_id)
);
create index protocols_path_mission_idx on public.protocols(path_id, mission_id);
create index protocols_mission_user_idx on public.protocols(mission_id, user_id);

-- Links. NO ACTION: a mission or protocol with tasks/projects can't be hard-deleted (closed instead).
alter table public.tasks
  add column mission_id uuid,
  add column protocol_id uuid,
  add constraint tasks_mission_id_user_id_fkey
    foreign key (mission_id, user_id) references public.missions(id, user_id),
  add constraint tasks_protocol_id_mission_id_fkey
    foreign key (protocol_id, mission_id) references public.protocols(id, mission_id),
  add constraint tasks_protocol_requires_mission
    check (protocol_id is null or mission_id is not null);
create index tasks_mission_user_idx on public.tasks(mission_id, user_id);
create index tasks_protocol_mission_idx on public.tasks(protocol_id, mission_id);

alter table public.projects
  add column mission_id uuid,
  add constraint projects_mission_id_user_id_fkey
    foreign key (mission_id, user_id) references public.missions(id, user_id);
create index projects_mission_user_idx on public.projects(mission_id, user_id);

-- Retired paths are history: read-only. Their protocols may only be archived.
create or replace function public.guard_retired_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'retired' then
    raise exception 'retired path is read-only' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function public.guard_protocol_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'active' and new.status = 'archived'
     and (new.title, new.steps, new.intended_minutes, new.sort_order, new.path_id)
         is not distinct from (old.title, old.steps, old.intended_minutes, old.sort_order, old.path_id) then
    return new;
  end if;
  if exists (select 1 from public.paths p where p.id = new.path_id and p.status = 'retired') then
    raise exception 'protocols of a retired path are read-only' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger paths_guard_retired before update on public.paths
  for each row execute function public.guard_retired_path();
create trigger protocols_guard_path before insert or update on public.protocols
  for each row execute function public.guard_protocol_path();

do $$
declare t text;
begin
  foreach t in array array['purposes', 'identities', 'missions', 'mission_criteria', 'paths', 'protocols'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
  foreach t in array array['purposes', 'identities', 'missions', 'mission_identities', 'mission_criteria', 'paths', 'protocols'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Retire the active path (archiving its protocols first) and insert the new one, atomically.
create or replace function public.switch_path(
  p_mission_id uuid, p_title text, p_approach text, p_trade_offs text default null
)
returns public.paths
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid;
  v_old uuid;
  v_new public.paths;
begin
  select user_id into v_user from public.missions
  where id = p_mission_id and status = 'active'
  for update;
  if v_user is null then
    raise exception 'active mission not found' using errcode = 'P0002';
  end if;

  select id into v_old from public.paths where mission_id = p_mission_id and status = 'active';
  if v_old is not null then
    update public.protocols set status = 'archived' where path_id = v_old and status = 'active';
    update public.paths set status = 'retired', retired_at = now() where id = v_old;
  end if;

  insert into public.paths (user_id, mission_id, title, approach, trade_offs)
  values (v_user, p_mission_id, trim(p_title), trim(p_approach), nullif(trim(coalesce(p_trade_offs, '')), ''))
  returning * into v_new;
  return v_new;
end $$;

revoke all on function public.switch_path(uuid, text, text, text) from public, anon;
grant execute on function public.switch_path(uuid, text, text, text) to authenticated;

-- task_plan_actual: same columns as 20260930042046_focus_pauses, plus the direction links appended.
create or replace view public.task_plan_actual
with (security_invoker = true) as
select
  t.id as task_id,
  t.user_id,
  t.template_id,
  t.complexity,
  t.user_estimated_minutes,
  t.status,
  t.completed_at,
  coalesce(p.planned_minutes, 0)::numeric as planned_minutes,
  coalesce(p.skipped_minutes, 0)::numeric as skipped_minutes,
  coalesce(a.actual_minutes, 0)::numeric as actual_minutes,
  coalesce(a.session_count, 0)::int as session_count,
  f.average_focus,
  coalesce(r.reschedule_count, 0)::int as reschedule_count,
  t.project_id,
  t.milestone_id,
  coalesce(a.paused_minutes, 0)::numeric as paused_minutes,
  t.mission_id,
  t.protocol_id,
  coalesce(t.mission_id, pj.mission_id) as effective_mission_id
from public.tasks t
left join public.projects pj on pj.id = t.project_id
left join lateral (
  select
    sum(extract(epoch from (b.ends_at - b.starts_at)) / 60.0) as planned_minutes,
    sum(extract(epoch from (b.ends_at - b.starts_at)) / 60.0)
      filter (where b.status = 'skipped') as skipped_minutes
  from public.schedule_blocks b
  where b.task_id = t.id and b.status <> 'cancelled'
) p on true
left join lateral (
  select
    sum(extract(epoch from (w.ended_at - w.started_at)) / 60.0 - coalesce(pz.paused, 0)) as actual_minutes,
    sum(coalesce(pz.paused, 0)) as paused_minutes,
    count(*) as session_count
  from public.work_sessions w
  left join lateral (
    select sum(extract(epoch from (least(coalesce(q.resumed_at, w.ended_at), w.ended_at)
                                   - greatest(q.paused_at, w.started_at))) / 60.0) as paused
    from public.work_session_pauses q
    where q.session_id = w.id
  ) pz on true
  where w.task_id = t.id and w.ended_at is not null
) a on true
left join lateral (
  select round(avg(l.focus_score), 2) as average_focus
  from public.work_logs l
  where l.task_id = t.id
) f on true
left join lateral (
  select count(*) as reschedule_count
  from public.schedule_block_revisions rv
  join public.schedule_blocks b on b.id = rv.schedule_block_id
  where b.task_id = t.id and rv.change_type in ('moved', 'resized')
) r on true;

revoke all on public.task_plan_actual from anon;
grant select on public.task_plan_actual to authenticated;
