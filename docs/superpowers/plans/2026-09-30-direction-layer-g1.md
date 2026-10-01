# Direction layer (G1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Purpose, identities, missions (with success criteria), one active path per mission (with history) and protocols, linked to tasks and projects, with a `/scheduler/directive` page and a breadcrumb in the task drawer.

**Architecture:** One additive migration (7 tables, task/project link columns, `switch_path`, read-only guards for retired paths, view columns). A new `features/direction` module (pure domain rules, Zod, service, queries, actions, components). `scheduler` and `projects` services call `resolveDirectionLink`; `direction` imports neither. Breadcrumb data comes from the existing task select through named composite FKs.

**Tech Stack:** Next.js 16 RSC + server actions, Supabase (RLS, remote only, MCP workflow), Zod 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-direction-layer-g1-design.md` (umbrella: `2026-09-30-direction-layer-architecture.md`)

## Global Constraints
- Additive only: new columns are nullable, no backfill, no contract step. Never edit an applied migration.
- Every new table: `user_id … references public.profiles(id) on delete cascade`, `unique (id, user_id)`, RLS select/insert/update/delete on `user_id = (select auth.uid())`, `anon` revoked.
- One active purpose per user; one active path per mission (partial unique indexes). Retired paths and their protocols are read-only (`23514`), except archiving a protocol.
- Effective mission = `task.mission_id ?? project.mission_id`; a protocol implies its mission. Task mission ≠ project mission → `VALIDATION_ERROR`.
- New links only to `active` missions / `active` protocols on an `active` path; existing links stay when those close.
- Growth/Maintenance is derived, never stored. No XP, no `evaluateProgress` in G1.
- Code and DB names: `purpose`, `identity`, `mission`, `path`, `protocol`. UI strings go through `termsFor()` / `useTerms()`.
- Limits: statement 1–280; identity name 1–40, description ≤ 280; mission title 1–120, outcome ≤ 500, identities ≤ 6; criterion label 1–120, unit ≤ 12; path title 1–80, approach 1–1000, trade-offs ≤ 1000; protocol title 1–80, steps ≤ 12 × 1–120, intended minutes 5–600.
- Statuses always shown with text, never color alone. Radius ≤ 8px, flat and dense.
- E2E data uses the `[e2e]` prefix. Stage explicit paths only (`git add <files>`), never `git add -A`.

## Review Focus
1. The owner already has a real purpose and E2E sets an `[e2e]` one → after cleanup the real purpose is active again. Test: Task 7 cleanup + E2E assertion.
2. A task linked to a protocol whose path was later retired is edited (title only) and saved → the save succeeds and the link stays (existing link, not a new one). Test: Task 2 `isNewLink`, Task 4 service rule, Task 7 E2E (save after switch).
3. A task gets a protocol of mission A and a project linked to mission B → rejected with a clear message, nothing written. Test: Task 2 `missionConflict`; Task 1 SQL (protocol/mission mismatch FK).
4. A project is relinked to mission B while one of its tasks points directly to mission A → rejected with the count. Test: Task 2 `countProjectConflicts`.
5. `switch_path` called on a mission of another user or a closed mission → `P0002`, nothing changes. Test: Task 1 SQL.

---

### Task 1: Database

**Files:**
- Create: `supabase/migrations/<ts>_direction_layer.sql`, `supabase/tests/rls/direction_layer.sql`
- Modify: `src/types/database.ts` (regenerated)

**Interfaces:**
- Produces: tables `purposes`, `identities`, `missions`, `mission_identities`, `mission_criteria`, `paths`, `protocols`; columns `tasks.mission_id`, `tasks.protocol_id`, `projects.mission_id`; FK names `tasks_mission_id_user_id_fkey`, `tasks_protocol_id_mission_id_fkey`, `projects_mission_id_user_id_fkey`, `protocols_path_id_mission_id_fkey`, `paths_mission_id_user_id_fkey`; view columns `task_plan_actual.mission_id, protocol_id, effective_mission_id`; RPC `switch_path(p_mission_id uuid, p_title text, p_approach text, p_trade_offs text default null) returns paths`.

- [ ] **Step 1: Write the SQL test** `supabase/tests/rls/direction_layer.sql`

```sql
-- G1: direction layer RLS, cross-user FKs, one active purpose/path, switch_path, retired guards, view.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.missions (id, user_id, title) values
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-00000000000b', 'B mission');
insert into public.identities (id, user_id, name) values
  ('00000000-0000-4000-b000-0000000000b2', '00000000-0000-4000-a000-00000000000b', 'B identity');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare
  a constant uuid := '00000000-0000-4000-a000-00000000000a';
  m uuid; m2 uuid; ident uuid; pr uuid; t uuid; t2 uuid; prj uuid;
  p1 public.paths; p2 public.paths;
begin
  assert (select count(*) from public.missions) = 0, 'A cannot see B mission';
  assert (select count(*) from public.identities) = 0, 'A cannot see B identity';

  -- purposes: one active
  insert into public.purposes (user_id, statement) values (a, 'Live free');
  begin
    insert into public.purposes (user_id, statement) values (a, 'Second');
    raise exception 'FAIL: two active purposes';
  exception when unique_violation then null; end;

  -- RLS on insert
  begin
    insert into public.missions (user_id, title) values ('00000000-0000-4000-a000-00000000000b', 'spoof');
    raise exception 'FAIL: inserted for B';
  exception when insufficient_privilege then null; end;

  insert into public.missions (user_id, title) values (a, 'Speak English') returning id into m;
  insert into public.missions (user_id, title) values (a, 'Ship MVP') returning id into m2;
  insert into public.identities (user_id, name) values (a, 'English Speaker') returning id into ident;
  insert into public.mission_identities (user_id, mission_id, identity_id) values (a, m, ident);

  -- cross-user FKs
  begin
    insert into public.mission_identities (user_id, mission_id, identity_id)
    values (a, m, '00000000-0000-4000-b000-0000000000b2');
    raise exception 'FAIL: linked B identity';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.tasks (user_id, title, mission_id) values (a, 'x', '00000000-0000-4000-b000-0000000000b1');
    raise exception 'FAIL: task on B mission';
  exception when foreign_key_violation then null; end;

  -- closed_at check
  begin
    update public.missions set status = 'achieved' where id = m2;
    raise exception 'FAIL: achieved without closed_at';
  exception when check_violation then null; end;

  -- criteria kind check
  begin
    insert into public.mission_criteria (user_id, mission_id, label, kind) values (a, m, 'n', 'numeric');
    raise exception 'FAIL: numeric without target';
  exception when check_violation then null; end;

  -- first path through switch_path, one active path only
  p1 := public.switch_path(m, 'Input first', 'Listen a lot');
  assert p1.status = 'active', 'first path active';
  begin
    insert into public.paths (user_id, mission_id, title, approach) values (a, m, 'dup', 'dup');
    raise exception 'FAIL: two active paths';
  exception when unique_violation then null; end;
  insert into public.protocols (user_id, path_id, mission_id, title, intended_minutes)
  values (a, p1.id, m, 'Shadowing', 20) returning id into pr;

  -- task links: protocol implies the same mission; protocol needs a mission
  begin
    insert into public.tasks (user_id, title, mission_id, protocol_id) values (a, 'x', m2, pr);
    raise exception 'FAIL: protocol of another mission';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.tasks (user_id, title, protocol_id) values (a, 'x', pr);
    raise exception 'FAIL: protocol without mission';
  exception when check_violation then null; end;
  insert into public.tasks (user_id, title, mission_id, protocol_id) values (a, 'linked', m, pr) returning id into t;

  -- project-derived effective mission
  insert into public.projects (user_id, name, mission_id) values (a, 'MVP', m2) returning id into prj;
  insert into public.tasks (user_id, title, project_id) values (a, 'via project', prj) returning id into t2;
  assert (select effective_mission_id from public.task_plan_actual where task_id = t2) = m2, 'effective from project';
  assert (select effective_mission_id from public.task_plan_actual where task_id = t) = m, 'effective from task';

  -- switch: old retired, its protocols archived, one active
  p2 := public.switch_path(m, 'Output first', 'Speak daily', 'Grammar drills');
  assert (select status from public.paths where id = p1.id) = 'retired', 'old path retired';
  assert (select retired_at from public.paths where id = p1.id) is not null, 'retired_at set';
  assert (select status from public.protocols where id = pr) = 'archived', 'old protocol archived';
  assert (select count(*) from public.paths where mission_id = m and status = 'active') = 1, 'one active path';
  assert (select protocol_id from public.tasks where id = t) = pr, 'task keeps its protocol';

  -- retired guards
  begin
    update public.paths set title = 'edit' where id = p1.id;
    raise exception 'FAIL: edited retired path';
  exception when check_violation then null; end;
  begin
    insert into public.protocols (user_id, path_id, mission_id, title) values (a, p1.id, m, 'late');
    raise exception 'FAIL: protocol on retired path';
  exception when check_violation then null; end;
  begin
    update public.protocols set title = 'edit' where id = pr;
    raise exception 'FAIL: edited protocol of retired path';
  exception when check_violation then null; end;

  -- switch_path on B's mission / a closed mission
  begin
    perform public.switch_path('00000000-0000-4000-b000-0000000000b1', 't', 'a');
    raise exception 'FAIL: switched B path';
  exception when no_data_found then null; end;
  update public.missions set status = 'dropped', closed_at = now() where id = m2;
  begin
    perform public.switch_path(m2, 't', 'a');
    raise exception 'FAIL: switched closed mission';
  exception when no_data_found then null; end;
end $$;
rollback;
```

- [ ] **Step 2: Run it before the migration**

Run the file's contents with the Supabase MCP `execute_sql`.
Expected: FAIL with `relation "public.missions" does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/<ts>_direction_layer.sql` (use a placeholder timestamp now; Step 5 renames it)

```sql
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
```

Before applying, confirm no later migration redefined `task_plan_actual`: `grep -ln "task_plan_actual" supabase/migrations/*.sql` must list `20260930042046_focus_pauses.sql` as the newest definition. If a newer one exists, copy that definition instead and append the three columns.

- [ ] **Step 4: Apply and match histories**

MCP `apply_migration` with name `direction_layer` and the file contents. Then MCP `list_migrations`, and rename the local file to `<remote version>_direction_layer.sql`.

- [ ] **Step 5: Run the SQL test**

MCP `execute_sql` with `supabase/tests/rls/direction_layer.sql`.
Expected: success (no `FAIL:` exception, ends with rollback). Also re-run `supabase/tests/rls/scheduler_core.sql` and `work_sessions.sql` (the view changed). Expected: success.

- [ ] **Step 6: Regenerate types and check advisors**

MCP `generate_typescript_types` → overwrite `src/types/database.ts`. MCP `get_advisors` (security): no new warnings for the new tables/functions (legacy warnings listed in `docs/progress.md` are known).
Run: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_direction_layer.sql supabase/tests/rls/direction_layer.sql src/types/database.ts
git commit -m "G1: direction layer tables, task/project links, switch_path (SQL tests)"
```

---

### Task 2: Pure domain (types, breadcrumb, link rules, terms)

**Files:**
- Create: `src/features/direction/domain/direction.types.ts`, `src/features/direction/domain/breadcrumb.ts`, `src/features/direction/domain/link-rules.ts`
- Modify: `src/lib/terms.ts`, `tests/unit/terms.test.ts`
- Test: `tests/unit/direction-breadcrumb.test.ts`, `tests/unit/direction-links.test.ts`

**Interfaces:**
- Consumes: `Tables<…>` from Task 1 types.
- Produces:
  - `MISSION_STATUSES`, `PATH_STATUSES`, `ARCHIVABLE_STATUSES`, `CRITERION_KINDS`, `MISSION_STATUS_LABEL`
  - types `Purpose`, `Identity`, `Mission`, `MissionCriterion`, `Path`, `Protocol`, `DirectionRef`, `MissionOption`, `MissionSummary`, `DirectiveView`, `MissionDetail`
  - `buildBreadcrumb(t: BreadcrumbInput): Breadcrumb`, `effectiveMissionId(t: BreadcrumbInput): string | null`
  - `missionConflict(taskMissionId, projectMissionId): boolean`, `countProjectConflicts(newMissionId, taskMissionIds): number`, `isNewLink(next, current): boolean`
  - `Terms` gains `directive, directiveNav, identity, className, mission, path, protocol, growth, maintenance`

- [ ] **Step 1: Write the failing tests**

`tests/unit/direction-breadcrumb.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildBreadcrumb, effectiveMissionId } from "@/features/direction/domain/breadcrumb";

const mission = { id: "m1", title: "Launch MVP", status: "active" };
const path = { id: "p1", title: "MVP-First", status: "active" };

describe("buildBreadcrumb", () => {
  it("follows protocol → path → mission", () => {
    const b = buildBreadcrumb({ mission, protocol: { id: "pr1", title: "Calendar Foundation", path } });
    expect(b).toEqual({
      kind: "growth",
      crumbs: [
        { kind: "mission", id: "m1", label: "Launch MVP", note: null },
        { kind: "path", id: "p1", label: "MVP-First", note: null },
        { kind: "protocol", id: "pr1", label: "Calendar Foundation", note: null },
      ],
    });
  });

  it("uses a direct mission without protocol, adding the project when present", () => {
    const b = buildBreadcrumb({ mission, project: { id: "j1", name: "Scheduler", mission: null } });
    expect(b.kind === "growth" && b.crumbs.map((c) => c.kind)).toEqual(["mission", "project"]);
  });

  it("derives the mission from the project", () => {
    const b = buildBreadcrumb({ mission: null, project: { id: "j1", name: "Scheduler", mission } });
    expect(b.kind === "growth" && b.crumbs.map((c) => c.label)).toEqual(["Launch MVP", "Scheduler"]);
  });

  it("notes closed missions and retired paths", () => {
    const b = buildBreadcrumb({
      mission: { ...mission, status: "dropped" },
      protocol: { id: "pr1", title: "Shadowing", path: { ...path, status: "retired" } },
    });
    expect(b.kind === "growth" && b.crumbs.map((c) => c.note)).toEqual(["DROPPED", "RETIRED", null]);
  });

  it("is maintenance without any mission", () => {
    expect(buildBreadcrumb({})).toEqual({ kind: "maintenance" });
    expect(buildBreadcrumb({ project: { id: "j1", name: "Chores", mission: null } })).toEqual({ kind: "maintenance" });
  });
});

describe("effectiveMissionId", () => {
  it("prefers the task's own mission", () => {
    expect(effectiveMissionId({ mission, project: { id: "j", name: "x", mission: { ...mission, id: "m2" } } })).toBe("m1");
    expect(effectiveMissionId({ project: { id: "j", name: "x", mission } })).toBe("m1");
    expect(effectiveMissionId({})).toBeNull();
  });
});
```

`tests/unit/direction-links.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { countProjectConflicts, isNewLink, missionConflict } from "@/features/direction/domain/link-rules";

describe("missionConflict", () => {
  it("conflicts only when both are set and differ", () => {
    expect(missionConflict("a", "b")).toBe(true);
    expect(missionConflict("a", "a")).toBe(false);
    expect(missionConflict("a", null)).toBe(false);
    expect(missionConflict(null, "b")).toBe(false);
  });
});

describe("countProjectConflicts", () => {
  it("counts tasks whose explicit mission differs from the new one", () => {
    expect(countProjectConflicts("a", ["a", null, "b", "c"])).toBe(2);
    expect(countProjectConflicts(null, ["a", "b"])).toBe(0); // clearing is always allowed
  });
});

describe("isNewLink", () => {
  it("is true only for a different non-null id", () => {
    expect(isNewLink("a", null)).toBe(true);
    expect(isNewLink("a", "b")).toBe(true);
    expect(isNewLink("a", "a")).toBe(false); // keeping a link to a closed mission is fine
    expect(isNewLink(null, "a")).toBe(false);
    expect(isNewLink(undefined, undefined)).toBe(false);
  });
});
```

In `tests/unit/terms.test.ts`, replace the two `toEqual` lines in "switches the nouns" with:
```ts
    expect(PLAIN_TERMS).toMatchObject({ task: "할 일", project: "프로젝트", mission: "목표", path: "전략", protocol: "실행 방식" });
    expect(QUEST_TERMS).toMatchObject({ task: "퀘스트", project: "메인 퀘스트", directive: "SYSTEM DIRECTIVE", mission: "MISSION" });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/direction-breadcrumb.test.ts tests/unit/direction-links.test.ts tests/unit/terms.test.ts`
Expected: FAIL (modules not found; terms missing keys).

- [ ] **Step 3: Implement**

`src/features/direction/domain/direction.types.ts`:
```ts
import type { Tables } from "@/types/database";

export const MISSION_STATUSES = ["active", "achieved", "dropped"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];
export const PATH_STATUSES = ["active", "retired"] as const;
export type PathStatus = (typeof PATH_STATUSES)[number];
export const ARCHIVABLE_STATUSES = ["active", "archived"] as const;
export type ArchivableStatus = (typeof ARCHIVABLE_STATUSES)[number];
export const CRITERION_KINDS = ["check", "numeric"] as const;
export type CriterionKind = (typeof CRITERION_KINDS)[number];

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  active: "진행 중",
  achieved: "달성",
  dropped: "중단",
};

export type Purpose = Omit<Tables<"purposes">, "status"> & { status: ArchivableStatus };
export type Identity = Omit<Tables<"identities">, "status"> & { status: ArchivableStatus };
export type Mission = Omit<Tables<"missions">, "status"> & { status: MissionStatus };
export type MissionCriterion = Omit<Tables<"mission_criteria">, "kind"> & { kind: CriterionKind };
export type Path = Omit<Tables<"paths">, "status"> & { status: PathStatus };
export type Protocol = Omit<Tables<"protocols">, "status"> & { status: ArchivableStatus };

/** Embedded mission/path shape on tasks and projects (TASK_SELECT). */
export type DirectionRef = { id: string; title: string; status: string };

/** Picker option: an active mission with the active protocols of its active path. */
export type MissionOption = { id: string; title: string; protocols: { id: string; title: string }[] };

export type MissionSummary = Mission & { identityIds: string[]; criteriaMet: number; criteriaTotal: number };

export type DirectiveView = { purpose: Purpose | null; identities: Identity[]; missions: MissionSummary[] };

export type MissionDetail = {
  mission: Mission & { identityIds: string[] };
  criteria: MissionCriterion[];
  activePath: Path | null;
  retiredPaths: Path[];
  protocols: Protocol[];
  projects: { id: string; name: string; status: string }[];
};
```

`src/features/direction/domain/breadcrumb.ts`:
```ts
import type { DirectionRef } from "./direction.types";

export type BreadcrumbInput = {
  mission?: DirectionRef | null;
  protocol?: { id: string; title: string; path: DirectionRef | null } | null;
  project?: { id: string; name: string; mission?: DirectionRef | null } | null;
};

export type Crumb = { kind: "mission" | "path" | "protocol" | "project"; id: string; label: string; note: string | null };
export type Breadcrumb = { kind: "growth"; crumbs: Crumb[] } | { kind: "maintenance" };

const NOTE: Record<string, string> = { achieved: "ACHIEVED", dropped: "DROPPED", retired: "RETIRED" };
const note = (status: string) => NOTE[status] ?? null;

/** Effective mission (ADR 0020): the task's own (or its protocol's) mission, else its project's. */
export function effectiveMissionId(t: BreadcrumbInput): string | null {
  return t.mission?.id ?? t.project?.mission?.id ?? null;
}

/** "Why am I doing this?" — Mission › Path › Protocol, or Mission › Project; no mission = maintenance. */
export function buildBreadcrumb(t: BreadcrumbInput): Breadcrumb {
  const mission = t.mission ?? t.project?.mission ?? null;
  if (!mission) return { kind: "maintenance" };
  const crumbs: Crumb[] = [{ kind: "mission", id: mission.id, label: mission.title, note: note(mission.status) }];
  if (t.protocol) {
    const path = t.protocol.path;
    if (path) crumbs.push({ kind: "path", id: path.id, label: path.title, note: note(path.status) });
    crumbs.push({ kind: "protocol", id: t.protocol.id, label: t.protocol.title, note: null });
  } else if (t.project) {
    crumbs.push({ kind: "project", id: t.project.id, label: t.project.name, note: null });
  }
  return { kind: "growth", crumbs };
}
```

`src/features/direction/domain/link-rules.ts`:
```ts
/** Task ↔ project mission agreement (ADR 0020). Unset on either side never conflicts. */
export function missionConflict(taskMissionId: string | null, projectMissionId: string | null): boolean {
  return taskMissionId !== null && projectMissionId !== null && taskMissionId !== projectMissionId;
}

/** Tasks of a project whose explicit mission would disagree with the project's new mission. */
export function countProjectConflicts(newMissionId: string | null, taskMissionIds: (string | null)[]): number {
  if (newMissionId === null) return 0;
  return taskMissionIds.filter((m) => m !== null && m !== newMissionId).length;
}

/** A link is new when it points somewhere other than the current one; only new links must be active. */
export function isNewLink(next: string | null | undefined, current: string | null | undefined): boolean {
  return !!next && next !== (current ?? null);
}
```

`src/lib/terms.ts` (replace the first four lines):
```ts
/** Quest terminology (E2 spec §4, G umbrella §2): a label layer only. Code and DB use domain names. */
export type Terms = {
  task: string;
  project: string;
  directive: string;
  directiveNav: string;
  identity: string;
  className: string;
  mission: string;
  path: string;
  protocol: string;
  growth: string;
  maintenance: string;
};
export const PLAIN_TERMS: Terms = {
  task: "할 일",
  project: "프로젝트",
  directive: "목적",
  directiveNav: "방향",
  identity: "정체성",
  className: "대표 정체성",
  mission: "목표",
  path: "전략",
  protocol: "실행 방식",
  growth: "성장",
  maintenance: "유지",
};
export const QUEST_TERMS: Terms = {
  task: "퀘스트",
  project: "메인 퀘스트",
  directive: "SYSTEM DIRECTIVE",
  directiveNav: "DIRECTIVE",
  identity: "IDENTITY",
  className: "CLASS",
  mission: "MISSION",
  path: "PATH",
  protocol: "PROTOCOL",
  growth: "GROWTH",
  maintenance: "MAINTENANCE",
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/direction-breadcrumb.test.ts tests/unit/direction-links.test.ts tests/unit/terms.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/direction/domain src/lib/terms.ts tests/unit/terms.test.ts tests/unit/direction-breadcrumb.test.ts tests/unit/direction-links.test.ts
git commit -m "G1: direction domain types, breadcrumb, link rules, terms"
```

---

### Task 3: Direction schemas, service, queries, actions

**Files:**
- Create: `src/features/direction/schemas/direction.schema.ts`, `src/features/direction/services/direction.service.ts`, `src/features/direction/queries/direction.queries.ts`, `src/features/direction/actions/direction.actions.ts`
- Test: `tests/unit/direction-schema.test.ts`

**Interfaces:**
- Consumes: Task 2 types and `isNewLink`; `ActionContext`, `runAction` (`src/lib/action.ts`); `AppError`, `fromDbError` (`src/lib/errors.ts`); `isLocalDateString`.
- Produces:
  - Schemas (and inferred `…Input` types): `setPurposeSchema`, `createIdentitySchema`, `updateIdentitySchema`, `createMissionSchema`, `updateMissionSchema`, `upsertCriterionSchema`, `criterionIdSchema`, `setCriterionProgressSchema`, `switchPathSchema`, `updatePathSchema`, `createProtocolSchema`, `updateProtocolSchema`
  - `resolveDirectionLink(ctx, input: { missionId?: string | null; protocolId?: string | null }, current?: { mission_id: string | null; protocol_id: string | null }): Promise<{ mission_id: string | null; protocol_id: string | null }>`
  - Queries: `loadDirective(supabase, userId): Promise<DirectiveView>`, `getMissionDetail(supabase, userId, missionId): Promise<MissionDetail | null>`, `listMissionOptions(supabase, userId): Promise<MissionOption[]>`, `getMissionRef(supabase, userId, missionId): Promise<DirectionRef | null>`
  - Actions: `setPurposeAction`, `createIdentityAction`, `updateIdentityAction`, `createMissionAction` (returns `Mission`), `updateMissionAction`, `upsertCriterionAction`, `deleteCriterionAction`, `setCriterionProgressAction`, `switchPathAction`, `updatePathAction`, `createProtocolAction`, `updateProtocolAction`

- [ ] **Step 1: Write the failing schema test** `tests/unit/direction-schema.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  createProtocolSchema,
  setCriterionProgressSchema,
  setPurposeSchema,
  upsertCriterionSchema,
} from "@/features/direction/schemas/direction.schema";

const uuid = "00000000-0000-4000-a000-000000000001";

describe("direction schemas", () => {
  it("trims and bounds the directive", () => {
    expect(setPurposeSchema.parse({ statement: "  Live free  " }).statement).toBe("Live free");
    expect(setPurposeSchema.safeParse({ statement: "   " }).success).toBe(false);
    expect(setPurposeSchema.safeParse({ statement: "x".repeat(281) }).success).toBe(false);
  });

  it("needs a target for numeric criteria and none for checks", () => {
    const base = { missionId: uuid, label: "Mock interviews", unit: null };
    expect(upsertCriterionSchema.safeParse({ ...base, kind: "numeric", targetValue: 3 }).success).toBe(true);
    expect(upsertCriterionSchema.safeParse({ ...base, kind: "numeric", targetValue: null }).success).toBe(false);
    expect(upsertCriterionSchema.safeParse({ ...base, kind: "check", targetValue: 3 }).success).toBe(false);
  });

  it("sets exactly one of met / currentValue", () => {
    expect(setCriterionProgressSchema.safeParse({ criterionId: uuid, met: true }).success).toBe(true);
    expect(setCriterionProgressSchema.safeParse({ criterionId: uuid, currentValue: 2 }).success).toBe(true);
    expect(setCriterionProgressSchema.safeParse({ criterionId: uuid }).success).toBe(false);
    expect(setCriterionProgressSchema.safeParse({ criterionId: uuid, met: true, currentValue: 2 }).success).toBe(false);
  });

  it("drops blank protocol steps and caps them at 12", () => {
    const ok = createProtocolSchema.parse({ pathId: uuid, title: "Shadowing", steps: ["Listen", " ", "Repeat"], intendedMinutes: 20 });
    expect(ok.steps).toEqual(["Listen", "Repeat"]);
    expect(createProtocolSchema.safeParse({ pathId: uuid, title: "x", steps: Array(13).fill("s"), intendedMinutes: null }).success).toBe(false);
    expect(createProtocolSchema.safeParse({ pathId: uuid, title: "x", steps: [], intendedMinutes: 4 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/direction-schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Schemas** `src/features/direction/schemas/direction.schema.ts`

```ts
import { z } from "zod";
import { isLocalDateString } from "@/features/scheduler/utils/timezone";
import { ARCHIVABLE_STATUSES, CRITERION_KINDS, MISSION_STATUSES } from "../domain/direction.types";

const localDate = z.string().refine(isLocalDateString, "날짜 형식이 올바르지 않습니다.");
const required = (max: number, message = "내용을 입력해 주세요.") => z.string().trim().min(1, message).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));
const sortOrder = z.coerce.number().int().min(0).max(10_000);

export const setPurposeSchema = z.object({ statement: required(280, "문장을 입력해 주세요.") });
export type SetPurposeInput = z.infer<typeof setPurposeSchema>;

export const createIdentitySchema = z.object({ name: required(40, "이름을 입력해 주세요."), description: optionalText(280) });
export type CreateIdentityInput = z.infer<typeof createIdentitySchema>;
export const updateIdentitySchema = createIdentitySchema.extend({
  identityId: z.uuid(),
  status: z.enum(ARCHIVABLE_STATUSES),
  sortOrder,
});
export type UpdateIdentityInput = z.infer<typeof updateIdentitySchema>;

export const createMissionSchema = z.object({
  title: required(120, "이름을 입력해 주세요."),
  outcome: optionalText(500),
  deadline: localDate.nullable().optional(),
  identityIds: z.array(z.uuid()).max(6).default([]),
});
export type CreateMissionInput = z.infer<typeof createMissionSchema>;
export const updateMissionSchema = z.object({
  missionId: z.uuid(),
  title: required(120, "이름을 입력해 주세요."),
  outcome: optionalText(500),
  deadline: localDate.nullable(),
  identityIds: z.array(z.uuid()).max(6),
  status: z.enum(MISSION_STATUSES),
});
export type UpdateMissionInput = z.infer<typeof updateMissionSchema>;

export const upsertCriterionSchema = z
  .object({
    missionId: z.uuid(),
    criterionId: z.uuid().optional(),
    label: required(120),
    kind: z.enum(CRITERION_KINDS),
    targetValue: z.coerce.number().positive().max(1e9).nullable(),
    unit: optionalText(12),
  })
  .refine((v) => (v.kind === "check" ? v.targetValue === null : v.targetValue !== null), {
    message: "숫자 기준에는 목표값이 필요합니다.",
    path: ["targetValue"],
  });
export type UpsertCriterionInput = z.infer<typeof upsertCriterionSchema>;
export const criterionIdSchema = z.object({ criterionId: z.uuid() });
export const setCriterionProgressSchema = z
  .object({
    criterionId: z.uuid(),
    met: z.boolean().optional(),
    currentValue: z.coerce.number().min(0).max(1e9).optional(),
  })
  .refine((v) => (v.met === undefined) !== (v.currentValue === undefined), { message: "하나만 지정해 주세요." });
export type SetCriterionProgressInput = z.infer<typeof setCriterionProgressSchema>;

export const switchPathSchema = z.object({
  missionId: z.uuid(),
  title: required(80, "이름을 입력해 주세요."),
  approach: required(1000, "접근 방식을 입력해 주세요."),
  tradeOffs: optionalText(1000),
});
export type SwitchPathInput = z.infer<typeof switchPathSchema>;
export const updatePathSchema = z.object({
  pathId: z.uuid(),
  title: required(80, "이름을 입력해 주세요."),
  approach: required(1000, "접근 방식을 입력해 주세요."),
  tradeOffs: optionalText(1000),
});
export type UpdatePathInput = z.infer<typeof updatePathSchema>;

const steps = z
  .array(z.string().trim().max(120))
  .transform((xs) => xs.filter((x) => x.length > 0))
  .pipe(z.array(z.string()).max(12, "단계는 12개까지입니다."));
export const createProtocolSchema = z.object({
  pathId: z.uuid(),
  title: required(80, "이름을 입력해 주세요."),
  steps,
  intendedMinutes: z.coerce.number().int().min(5).max(600).nullable(),
});
export type CreateProtocolInput = z.infer<typeof createProtocolSchema>;
export const updateProtocolSchema = z.object({
  protocolId: z.uuid(),
  title: required(80, "이름을 입력해 주세요."),
  steps,
  intendedMinutes: z.coerce.number().int().min(5).max(600).nullable(),
  status: z.enum(ARCHIVABLE_STATUSES),
  sortOrder,
});
export type UpdateProtocolInput = z.infer<typeof updateProtocolSchema>;
```

- [ ] **Step 4: Run the schema test** — `npx vitest run tests/unit/direction-schema.test.ts` → PASS.

- [ ] **Step 5: Service** `src/features/direction/services/direction.service.ts`

```ts
import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { isNewLink } from "../domain/link-rules";
import type { Identity, Mission, MissionCriterion, Path, Protocol, Purpose } from "../domain/direction.types";
import type {
  CreateIdentityInput,
  CreateMissionInput,
  CreateProtocolInput,
  SetCriterionProgressInput,
  SetPurposeInput,
  SwitchPathInput,
  UpdateIdentityInput,
  UpdateMissionInput,
  UpdatePathInput,
  UpdateProtocolInput,
  UpsertCriterionInput,
} from "../schemas/direction.schema";

const retiredError = (code?: string) =>
  code === "23514" ? new AppError("VALIDATION_ERROR", "교체된 전략은 수정할 수 없습니다.") : null;

/** Archive the active purpose, then insert the new one. A concurrent call fails on the partial unique index. */
export async function setPurpose(ctx: ActionContext, input: SetPurposeInput): Promise<Purpose> {
  const archived = await ctx.supabase
    .from("purposes")
    .update({ status: "archived" })
    .eq("user_id", ctx.user.id)
    .eq("status", "active");
  if (archived.error) throw fromDbError(archived.error);
  const { data, error } = await ctx.supabase
    .from("purposes")
    .insert({ user_id: ctx.user.id, statement: input.statement })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as Purpose;
}

export async function createIdentity(ctx: ActionContext, input: CreateIdentityInput): Promise<Identity> {
  const { count } = await ctx.supabase.from("identities").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id);
  const { data, error } = await ctx.supabase
    .from("identities")
    .insert({ user_id: ctx.user.id, name: input.name, description: input.description, sort_order: count ?? 0 })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as Identity;
}

export async function updateIdentity(ctx: ActionContext, input: UpdateIdentityInput): Promise<Identity> {
  const { data, error } = await ctx.supabase
    .from("identities")
    .update({ name: input.name, description: input.description, status: input.status, sort_order: input.sortOrder })
    .eq("id", input.identityId)
    .eq("user_id", ctx.user.id)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as Identity;
}

/** Replace a mission's identity links. The composite FKs reject other users' identities. */
async function setMissionIdentities(ctx: ActionContext, missionId: string, identityIds: string[]) {
  const del = await ctx.supabase.from("mission_identities").delete().eq("mission_id", missionId).eq("user_id", ctx.user.id);
  if (del.error) throw fromDbError(del.error);
  if (identityIds.length === 0) return;
  const ins = await ctx.supabase
    .from("mission_identities")
    .insert([...new Set(identityIds)].map((identity_id) => ({ user_id: ctx.user.id, mission_id: missionId, identity_id })));
  if (ins.error) throw fromDbError(ins.error);
}

export async function createMission(ctx: ActionContext, input: CreateMissionInput): Promise<Mission> {
  const purpose = await ctx.supabase
    .from("purposes")
    .select("id")
    .eq("user_id", ctx.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (purpose.error) throw fromDbError(purpose.error);
  const { data, error } = await ctx.supabase
    .from("missions")
    .insert({
      user_id: ctx.user.id,
      purpose_id: purpose.data?.id ?? null,
      title: input.title,
      outcome: input.outcome,
      deadline: input.deadline ?? null,
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  await setMissionIdentities(ctx, data.id, input.identityIds);
  return data as Mission;
}

export async function updateMission(ctx: ActionContext, input: UpdateMissionInput): Promise<Mission> {
  const before = await ctx.supabase
    .from("missions")
    .select("status, closed_at")
    .eq("id", input.missionId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (before.error) throw fromDbError(before.error);
  if (!before.data) throw new AppError("NOT_FOUND");
  const closedAt =
    input.status === "active" ? null : before.data.status === input.status ? before.data.closed_at : new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("missions")
    .update({ title: input.title, outcome: input.outcome, deadline: input.deadline, status: input.status, closed_at: closedAt })
    .eq("id", input.missionId)
    .eq("user_id", ctx.user.id)
    .select()
    .single();
  if (error) throw fromDbError(error);
  await setMissionIdentities(ctx, input.missionId, input.identityIds);
  return data as Mission;
}

export async function upsertCriterion(ctx: ActionContext, input: UpsertCriterionInput): Promise<MissionCriterion> {
  const row = {
    user_id: ctx.user.id,
    mission_id: input.missionId,
    label: input.label,
    kind: input.kind,
    target_value: input.targetValue,
    unit: input.unit,
  };
  const query = input.criterionId
    ? ctx.supabase.from("mission_criteria").update(row).eq("id", input.criterionId).eq("user_id", ctx.user.id)
    : ctx.supabase.from("mission_criteria").insert(row);
  // A foreign mission id fails the composite FK (23503 → NOT_FOUND).
  const { data, error } = await query.select().maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as MissionCriterion;
}

export async function deleteCriterion(ctx: ActionContext, criterionId: string): Promise<void> {
  const { error } = await ctx.supabase.from("mission_criteria").delete().eq("id", criterionId).eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}

/** Check criteria toggle met_at; numeric criteria are met once current ≥ target. */
export async function setCriterionProgress(ctx: ActionContext, input: SetCriterionProgressInput): Promise<MissionCriterion> {
  const current = await ctx.supabase
    .from("mission_criteria")
    .select("kind, target_value, met_at")
    .eq("id", input.criterionId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (current.error) throw fromDbError(current.error);
  if (!current.data) throw new AppError("NOT_FOUND");
  if (current.data.kind === "check" && input.met === undefined) throw new AppError("VALIDATION_ERROR");
  if (current.data.kind === "numeric" && input.currentValue === undefined) throw new AppError("VALIDATION_ERROR");
  const now = new Date().toISOString();
  const patch =
    current.data.kind === "check"
      ? { met_at: input.met ? (current.data.met_at ?? now) : null }
      : {
          current_value: input.currentValue!,
          met_at: input.currentValue! >= Number(current.data.target_value) ? (current.data.met_at ?? now) : null,
        };
  const { data, error } = await ctx.supabase
    .from("mission_criteria")
    .update(patch)
    .eq("id", input.criterionId)
    .eq("user_id", ctx.user.id)
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as MissionCriterion;
}

export async function switchPath(ctx: ActionContext, input: SwitchPathInput): Promise<Path> {
  const { data, error } = await ctx.supabase
    .rpc("switch_path", {
      p_mission_id: input.missionId,
      p_title: input.title,
      p_approach: input.approach,
      p_trade_offs: input.tradeOffs ?? undefined,
    })
    .single();
  if (error) {
    if (error.code === "P0002") throw new AppError("NOT_FOUND", "진행 중인 목표를 찾을 수 없습니다.");
    throw fromDbError(error);
  }
  return data as Path;
}

export async function updatePath(ctx: ActionContext, input: UpdatePathInput): Promise<Path> {
  const { data, error } = await ctx.supabase
    .from("paths")
    .update({ title: input.title, approach: input.approach, trade_offs: input.tradeOffs })
    .eq("id", input.pathId)
    .eq("user_id", ctx.user.id)
    .select()
    .maybeSingle();
  if (error) throw retiredError(error.code) ?? fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as Path;
}

export async function createProtocol(ctx: ActionContext, input: CreateProtocolInput): Promise<Protocol> {
  const path = await ctx.supabase
    .from("paths")
    .select("id, mission_id, status")
    .eq("id", input.pathId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (path.error) throw fromDbError(path.error);
  if (!path.data) throw new AppError("NOT_FOUND");
  if (path.data.status !== "active") throw new AppError("VALIDATION_ERROR", "교체된 전략은 수정할 수 없습니다.");
  const { count } = await ctx.supabase.from("protocols").select("id", { count: "exact", head: true }).eq("path_id", input.pathId);
  const { data, error } = await ctx.supabase
    .from("protocols")
    .insert({
      user_id: ctx.user.id,
      path_id: path.data.id,
      mission_id: path.data.mission_id,
      title: input.title,
      steps: input.steps,
      intended_minutes: input.intendedMinutes,
      sort_order: count ?? 0,
    })
    .select()
    .single();
  if (error) throw retiredError(error.code) ?? fromDbError(error);
  return data as Protocol;
}

export async function updateProtocol(ctx: ActionContext, input: UpdateProtocolInput): Promise<Protocol> {
  const { data, error } = await ctx.supabase
    .from("protocols")
    .update({
      title: input.title,
      steps: input.steps,
      intended_minutes: input.intendedMinutes,
      status: input.status,
      sort_order: input.sortOrder,
    })
    .eq("id", input.protocolId)
    .eq("user_id", ctx.user.id)
    .select()
    .maybeSingle();
  if (error) throw retiredError(error.code) ?? fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as Protocol;
}

/**
 * Resolve a task's mission/protocol link (ADR 0020). Both ids must belong to the caller; a protocol implies its
 * mission. New links need an active mission / an active protocol on an active path; unchanged links are kept.
 */
export async function resolveDirectionLink(
  ctx: ActionContext,
  input: { missionId?: string | null; protocolId?: string | null },
  current?: { mission_id: string | null; protocol_id: string | null },
): Promise<{ mission_id: string | null; protocol_id: string | null }> {
  if (input.protocolId) {
    const { data, error } = await ctx.supabase
      .from("protocols")
      .select("id, mission_id, status, path:paths!protocols_path_id_mission_id_fkey(status)")
      .eq("id", input.protocolId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError("NOT_FOUND", "실행 방식을 찾을 수 없습니다.");
    if (input.missionId && input.missionId !== data.mission_id) {
      throw new AppError("VALIDATION_ERROR", "실행 방식이 선택한 목표에 속하지 않습니다.");
    }
    if (isNewLink(input.protocolId, current?.protocol_id) && (data.status !== "active" || data.path?.status !== "active")) {
      throw new AppError("VALIDATION_ERROR", "보관되었거나 교체된 실행 방식에는 연결할 수 없습니다.");
    }
    return { mission_id: data.mission_id, protocol_id: data.id };
  }
  if (input.missionId) {
    const { data, error } = await ctx.supabase
      .from("missions")
      .select("id, status")
      .eq("id", input.missionId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError("NOT_FOUND", "목표를 찾을 수 없습니다.");
    if (isNewLink(input.missionId, current?.mission_id) && data.status !== "active") {
      throw new AppError("VALIDATION_ERROR", "종료된 목표에는 연결할 수 없습니다.");
    }
    return { mission_id: data.id, protocol_id: null };
  }
  return { mission_id: null, protocol_id: null };
}
```

- [ ] **Step 6: Queries** `src/features/direction/queries/direction.queries.ts`

```ts
import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type {
  DirectionRef,
  DirectiveView,
  Identity,
  Mission,
  MissionCriterion,
  MissionDetail,
  MissionOption,
  MissionSummary,
  Path,
  Protocol,
  Purpose,
} from "../domain/direction.types";

export async function loadDirective(supabase: SupabaseServerClient, userId: string): Promise<DirectiveView> {
  const [purpose, identities, missions, links, criteria] = await Promise.all([
    supabase.from("purposes").select("*").eq("user_id", userId).eq("status", "active").maybeSingle(),
    supabase.from("identities").select("*").eq("user_id", userId).order("sort_order").order("created_at"),
    supabase.from("missions").select("*").eq("user_id", userId).order("deadline", { nullsFirst: false }).order("created_at"),
    supabase.from("mission_identities").select("mission_id, identity_id").eq("user_id", userId),
    supabase.from("mission_criteria").select("mission_id, met_at").eq("user_id", userId),
  ]);
  for (const r of [purpose, identities, missions, links, criteria]) if (r.error) throw fromDbError(r.error);
  const summaries: MissionSummary[] = (missions.data as Mission[]).map((m) => {
    const own = criteria.data!.filter((c) => c.mission_id === m.id);
    return {
      ...m,
      identityIds: links.data!.filter((l) => l.mission_id === m.id).map((l) => l.identity_id),
      criteriaMet: own.filter((c) => c.met_at !== null).length,
      criteriaTotal: own.length,
    };
  });
  return {
    purpose: (purpose.data as Purpose | null) ?? null,
    identities: identities.data as Identity[],
    missions: summaries,
  };
}

export async function getMissionDetail(
  supabase: SupabaseServerClient,
  userId: string,
  missionId: string,
): Promise<MissionDetail | null> {
  const [mission, links, criteria, paths, protocols, projects] = await Promise.all([
    supabase.from("missions").select("*").eq("id", missionId).eq("user_id", userId).maybeSingle(),
    supabase.from("mission_identities").select("identity_id").eq("mission_id", missionId).eq("user_id", userId),
    supabase.from("mission_criteria").select("*").eq("mission_id", missionId).eq("user_id", userId).order("position").order("created_at"),
    supabase.from("paths").select("*").eq("mission_id", missionId).eq("user_id", userId).order("started_at", { ascending: false }),
    supabase.from("protocols").select("*").eq("mission_id", missionId).eq("user_id", userId).order("sort_order"),
    supabase.from("projects").select("id, name, status").eq("mission_id", missionId).eq("user_id", userId).order("name"),
  ]);
  for (const r of [mission, links, criteria, paths, protocols, projects]) if (r.error) throw fromDbError(r.error);
  if (!mission.data) return null;
  const allPaths = paths.data as Path[];
  const activePath = allPaths.find((p) => p.status === "active") ?? null;
  return {
    mission: { ...(mission.data as Mission), identityIds: links.data!.map((l) => l.identity_id) },
    criteria: criteria.data as MissionCriterion[],
    activePath,
    retiredPaths: allPaths.filter((p) => p.status === "retired"),
    protocols: (protocols.data as Protocol[]).filter((p) => p.path_id === activePath?.id && p.status === "active"),
    projects: projects.data!,
  };
}

/** Active missions with the active protocols of their active path (task drawer picker). */
export async function listMissionOptions(supabase: SupabaseServerClient, userId: string): Promise<MissionOption[]> {
  const [missions, protocols] = await Promise.all([
    supabase.from("missions").select("id, title").eq("user_id", userId).eq("status", "active").order("title"),
    supabase
      .from("protocols")
      .select("id, title, mission_id, sort_order, path:paths!protocols_path_id_mission_id_fkey(status)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("sort_order"),
  ]);
  if (missions.error) throw fromDbError(missions.error);
  if (protocols.error) throw fromDbError(protocols.error);
  return missions.data.map((m) => ({
    id: m.id,
    title: m.title,
    protocols: protocols.data
      .filter((p) => p.mission_id === m.id && p.path?.status === "active")
      .map((p) => ({ id: p.id, title: p.title })),
  }));
}

export async function getMissionRef(
  supabase: SupabaseServerClient,
  userId: string,
  missionId: string,
): Promise<DirectionRef | null> {
  const { data, error } = await supabase
    .from("missions")
    .select("id, title, status")
    .eq("id", missionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}
```

- [ ] **Step 7: Actions** `src/features/direction/actions/direction.actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as direction from "../services/direction.service";
import {
  createIdentitySchema,
  createMissionSchema,
  createProtocolSchema,
  criterionIdSchema,
  setCriterionProgressSchema,
  setPurposeSchema,
  switchPathSchema,
  updateIdentitySchema,
  updateMissionSchema,
  updatePathSchema,
  updateProtocolSchema,
  upsertCriterionSchema,
} from "../schemas/direction.schema";

// The directive page, the scheduler (task breadcrumbs) and projects all live under /scheduler.
const done = <T>(value: T) => {
  revalidatePath("/scheduler", "layout");
  return value;
};

export async function setPurposeAction(input: unknown) {
  return runAction("direction.purpose.set", setPurposeSchema, input, async (d, ctx) => done(await direction.setPurpose(ctx, d)));
}
export async function createIdentityAction(input: unknown) {
  return runAction("direction.identity.create", createIdentitySchema, input, async (d, ctx) => done(await direction.createIdentity(ctx, d)));
}
export async function updateIdentityAction(input: unknown) {
  return runAction("direction.identity.update", updateIdentitySchema, input, async (d, ctx) => done(await direction.updateIdentity(ctx, d)));
}
export async function createMissionAction(input: unknown) {
  return runAction("direction.mission.create", createMissionSchema, input, async (d, ctx) => done(await direction.createMission(ctx, d)));
}
export async function updateMissionAction(input: unknown) {
  return runAction("direction.mission.update", updateMissionSchema, input, async (d, ctx) => done(await direction.updateMission(ctx, d)));
}
export async function upsertCriterionAction(input: unknown) {
  return runAction("direction.criterion.upsert", upsertCriterionSchema, input, async (d, ctx) => done(await direction.upsertCriterion(ctx, d)));
}
export async function deleteCriterionAction(input: unknown) {
  return runAction("direction.criterion.delete", criterionIdSchema, input, async (d, ctx) =>
    done(await direction.deleteCriterion(ctx, d.criterionId)),
  );
}
export async function setCriterionProgressAction(input: unknown) {
  return runAction("direction.criterion.progress", setCriterionProgressSchema, input, async (d, ctx) =>
    done(await direction.setCriterionProgress(ctx, d)),
  );
}
export async function switchPathAction(input: unknown) {
  return runAction("direction.path.switch", switchPathSchema, input, async (d, ctx) => done(await direction.switchPath(ctx, d)));
}
export async function updatePathAction(input: unknown) {
  return runAction("direction.path.update", updatePathSchema, input, async (d, ctx) => done(await direction.updatePath(ctx, d)));
}
export async function createProtocolAction(input: unknown) {
  return runAction("direction.protocol.create", createProtocolSchema, input, async (d, ctx) => done(await direction.createProtocol(ctx, d)));
}
export async function updateProtocolAction(input: unknown) {
  return runAction("direction.protocol.update", updateProtocolSchema, input, async (d, ctx) => done(await direction.updateProtocol(ctx, d)));
}
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npx eslint src/features/direction tests/unit/direction-schema.test.ts && npx vitest run tests/unit/direction-schema.test.ts`
Expected: PASS. If supabase-js infers the embedded `path` as an array, the FK hint is wrong: check the FK name in `src/types/database.ts` (`Relationships`) and fix the hint, don't cast.

- [ ] **Step 9: Commit**

```bash
git add src/features/direction/schemas src/features/direction/services src/features/direction/queries src/features/direction/actions tests/unit/direction-schema.test.ts
git commit -m "G1: direction schemas, service, queries, actions"
```

---

### Task 4: Task and project links

**Files:**
- Modify: `src/features/scheduler/queries/select.ts`, `src/features/scheduler/domain/task.types.ts`, `src/features/scheduler/schemas/task.schema.ts`, `src/features/scheduler/services/task.service.ts`, `src/features/projects/schemas/project.schema.ts`, `src/features/projects/services/project.service.ts`

**Interfaces:**
- Consumes: `resolveDirectionLink` (Task 3), `missionConflict`, `countProjectConflicts` (Task 2), `DirectionRef`.
- Produces:
  - `Task` gains `mission_id`, `protocol_id` (from the row type), `mission?: DirectionRef | null`, `protocol?: { id: string; title: string; path: DirectionRef | null } | null`, and `project: { id: string; name: string; mission?: DirectionRef | null } | null`. `Task` is assignable to `BreadcrumbInput`.
  - `createTaskSchema` gains `missionId?: uuid | null`, `protocolId?: uuid | null`; `updateTaskSchema` gains required `missionId: uuid | null`, `protocolId: uuid | null`.
  - `updateProjectSchema` gains required `missionId: uuid | null`.
  - `getProjectMissionId(ctx, projectId: string | null): Promise<string | null>` (projects service).

- [ ] **Step 1: Selects** — in `src/features/scheduler/queries/select.ts`, replace both literals (each must stay a single literal so supabase-js infers the type):

```ts
export const TASK_SELECT =
  "*, template:task_templates!tasks_template_id_user_id_fkey(id, name, default_estimate_minutes), project:projects!tasks_project_id_user_id_fkey(id, name, mission:missions!projects_mission_id_user_id_fkey(id, title, status)), milestone:milestones!tasks_milestone_id_user_id_fkey(id, name), domain:practice_domains!tasks_practice_domain_id_user_id_fkey(id, name), mission:missions!tasks_mission_id_user_id_fkey(id, title, status), protocol:protocols!tasks_protocol_id_mission_id_fkey(id, title, path:paths!protocols_path_id_mission_id_fkey(id, title, status)), tags:task_tags!task_tags_task_id_user_id_fkey(tag:tags!task_tags_tag_id_user_id_fkey(id, name, color))";

export const BLOCK_SELECT =
  "*, task:tasks!schedule_blocks_task_id_user_id_fkey(*, template:task_templates!tasks_template_id_user_id_fkey(id, name, default_estimate_minutes), project:projects!tasks_project_id_user_id_fkey(id, name, mission:missions!projects_mission_id_user_id_fkey(id, title, status)), milestone:milestones!tasks_milestone_id_user_id_fkey(id, name), domain:practice_domains!tasks_practice_domain_id_user_id_fkey(id, name), mission:missions!tasks_mission_id_user_id_fkey(id, title, status), protocol:protocols!tasks_protocol_id_mission_id_fkey(id, title, path:paths!protocols_path_id_mission_id_fkey(id, title, status)), tags:task_tags!task_tags_task_id_user_id_fkey(tag:tags!task_tags_tag_id_user_id_fkey(id, name, color)))";
```

- [ ] **Step 2: Task type** — in `src/features/scheduler/domain/task.types.ts` add `import type { DirectionRef } from "@/features/direction/domain/direction.types";` and change the `Task` type:

```ts
export type Task = Omit<TaskRow, "status" | "task_type"> & {
  status: TaskStatus;
  task_type: TaskType | null;
  template: Pick<TaskTemplate, "id" | "name" | "default_estimate_minutes"> | null;
  /** The project's mission makes a project-linked task Growth (ADR 0020). Optional for older fixtures. */
  project: { id: string; name: string; mission?: DirectionRef | null } | null;
  milestone: { id: string; name: string } | null;
  domain: { id: string; name: string } | null;
  mission?: DirectionRef | null;
  protocol?: { id: string; title: string; path: DirectionRef | null } | null;
  tags: TagRef[];
};
```

- [ ] **Step 3: Task schemas** — in `createTaskSchema` add after `milestoneId`:
```ts
  /** Direction link (G1). A protocol implies its mission. */
  missionId: z.uuid().nullable().optional(),
  protocolId: z.uuid().nullable().optional(),
```
and in `updateTaskSchema` after `milestoneId`:
```ts
  missionId: z.uuid().nullable(),
  protocolId: z.uuid().nullable(),
```

- [ ] **Step 4: Projects service** — in `src/features/projects/services/project.service.ts` add imports and a helper, and extend `updateProject`:

```ts
import { countProjectConflicts } from "@/features/direction/domain/link-rules";
import { resolveDirectionLink } from "@/features/direction/services/direction.service";

/** The mission a project lends its tasks (ADR 0020); null when unlinked or no project. */
export async function getProjectMissionId(ctx: ActionContext, projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  const { data, error } = await ctx.supabase
    .from("projects")
    .select("mission_id")
    .eq("id", projectId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data?.mission_id ?? null;
}
```

At the top of `updateProject`, before the update:
```ts
  const before = await ctx.supabase
    .from("projects")
    .select("mission_id")
    .eq("id", input.projectId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (before.error) throw fromDbError(before.error);
  if (!before.data) throw new AppError("NOT_FOUND");
  const { mission_id: missionId } = await resolveDirectionLink(
    ctx,
    { missionId: input.missionId },
    { mission_id: before.data.mission_id, protocol_id: null },
  );
  if (missionId) {
    const tasks = await ctx.supabase
      .from("tasks")
      .select("mission_id")
      .eq("project_id", input.projectId)
      .eq("user_id", ctx.user.id)
      .not("mission_id", "is", null);
    if (tasks.error) throw fromDbError(tasks.error);
    const conflicts = countProjectConflicts(missionId, tasks.data.map((t) => t.mission_id));
    if (conflicts > 0) {
      throw new AppError("VALIDATION_ERROR", `작업 ${conflicts}개가 다른 목표에 연결되어 있습니다.`);
    }
  }
```
and add `mission_id: missionId,` to the `.update({...})` object.

In `src/features/projects/schemas/project.schema.ts`, add to the `updateProjectSchema` object (before `.refine`): `missionId: z.uuid().nullable(),`.

- [ ] **Step 5: Task service** — in `src/features/scheduler/services/task.service.ts`:

Imports:
```ts
import { getProjectMissionId, resolveTaskLink } from "@/features/projects/services/project.service";
import { resolveDirectionLink } from "@/features/direction/services/direction.service";
import { missionConflict } from "@/features/direction/domain/link-rules";
```
Add above `createTask`:
```ts
/** Direction link + the task/project mission agreement rule (ADR 0020). */
async function resolveDirection(
  ctx: ActionContext,
  input: { missionId?: string | null; protocolId?: string | null },
  projectId: string | null,
  current?: { mission_id: string | null; protocol_id: string | null },
) {
  const direction = await resolveDirectionLink(ctx, input, current);
  if (missionConflict(direction.mission_id, await getProjectMissionId(ctx, projectId))) {
    throw new AppError("VALIDATION_ERROR", "프로젝트가 다른 목표에 연결되어 있습니다.");
  }
  return direction;
}
```
In `createTask`, after `const link = await resolveTaskLink(ctx, input);` add `const direction = await resolveDirection(ctx, input, link.project_id);` and add `...direction,` after `...link,` in the insert.
In `updateTask`, after `const link = …` add `const direction = await resolveDirection(ctx, input, link.project_id, before);` and add `...direction,` after `...link,` in the update.

- [ ] **Step 6: Callers compile** — `updateTaskAction` in the drawer and `updateProjectAction` in `ProjectEditForm` now need `missionId`/`protocolId`. Temporarily pass the current values so the build stays green until Task 6:
  - drawer (`task-detail-drawer.tsx`, `updateTaskAction({...})`): add `missionId: task.mission_id, protocolId: task.protocol_id,`
  - `ProjectEditForm` (`updateProjectAction({...})`): add `missionId: project.mission_id,`

Run: `npx tsc --noEmit && npx eslint src && npx vitest run`
Expected: PASS. Fix any test fixture that builds a `Task` only if tsc flags it (the new fields are optional, so none should).

- [ ] **Step 7: Smoke** — `npm run dev`, open `/scheduler`, open a task drawer, save a title change. Expected: saved; no console/server errors (the select embeds resolve).

- [ ] **Step 8: Commit**

```bash
git add src/features/scheduler/queries/select.ts src/features/scheduler/domain/task.types.ts src/features/scheduler/schemas/task.schema.ts src/features/scheduler/services/task.service.ts src/features/projects/schemas/project.schema.ts src/features/projects/services/project.service.ts src/features/scheduler/components/task-detail-drawer.tsx src/features/projects/components/project-forms.tsx
git commit -m "G1: task/project mission links with the agreement rule"
```

---

### Task 5: `/scheduler/directive` page

**Files:**
- Create: `src/app/(private)/scheduler/directive/page.tsx`, `src/features/direction/components/directive-header.tsx`, `src/features/direction/components/mission-forms.tsx`, `src/features/direction/components/criteria-list.tsx`, `src/features/direction/components/path-panel.tsx`, `src/features/direction/components/protocol-list.tsx`
- Modify: `src/components/layout/private-nav.tsx`

**Interfaces:**
- Consumes: Task 3 queries/actions, Task 2 types and terms, `DueBadge` (`@/features/projects/components/due-badge`), `DatePicker`, `useActionRunner`, `useTerms`, `josa`, `getSchedulerContext`, `todayLocalDate`.
- Produces: page at `/scheduler/directive?mission=<id>`; accessible names used by the E2E (plain terms):
  - region `목적` with buttons `설정`/`편집`, form `목적 편집` (field `문장`, button `저장`)
  - list `정체성 목록`, form `새 정체성` (field `이름`, button `추가`)
  - form `새 목표` (fields `목표 이름`, `기한 (선택)`; button `만들기`)
  - region `목표 상세` with heading level 2 = mission title; form `목표 설정`
  - region `성공 기준`, form `새 기준` (fields `기준`, `종류`, `목표값`, `단위`; button `기준 추가`); list items `기준 <label>`
  - region `현재 전략`; form `전략 설정` / `전략 교체` (fields `이름`, `접근 방식`, `포기하는 것`; button `설정` / `교체`); group `이전 전략`
  - region `실행 방식`, form `새 실행 방식` (fields `이름`, `단계 (한 줄에 하나)`, `의도 시간(분)`; button `추가`); list items `실행 방식 <title>`

- [ ] **Step 1: Nav** — in `private-nav.tsx` import `Compass` from `lucide-react`, insert after the 스케줄러 entry:
```ts
  { href: "/scheduler/directive", label: "directive", icon: Compass, exact: false },
```
and replace the label line with:
```ts
        const label = rawLabel === "project" ? terms.project : rawLabel === "directive" ? terms.directiveNav : rawLabel;
```

- [ ] **Step 2: Directive header** `src/features/direction/components/directive-header.tsx`

```tsx
"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import { josa } from "@/lib/terms";
import { createIdentityAction, setPurposeAction, updateIdentityAction } from "../actions/direction.actions";
import type { Identity, Purpose } from "../domain/direction.types";

export function DirectiveHeader({ purpose, identities }: { purpose: Purpose | null; identities: Identity[] }) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  const [editing, setEditing] = useState(false);
  const active = identities.filter((i) => i.status === "active");
  const archived = identities.filter((i) => i.status === "archived");

  const move = (index: number, delta: -1 | 1) => {
    const a = active[index];
    const b = active[index + delta];
    if (!a || !b) return;
    run(async () => {
      const first = await updateIdentityAction({ identityId: a.id, name: a.name, description: a.description, status: a.status, sortOrder: b.sort_order });
      if (!first.ok) return first;
      return updateIdentityAction({ identityId: b.id, name: b.name, description: b.description, status: b.status, sortOrder: a.sort_order });
    });
  };

  return (
    <div className="space-y-4">
      <section aria-label={terms.directive} className="space-y-2 border-y border-border py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.directive}</h2>
          {!editing && (
            <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
              {purpose ? "편집" : "설정"}
            </Button>
          )}
        </div>
        {editing ? (
          <form
            aria-label={`${terms.directive} 편집`}
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const statement = String(new FormData(e.currentTarget).get("statement") ?? "");
              run(() => setPurposeAction({ statement }), { success: "저장했습니다.", onSuccess: () => setEditing(false) });
            }}
          >
            <Label htmlFor="purpose-statement" className="text-xs text-muted-foreground">
              문장
            </Label>
            <Textarea id="purpose-statement" name="statement" rows={2} maxLength={280} required defaultValue={purpose?.statement ?? ""} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                저장
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                취소
              </Button>
            </div>
          </form>
        ) : purpose ? (
          <p className="text-lg font-medium whitespace-pre-line">{purpose.statement}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{`${josa(terms.directive, "이/가")} 설정되지 않았습니다.`}</p>
        )}
      </section>

      <section aria-label={terms.identity} className="space-y-2">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.identity}</h2>
        <ul aria-label={`${terms.identity} 목록`} className="flex flex-wrap gap-2">
          {active.map((i, index) => (
            <li key={i.id} aria-label={`${terms.identity} ${i.name}`} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
              {index === 0 && <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">{terms.className}</span>}
              <span>{i.name}</span>
              <Button size="icon-xs" variant="ghost" aria-label={`${i.name} 앞으로`} disabled={pending || index === 0} onClick={() => move(index, -1)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`${i.name} 뒤로`} disabled={pending || index === active.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown aria-hidden />
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => updateIdentityAction({ identityId: i.id, name: i.name, description: i.description, status: "archived", sortOrder: i.sort_order }))}
              >
                보관
              </Button>
            </li>
          ))}
        </ul>
        <form
          aria-label={`새 ${terms.identity}`}
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = String(new FormData(form).get("name") ?? "");
            run(() => createIdentityAction({ name }), { onSuccess: () => form.reset() });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="identity-name" className="text-xs text-muted-foreground">
              이름
            </Label>
            <Input id="identity-name" name="name" required maxLength={40} className="h-8 w-48" />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            추가
          </Button>
        </form>
        {archived.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">보관됨 ({archived.length})</summary>
            <ul className="mt-1 flex flex-wrap gap-2">
              {archived.map((i) => (
                <li key={i.id} className="flex items-center gap-1">
                  {i.name}
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => updateIdentityAction({ identityId: i.id, name: i.name, description: i.description, status: "active", sortOrder: i.sort_order }))}
                  >
                    복원
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
```
Check `src/components/ui/button.tsx` for the `icon-xs` and `xs` sizes; use the nearest existing sizes if they differ.

- [ ] **Step 3: Mission forms** `src/features/direction/components/mission-forms.tsx`

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import { createMissionAction, updateMissionAction } from "../actions/direction.actions";
import { MISSION_STATUSES, MISSION_STATUS_LABEL, type Identity, type MissionDetail } from "../domain/direction.types";

const selectClass = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export function MissionCreateForm() {
  const terms = useTerms();
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const ref = useRef<HTMLFormElement>(null);
  const [resetKey, setResetKey] = useState(0);
  return (
    <form
      ref={ref}
      aria-label={`새 ${terms.mission}`}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => createMissionAction({ title: str(fd, "title"), deadline: str(fd, "deadline") || null }), {
          onSuccess: (m) => {
            ref.current?.reset();
            setResetKey((k) => k + 1);
            router.push(`/scheduler/directive?mission=${m.id}#mission-detail`);
          },
        });
      }}
    >
      <Label htmlFor="mission-title" className="text-xs text-muted-foreground">
        {`${terms.mission} 이름`}
      </Label>
      <Input id="mission-title" name="title" required maxLength={120} />
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="mission-deadline" className="text-xs text-muted-foreground">
            기한 (선택)
          </Label>
          <DatePicker key={resetKey} id="mission-deadline" name="deadline" clearable />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          만들기
        </Button>
      </div>
    </form>
  );
}

export function MissionSettingsForm({ detail, identities }: { detail: MissionDetail; identities: Identity[] }) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  const { mission } = detail;
  const choosable = identities.filter((i) => i.status === "active" || mission.identityIds.includes(i.id));
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">{`${terms.mission} 설정`}</summary>
      <form
        aria-label={`${terms.mission} 설정`}
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(
            () =>
              updateMissionAction({
                missionId: mission.id,
                title: str(fd, "title"),
                outcome: str(fd, "outcome") || null,
                deadline: str(fd, "deadline") || null,
                identityIds: fd.getAll("identityIds").map(String),
                status: str(fd, "status"),
              }),
            { success: "저장했습니다." },
          );
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="mission-edit-title" className="text-xs text-muted-foreground">이름</Label>
          <Input id="mission-edit-title" name="title" required maxLength={120} defaultValue={mission.title} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mission-edit-outcome" className="text-xs text-muted-foreground">기대 결과</Label>
          <Textarea id="mission-edit-outcome" name="outcome" rows={2} maxLength={500} defaultValue={mission.outcome ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="mission-edit-deadline" className="text-xs text-muted-foreground">기한</Label>
            <DatePicker id="mission-edit-deadline" name="deadline" clearable defaultValue={mission.deadline} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mission-edit-status" className="text-xs text-muted-foreground">상태</Label>
            <select id="mission-edit-status" name="status" defaultValue={mission.status} className={selectClass}>
              {MISSION_STATUSES.map((s) => (
                <option key={s} value={s}>{MISSION_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
        {choosable.length > 0 && (
          <fieldset className="space-y-1">
            <legend className="text-xs text-muted-foreground">{terms.identity} (최대 6개)</legend>
            <div className="flex flex-wrap gap-3">
              {choosable.map((i) => (
                <label key={i.id} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="identityIds" value={i.id} defaultChecked={mission.identityIds.includes(i.id)} />
                  {i.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Button type="submit" size="sm" disabled={pending}>저장</Button>
      </form>
    </details>
  );
}
```

- [ ] **Step 4: Criteria list** `src/features/direction/components/criteria-list.tsx`

```tsx
"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionRunner } from "@/hooks/use-action-runner";
import { deleteCriterionAction, setCriterionProgressAction, upsertCriterionAction } from "../actions/direction.actions";
import type { MissionCriterion } from "../domain/direction.types";

const selectClass = "h-8 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

export function CriteriaList({ missionId, criteria, closed }: { missionId: string; criteria: MissionCriterion[]; closed: boolean }) {
  const { run, pending } = useActionRunner();
  return (
    <section aria-label="성공 기준" className="space-y-2">
      <h3 className="text-sm font-semibold">
        성공 기준 <span className="text-xs font-normal text-muted-foreground">{criteria.filter((c) => c.met_at).length}/{criteria.length} 달성</span>
      </h3>
      {criteria.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {criteria.map((c) => (
            <li key={c.id} aria-label={`기준 ${c.label}`} className="flex items-center gap-2 px-3 py-2 text-sm">
              {c.met_at ? <CheckCircle2 className="size-4 shrink-0" aria-hidden /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="min-w-0 flex-1">
                {c.label}
                <span className="sr-only">{c.met_at ? " (달성)" : " (미달성)"}</span>
              </span>
              {c.kind === "check" ? (
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    aria-label={`${c.label} 달성`}
                    checked={c.met_at !== null}
                    disabled={pending || closed}
                    onChange={(e) => run(() => setCriterionProgressAction({ criterionId: c.id, met: e.target.checked }))}
                  />
                  달성
                </label>
              ) : (
                <form
                  className="flex items-center gap-1 text-xs tabular-nums"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = Number(new FormData(e.currentTarget).get("current"));
                    run(() => setCriterionProgressAction({ criterionId: c.id, currentValue: v }));
                  }}
                >
                  <Input
                    name="current"
                    type="number"
                    min={0}
                    step="any"
                    aria-label={`${c.label} 현재값`}
                    defaultValue={c.current_value ?? 0}
                    disabled={closed}
                    className="h-7 w-16"
                  />
                  / {c.target_value} {c.unit}
                  <Button type="submit" size="xs" variant="ghost" disabled={pending || closed}>갱신</Button>
                </form>
              )}
              {!closed && (
                <Button size="xs" variant="ghost" aria-label={`기준 ${c.label} 삭제`} disabled={pending} onClick={() => run(() => deleteCriterionAction({ criterionId: c.id }))}>
                  삭제
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!closed && (
        <form
          aria-label="새 기준"
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const kind = String(fd.get("kind"));
            const target = String(fd.get("target") ?? "").trim();
            run(
              () =>
                upsertCriterionAction({
                  missionId,
                  label: String(fd.get("label") ?? ""),
                  kind,
                  targetValue: kind === "numeric" ? (target === "" ? null : Number(target)) : null,
                  unit: String(fd.get("unit") ?? "") || null,
                }),
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor="criterion-label" className="text-xs text-muted-foreground">기준</Label>
            <Input id="criterion-label" name="label" required maxLength={120} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="criterion-kind" className="text-xs text-muted-foreground">종류</Label>
            <select id="criterion-kind" name="kind" defaultValue="check" className={selectClass}>
              <option value="check">체크</option>
              <option value="numeric">숫자</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="criterion-target" className="text-xs text-muted-foreground">목표값</Label>
            <Input id="criterion-target" name="target" type="number" min={0} step="any" className="h-8 w-20" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="criterion-unit" className="text-xs text-muted-foreground">단위</Label>
            <Input id="criterion-unit" name="unit" maxLength={12} className="h-8 w-16" />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>기준 추가</Button>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Path panel** `src/features/direction/components/path-panel.tsx`

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import { josa } from "@/lib/terms";
import { switchPathAction, updatePathAction } from "../actions/direction.actions";
import type { Path } from "../domain/direction.types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const day = (iso: string) => iso.slice(0, 10);

function PathFields({ idPrefix, path }: { idPrefix: string; path?: Path }) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-title`} className="text-xs text-muted-foreground">이름</Label>
        <Input id={`${idPrefix}-title`} name="title" required maxLength={80} defaultValue={path?.title} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-approach`} className="text-xs text-muted-foreground">접근 방식</Label>
        <Textarea id={`${idPrefix}-approach`} name="approach" rows={3} required maxLength={1000} defaultValue={path?.approach} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-tradeoffs`} className="text-xs text-muted-foreground">포기하는 것</Label>
        <Textarea id={`${idPrefix}-tradeoffs`} name="tradeOffs" rows={2} maxLength={1000} defaultValue={path?.trade_offs ?? ""} />
      </div>
    </>
  );
}

export function PathPanel({
  missionId,
  activePath,
  retiredPaths,
  closed,
}: {
  missionId: string;
  activePath: Path | null;
  retiredPaths: Path[];
  closed: boolean;
}) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  const switchLabel = activePath ? `${terms.path} 교체` : `${terms.path} 설정`;
  return (
    <section aria-label={`현재 ${terms.path}`} className="space-y-3 border-t border-border pt-4">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{`현재 ${terms.path}`}</h3>
      {activePath ? (
        <div className="space-y-2">
          <p className="text-base font-semibold">{activePath.title}</p>
          <p className="text-sm whitespace-pre-line">{activePath.approach}</p>
          {activePath.trade_offs && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              <span className="font-medium">포기하는 것 · </span>
              {activePath.trade_offs}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{day(activePath.started_at)}부터</p>
          {!closed && (
            <details>
              <summary className="cursor-pointer text-xs">편집</summary>
              <form
                aria-label={`${terms.path} 편집`}
                className="mt-2 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  run(
                    () => updatePathAction({ pathId: activePath.id, title: str(fd, "title"), approach: str(fd, "approach"), tradeOffs: str(fd, "tradeOffs") || null }),
                    { success: "저장했습니다." },
                  );
                }}
              >
                <PathFields idPrefix="path-edit" path={activePath} />
                <Button type="submit" size="sm" disabled={pending}>저장</Button>
              </form>
            </details>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{`아직 ${josa(terms.path, "이/가")} 없습니다. 목표에 어떻게 접근할지, 무엇을 포기할지 적어 보세요.`}</p>
      )}

      {!closed && (
        <details open={!activePath}>
          <summary className="cursor-pointer text-sm font-medium">{switchLabel}</summary>
          <form
            aria-label={switchLabel}
            className="mt-2 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              run(
                () => switchPathAction({ missionId, title: str(fd, "title"), approach: str(fd, "approach"), tradeOffs: str(fd, "tradeOffs") || null }),
                { success: "저장했습니다.", onSuccess: () => form.reset() },
              );
            }}
          >
            {activePath && (
              <p className="text-xs text-muted-foreground">
                {`현재 ${josa(terms.path, "은/는")} 이력으로 이동하고, 그 ${josa(terms.protocol, "은/는")} 보관됩니다. 연결된 작업의 기록은 그대로 남습니다.`}
              </p>
            )}
            <PathFields idPrefix="path-new" />
            <Button type="submit" size="sm" disabled={pending}>{activePath ? "교체" : "설정"}</Button>
          </form>
        </details>
      )}

      {retiredPaths.length > 0 && (
        <details role="group" aria-label={`이전 ${terms.path}`}>
          <summary className="cursor-pointer text-xs text-muted-foreground">{`이전 ${terms.path} (${retiredPaths.length})`}</summary>
          <ul className="mt-2 space-y-2">
            {retiredPaths.map((p) => (
              <li key={p.id} className="rounded-md border border-border px-3 py-2 text-sm">
                <p className="font-medium">
                  {p.title} <span className="text-xs font-normal text-muted-foreground">교체됨 · {day(p.started_at)}–{day(p.retired_at!)}</span>
                </p>
                <p className="text-xs text-muted-foreground whitespace-pre-line">{p.approach}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Protocol list** `src/features/direction/components/protocol-list.tsx`

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import { createProtocolAction, updateProtocolAction } from "../actions/direction.actions";
import type { Protocol } from "../domain/direction.types";

export function ProtocolList({ pathId, protocols, closed }: { pathId: string; protocols: Protocol[]; closed: boolean }) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  return (
    <section aria-label={terms.protocol} className="space-y-2 border-t border-border pt-4">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.protocol}</h3>
      {protocols.length > 0 && (
        <ul className="space-y-2">
          {protocols.map((p) => (
            <li key={p.id} aria-label={`${terms.protocol} ${p.title}`} className="rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{p.title}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {p.intended_minutes && <span>{p.intended_minutes}분</span>}
                  {!closed && (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          updateProtocolAction({
                            protocolId: p.id,
                            title: p.title,
                            steps: p.steps,
                            intendedMinutes: p.intended_minutes,
                            status: "archived",
                            sortOrder: p.sort_order,
                          }),
                        )
                      }
                    >
                      보관
                    </Button>
                  )}
                </span>
              </div>
              {p.steps.length > 0 && (
                <ol className="mt-1 list-decimal pl-5 text-xs text-muted-foreground">
                  {p.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
      {!closed && (
        <form
          aria-label={`새 ${terms.protocol}`}
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const minutes = String(fd.get("minutes") ?? "").trim();
            run(
              () =>
                createProtocolAction({
                  pathId,
                  title: String(fd.get("title") ?? ""),
                  steps: String(fd.get("steps") ?? "").split("\n"),
                  intendedMinutes: minutes ? Number(minutes) : null,
                }),
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1">
              <Label htmlFor="protocol-title" className="text-xs text-muted-foreground">이름</Label>
              <Input id="protocol-title" name="title" required maxLength={80} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="protocol-minutes" className="text-xs text-muted-foreground">의도 시간(분)</Label>
              <Input id="protocol-minutes" name="minutes" type="number" min={5} max={600} className="h-8 w-24" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="protocol-steps" className="text-xs text-muted-foreground">단계 (한 줄에 하나)</Label>
            <Textarea id="protocol-steps" name="steps" rows={3} />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>추가</Button>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Page** `src/app/(private)/scheduler/directive/page.tsx`

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { josa, termsFor } from "@/lib/terms";
import { getPlayerProfile } from "@/features/gamification/queries/xp.queries";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { todayLocalDate } from "@/features/scheduler/utils/timezone";
import { DueBadge } from "@/features/projects/components/due-badge";
import { DirectiveHeader } from "@/features/direction/components/directive-header";
import { MissionCreateForm, MissionSettingsForm } from "@/features/direction/components/mission-forms";
import { CriteriaList } from "@/features/direction/components/criteria-list";
import { PathPanel } from "@/features/direction/components/path-panel";
import { ProtocolList } from "@/features/direction/components/protocol-list";
import { MISSION_STATUS_LABEL, type MissionSummary } from "@/features/direction/domain/direction.types";
import { getMissionDetail, loadDirective } from "@/features/direction/queries/direction.queries";

export const metadata: Metadata = { title: "방향", robots: { index: false } };

/** Purpose and identities on top; missions on the left; the selected mission (?mission=) on the right. */
export default async function DirectivePage({ searchParams }: { searchParams: Promise<{ mission?: string }> }) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const [profile, context, view] = await Promise.all([
    getPlayerProfile(supabase, user.id),
    getSchedulerContext(supabase, user.id),
    loadDirective(supabase, user.id),
  ]);
  const terms = termsFor(!!profile?.gamification_enabled && !!profile.quest_terminology);
  const today = todayLocalDate(context.timezone);
  const { mission: missionParam } = await searchParams;
  const selectedId = missionParam && z.uuid().safeParse(missionParam).success ? missionParam : null;
  const detail = selectedId ? await getMissionDetail(supabase, user.id, selectedId) : null;
  const identityName = Object.fromEntries(view.identities.map((i) => [i.id, i.name]));
  const active = view.missions.filter((m) => m.status === "active");
  const closedMissions = view.missions.filter((m) => m.status !== "active");
  const closed = detail ? detail.mission.status !== "active" : false;

  const card = (m: MissionSummary) => (
    <li key={m.id}>
      <Link
        href={`/scheduler/directive?mission=${m.id}#mission-detail`}
        aria-current={m.id === detail?.mission.id ? "page" : undefined}
        className={cn("block space-y-1 px-4 py-3 hover:bg-muted/50", m.id === detail?.mission.id && "bg-muted")}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">{m.title}</span>
          <span className="flex items-center gap-2">
            <DueBadge today={today} target={m.deadline} closed={m.status !== "active"} />
            <span className="rounded-sm border border-border px-1.5 text-xs text-muted-foreground">{MISSION_STATUS_LABEL[m.status]}</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {m.criteriaTotal > 0 && `기준 ${m.criteriaMet}/${m.criteriaTotal}`}
          {m.identityIds.length > 0 && ` · ${m.identityIds.map((id) => identityName[id]).filter(Boolean).join(", ")}`}
        </p>
      </Link>
    </li>
  );

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh">
      <div className="space-y-3 border-b border-border p-4">
        <h1 className="text-lg font-semibold">{terms.directiveNav}</h1>
        <DirectiveHeader purpose={view.purpose} identities={view.identities} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside aria-label={`${terms.mission} 목록`} className="flex shrink-0 flex-col border-b border-border md:w-80 md:border-r md:border-b-0">
          <div className="border-b border-border p-4">
            <MissionCreateForm />
          </div>
          {view.missions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{`아직 ${josa(terms.mission, "이/가")} 없습니다.`}</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul className="divide-y divide-border">{active.map(card)}</ul>
              {closedMissions.length > 0 && (
                <details className="border-t border-border">
                  <summary className="cursor-pointer px-4 py-2 text-xs text-muted-foreground">달성·중단 ({closedMissions.length})</summary>
                  <ul className="divide-y divide-border">{closedMissions.map(card)}</ul>
                </details>
              )}
            </div>
          )}
        </aside>
        <section id="mission-detail" aria-label={`${terms.mission} 상세`} className="min-w-0 flex-1 space-y-5 overflow-y-auto p-6">
          {detail ? (
            <>
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.mission}</p>
                <h2 className="text-2xl font-semibold">{detail.mission.title}</h2>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded-sm border border-border px-1.5 text-xs">{MISSION_STATUS_LABEL[detail.mission.status]}</span>
                  <DueBadge today={today} target={detail.mission.deadline} closed={closed} />
                </p>
                {detail.mission.outcome && <p className="text-sm whitespace-pre-line">{detail.mission.outcome}</p>}
              </div>
              <CriteriaList missionId={detail.mission.id} criteria={detail.criteria} closed={closed} />
              <PathPanel missionId={detail.mission.id} activePath={detail.activePath} retiredPaths={detail.retiredPaths} closed={closed} />
              {detail.activePath && <ProtocolList pathId={detail.activePath.id} protocols={detail.protocols} closed={closed} />}
              {detail.projects.length > 0 && (
                <section aria-label={`연결된 ${terms.project}`} className="space-y-2 border-t border-border pt-4">
                  <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{`연결된 ${terms.project}`}</h3>
                  <ul className="space-y-1 text-sm">
                    {detail.projects.map((p) => (
                      <li key={p.id}>
                        <Link className="underline-offset-2 hover:underline" href={`/scheduler/projects?project=${p.id}#project-detail`}>
                          {p.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <MissionSettingsForm key={detail.mission.id} detail={detail} identities={view.identities} />
            </>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {selectedId ? `${josa(terms.mission, "을/를")} 찾을 수 없습니다. ` : ""}
              {`왼쪽에서 ${josa(terms.mission, "을/를")} 선택하거나 새로 만드세요.`}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Verify in the browser**

Run: `npx tsc --noEmit && npx eslint src/features/direction "src/app/(private)/scheduler/directive" src/components/layout/private-nav.tsx`
Then `npm run dev`, open `/scheduler/directive` (Playwright MCP or next-devtools). Walk through: set the directive, add two identities and reorder them, create a mission with a deadline, add a check and a numeric criterion and update both, set a path, add a protocol with steps, switch the path (old path appears under history, protocol list empties), change the mission status to 달성 (forms disappear, card moves under 달성·중단). Check the layout at 390px width. Expected: all of it works with no console errors. Delete the data you created afterwards (or prefix it `[e2e]` so the suite's cleanup removes it).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(private)/scheduler/directive/page.tsx" src/features/direction/components src/components/layout/private-nav.tsx
git commit -m "G1: /scheduler/directive page (directive, identities, missions, criteria, path, protocols)"
```

---

### Task 6: Task drawer, task list, projects

**Files:**
- Create: `src/features/direction/components/direction-picker.tsx`, `src/features/direction/components/direction-breadcrumb.tsx`
- Modify: `src/app/(private)/scheduler/page.tsx`, `src/features/scheduler/components/scheduler-workspace.tsx`, `src/features/scheduler/components/task-detail-drawer.tsx`, `src/features/scheduler/components/task-list-item.tsx`, `src/app/(private)/scheduler/projects/page.tsx`, `src/features/projects/components/project-detail.tsx`, `src/features/projects/components/project-forms.tsx`

**Interfaces:**
- Consumes: `listMissionOptions`, `getMissionRef` (Task 3), `buildBreadcrumb`, `effectiveMissionId` (Task 2), `Task` (Task 4).
- Produces: `DirectionPicker({ task, options })` — a select named `direction` with values `""`, `m:<missionId>`, `p:<protocolId>`, label `${terms.mission} / ${terms.protocol}`, id `task-direction`; `parseDirection(value: string): { missionId: string | null; protocolId: string | null }`; `DirectionBreadcrumb({ task })` — `nav` with aria-label `연결 경로`.

- [ ] **Step 1: Picker** `src/features/direction/components/direction-picker.tsx`

```tsx
"use client";

import { Label } from "@/components/ui/label";
import { useTerms } from "@/hooks/use-terms";
import type { BreadcrumbInput } from "../domain/breadcrumb";
import type { MissionOption } from "../domain/direction.types";

const selectClass = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

export function parseDirection(value: string): { missionId: string | null; protocolId: string | null } {
  if (value.startsWith("p:")) return { missionId: null, protocolId: value.slice(2) };
  if (value.startsWith("m:")) return { missionId: value.slice(2), protocolId: null };
  return { missionId: null, protocolId: null };
}

/** Mission → protocol picker. Keeps the current link selectable even when it is closed or retired now. */
export function DirectionPicker({
  task,
  options,
}: {
  task: BreadcrumbInput & { mission_id: string | null; protocol_id: string | null };
  options: MissionOption[];
}) {
  const terms = useTerms();
  const all = options.map((m) => ({ ...m, protocols: [...m.protocols] }));
  if (task.mission && !all.some((m) => m.id === task.mission!.id)) {
    all.push({ id: task.mission.id, title: task.mission.title, protocols: [] });
  }
  if (task.protocol && task.mission_id) {
    const owner = all.find((m) => m.id === task.mission_id);
    if (owner && !owner.protocols.some((p) => p.id === task.protocol!.id)) owner.protocols.push({ id: task.protocol.id, title: task.protocol.title });
  }
  const current = task.protocol_id ? `p:${task.protocol_id}` : task.mission_id ? `m:${task.mission_id}` : "";
  return (
    <div className="space-y-1">
      <Label htmlFor="task-direction" className="text-xs text-muted-foreground">{`${terms.mission} / ${terms.protocol}`}</Label>
      <select id="task-direction" name="direction" defaultValue={current} className={selectClass}>
        <option value="">연결 안 함</option>
        {all.map((m) => (
          <optgroup key={m.id} label={m.title}>
            <option value={`m:${m.id}`}>{m.title}</option>
            {m.protocols.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>{`${m.title} › ${p.title}`}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Breadcrumb** `src/features/direction/components/direction-breadcrumb.tsx`

```tsx
"use client";

import { ChevronRight } from "lucide-react";
import { useTerms } from "@/hooks/use-terms";
import { buildBreadcrumb, type BreadcrumbInput } from "../domain/breadcrumb";

/** "Why am I doing this?" — Mission › Path › Protocol, or a MAINTENANCE label. */
export function DirectionBreadcrumb({ task }: { task: BreadcrumbInput }) {
  const terms = useTerms();
  const b = buildBreadcrumb(task);
  if (b.kind === "maintenance") {
    return <p className="text-[11px] font-semibold tracking-widest text-muted-foreground">{terms.maintenance}</p>;
  }
  return (
    <nav aria-label="연결 경로" className="text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {b.crumbs.map((c, i) => (
          <li key={c.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3" aria-hidden />}
            <span className={i === 0 ? "font-medium text-foreground" : undefined}>{c.label}</span>
            {c.note && <span className="rounded-sm border border-border px-1 text-[10px]">{c.note}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 3: Scheduler page and workspace** — in `src/app/(private)/scheduler/page.tsx` import `listMissionOptions` from `@/features/direction/queries/direction.queries`, add `listMissionOptions(supabase, user.id),` as the last entry of the big `Promise.all` and destructure it as `missionOptions` (append to the destructuring list in the same position), and pass `missionOptions={missionOptions}` next to `projectOptions`. In `scheduler-workspace.tsx` add `missionOptions: MissionOption[];` next to `projectOptions` in the props type (import `MissionOption` from `@/features/direction/domain/direction.types`), destructure it, and pass `missionOptions={missionOptions}` to `TaskDetailDrawer` next to `projectOptions`.

- [ ] **Step 4: Drawer** — in `task-detail-drawer.tsx`:
  - Import `DirectionBreadcrumb`, `DirectionPicker`, `parseDirection` and `MissionOption`.
  - `SessionProps` gains `missionOptions: MissionOption[];`; thread it through `TaskDetailDrawer` → `TaskDetail` exactly like `projectOptions`.
  - In the `SheetHeader`, after `SheetDescription`: `<DirectionBreadcrumb task={task} />`
  - In the edit form, after `<ProjectPicker … />`: `<DirectionPicker key={task.id} task={task} options={missionOptions} />`
  - In `updateTaskAction({...})` replace the temporary Task 4 lines with: `...parseDirection(String(fd.get("direction") ?? "")),`

- [ ] **Step 5: Task list chip** — in `task-list-item.tsx`, at the top of `TaskListItem` add
`const mission = task.mission ?? task.project?.mission ?? null; // Growth chip (ADR 0020)`, and after the
`task.project && (...)` span add:
```tsx
          {mission && (
            <span title={mission.title} className="rounded-sm border border-border px-1 text-foreground/80">
              {mission.title.slice(0, 12)}
            </span>
          )}
```
Maintenance rows get nothing.

- [ ] **Step 6: Projects** —
  - `projects/page.tsx`: import `listMissionOptions`, `getMissionRef`; after `selected` is resolved:
    ```ts
    const [missionOptions, projectMission] = await Promise.all([
      listMissionOptions(supabase, user.id),
      selected?.overview.mission_id ? getMissionRef(supabase, user.id, selected.overview.mission_id) : Promise.resolve(null),
    ]);
    ```
    and pass `missionOptions={missionOptions}` and `mission={projectMission}` to `ProjectDetail`. (If `ProjectOverview` does not carry `mission_id`, check `assemble` in `project.queries.ts`; it spreads the `projects.*` row, so after the type regen it does.)
  - `project-detail.tsx`: accept `missionOptions: MissionOption[]` and `mission: DirectionRef | null`. Above the `<h2>` render, when `mission` is set:
    ```tsx
    <p className="text-xs text-muted-foreground">
      <Link href={`/scheduler/directive?mission=${mission.id}#mission-detail`} className="hover:underline">{mission.title}</Link>
      {mission.status !== "active" && ` (${mission.status.toUpperCase()})`} › {project.name}
    </p>
    ```
    and pass `missionOptions` and `mission` to `ProjectEditForm`.
  - `project-forms.tsx` `ProjectEditForm({ project, missionOptions, mission })`: add a field after the 목표일 field:
    ```tsx
        <Field label={terms.mission} htmlFor="project-mission">
          <select id="project-mission" name="missionId" defaultValue={project.mission_id ?? ""} className={selectClass}>
            <option value="">없음</option>
            {mission && !missionOptions.some((m) => m.id === mission.id) && <option value={mission.id}>{mission.title}</option>}
            {missionOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>
        </Field>
    ```
    and in `updateProjectAction({...})` replace the temporary line with `missionId: orNull(str(fd, "missionId")),`. Change the grid to `sm:grid-cols-5` or put the field on its own row, whichever keeps the form readable at 390px.

- [ ] **Step 7: Verify in the browser**

Run: `npx tsc --noEmit && npx eslint src && npx vitest run`
Then in the dev server: link a task to a protocol in the drawer → breadcrumb `Mission › Path › Protocol`; link a project to a mission and open one of its unlinked tasks → `Mission › Project`; an unlinked task shows `유지` (plain) / `MAINTENANCE`; try linking a task to mission A while its project is on mission B → toast "프로젝트가 다른 목표에 연결되어 있습니다."; relink a project to B while a task points to A → toast "작업 1개가 다른 목표에 연결되어 있습니다."; switch the path on the directive page, return, edit the task's title and save → saves, breadcrumb shows `RETIRED`. Expected: all as described, no console errors.

- [ ] **Step 8: Commit**

```bash
git add src/features/direction/components/direction-picker.tsx src/features/direction/components/direction-breadcrumb.tsx "src/app/(private)/scheduler/page.tsx" src/features/scheduler/components/scheduler-workspace.tsx src/features/scheduler/components/task-detail-drawer.tsx src/features/scheduler/components/task-list-item.tsx "src/app/(private)/scheduler/projects/page.tsx" src/features/projects/components/project-detail.tsx src/features/projects/components/project-forms.tsx
git commit -m "G1: mission/protocol picker, breadcrumb and Growth chip on tasks; mission on projects"
```

---

### Task 7: E2E, cleanup, docs

**Files:**
- Create: `tests/e2e/directive.spec.ts`, `docs/decisions/0020-direction-layer.md`
- Modify: `tests/e2e/helpers.ts`, `docs/decisions/README.md`, `docs/schema.md`, `docs/architecture.md`, `docs/progress.md`

**Interfaces:**
- Consumes: accessible names listed in Task 5 and Task 6.

- [ ] **Step 1: Cleanup** — in `tests/e2e/helpers.ts` `cleanup()`, after the projects delete, add:

```ts
  // Direction layer (G1). Tasks and projects are gone already, so children can go first.
  const { data: e2eMissions } = await db.from("missions").select("id").like("title", `${E2E_PREFIX}%`);
  const missionIds = (e2eMissions ?? []).map((m) => m.id);
  if (missionIds.length > 0) {
    await db.from("protocols").delete().in("mission_id", missionIds);
    await db.from("paths").delete().in("mission_id", missionIds);
    await db.from("missions").delete().in("id", missionIds); // cascades criteria and identity links
  }
  await db.from("identities").delete().like("name", `${E2E_PREFIX}%`);
  const { data: e2ePurposes } = await db.from("purposes").select("id").like("statement", `${E2E_PREFIX}%`);
  if (e2ePurposes?.length) {
    await db.from("purposes").delete().in("id", e2ePurposes.map((p) => p.id));
    // Setting an [e2e] directive archived the owner's real one: bring the newest archived one back.
    const { data: active } = await db.from("purposes").select("id").eq("status", "active").maybeSingle();
    if (!active) {
      const { data: last } = await db
        .from("purposes")
        .select("id")
        .eq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last) await db.from("purposes").update({ status: "active" }).eq("id", last.id);
    }
  }
```

- [ ] **Step 2: E2E** `tests/e2e/directive.spec.ts`

```ts
import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// G1: directive → identity → mission + criterion → path → protocol → task link + breadcrumb → path switch keeps history.
test.describe("direction layer", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("hierarchy, task breadcrumb, path switch", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const { data: before } = await db.from("player_profiles").select("gamification_enabled, quest_terminology").maybeSingle();
    const { data: realPurpose } = await db.from("purposes").select("id").eq("status", "active").maybeSingle();
    // Plain terms for stable labels.
    if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: false }).eq("user_id", uid);
    try {
      const stamp = Date.now();
      const mission = `${E2E_PREFIX} Speak English ${stamp}`;
      const task = `${E2E_PREFIX} Shadow 5 sentences ${stamp}`;
      await login(page);

      await page.getByRole("link", { name: "방향" }).click();
      await expect(page).toHaveURL(/\/scheduler\/directive$/);

      // Directive
      const directive = page.getByRole("region", { name: "목적" });
      await directive.getByRole("button", { name: /^(설정|편집)$/ }).click();
      const purposeForm = page.getByRole("form", { name: "목적 편집" });
      await purposeForm.getByLabel("문장").fill(`${E2E_PREFIX} Build an independent life`);
      await purposeForm.getByRole("button", { name: "저장" }).click();
      await expect(directive).toContainText("Build an independent life");

      // Identity
      const idForm = page.getByRole("form", { name: "새 정체성" });
      await idForm.getByLabel("이름").fill(`${E2E_PREFIX} English Speaker`);
      await idForm.getByRole("button", { name: "추가" }).click();
      await expect(page.getByRole("list", { name: "정체성 목록" })).toContainText("English Speaker");

      // Mission
      const missionForm = page.getByRole("form", { name: "새 목표" });
      await missionForm.getByLabel("목표 이름").fill(mission);
      await missionForm.getByRole("button", { name: "만들기" }).click();
      await expect(page).toHaveURL(/\?mission=/);
      const detail = page.getByRole("region", { name: "목표 상세" });
      await expect(detail.getByRole("heading", { level: 2, name: mission })).toBeVisible();

      // Criterion
      const crit = detail.getByRole("form", { name: "새 기준" });
      await crit.getByLabel("기준").fill("Mock interviews");
      await crit.getByLabel("종류").selectOption("numeric");
      await crit.getByLabel("목표값").fill("3");
      await crit.getByRole("button", { name: "기준 추가" }).click();
      const item = detail.getByRole("listitem", { name: "기준 Mock interviews" });
      await expect(item).toBeVisible();
      await item.getByLabel("Mock interviews 현재값").fill("3");
      await item.getByRole("button", { name: "갱신" }).click();
      await expect(item).toContainText("(달성)");

      // Path
      const setPath = detail.getByRole("form", { name: "전략 설정" });
      await setPath.getByLabel("이름").fill("Input first");
      await setPath.getByLabel("접근 방식").fill("Listen a lot");
      await setPath.getByLabel("포기하는 것").fill("Grammar drills");
      await setPath.getByRole("button", { name: "설정" }).click();
      const current = detail.getByRole("region", { name: "현재 전략" });
      await expect(current).toContainText("Input first");

      // Protocol
      const proto = detail.getByRole("form", { name: "새 실행 방식" });
      await proto.getByLabel("이름").fill("Shadowing");
      await proto.getByLabel("의도 시간(분)").fill("20");
      await proto.getByLabel("단계 (한 줄에 하나)").fill("Listen\nRepeat");
      await proto.getByRole("button", { name: "추가" }).click();
      await expect(detail.getByRole("listitem", { name: "실행 방식 Shadowing" })).toBeVisible();

      // Task → protocol link in the drawer
      await page.getByRole("link", { name: "스케줄러" }).click();
      await page.getByLabel("새 할 일").fill(task);
      await page.getByRole("button", { name: "할 일 추가" }).click();
      await page.getByRole("button", { name: task, exact: true }).click();
      const drawer = page.getByRole("dialog", { name: task });
      await expect(drawer.getByText("유지", { exact: true })).toBeVisible();
      await drawer.getByLabel("목표 / 실행 방식").selectOption({ label: `${mission} › Shadowing` });
      await drawer.getByRole("button", { name: "저장" }).click();
      const crumbs = drawer.getByRole("navigation", { name: "연결 경로" });
      await expect(crumbs).toContainText(mission);
      await expect(crumbs).toContainText("Input first");
      await expect(crumbs).toContainText("Shadowing");
      await expect
        .poll(async () => (await db.from("tasks").select("mission_id, protocol_id").eq("title", task).single()).data?.protocol_id)
        .not.toBeNull();
      await page.keyboard.press("Escape");

      // Switch the path: old one goes to history, the task keeps its link
      await page.getByRole("link", { name: "방향" }).click();
      await page.getByRole("link", { name: mission }).click();
      const detail2 = page.getByRole("region", { name: "목표 상세" });
      await detail2.getByText("전략 교체", { exact: true }).click();
      const swap = detail2.getByRole("form", { name: "전략 교체" });
      await swap.getByLabel("이름").fill("Output first");
      await swap.getByLabel("접근 방식").fill("Speak daily");
      await swap.getByRole("button", { name: "교체" }).click();
      await expect(detail2.getByRole("region", { name: "현재 전략" })).toContainText("Output first");
      const history = detail2.getByRole("group", { name: "이전 전략" });
      await history.locator("summary").click();
      await expect(history).toContainText("Input first");
      await expect(detail2.getByRole("listitem", { name: "실행 방식 Shadowing" })).toHaveCount(0);

      // Existing link survives a save after the switch
      await page.getByRole("link", { name: "스케줄러" }).click();
      await page.getByRole("button", { name: task, exact: true }).click();
      const drawer2 = page.getByRole("dialog", { name: task });
      await expect(drawer2.getByRole("navigation", { name: "연결 경로" })).toContainText("RETIRED");
      await drawer2.getByRole("button", { name: "저장" }).click();
      await expect(page.getByText("교체된", { exact: false })).toHaveCount(0);
      await expect
        .poll(async () => (await db.from("tasks").select("protocol_id").eq("title", task).single()).data?.protocol_id)
        .not.toBeNull();
    } finally {
      await db.from("player_profiles").update({ gamification_enabled: before?.gamification_enabled ?? false }).eq("user_id", uid);
      await cleanup(db);
      // Review Focus 1: the owner's real directive is active again.
      if (realPurpose) {
        const { data: after } = await db.from("purposes").select("id").eq("status", "active").maybeSingle();
        expect(after?.id).toBe(realPurpose.id);
      }
    }
  });
});
```

- [ ] **Step 3: Run E2E**

Run: `set -a; source .env.local; set +a; E2E_EMAIL=… E2E_PASSWORD=… npx playwright test tests/e2e/directive.spec.ts`
Expected: PASS. If a locator fails, fix the component's accessible name to match Task 5/6, not the test (the names are the contract).

- [ ] **Step 4: ADR 0020** `docs/decisions/0020-direction-layer.md`

```markdown
# 0020 — Direction layer (purpose, identities, missions, paths, protocols)

- Status: accepted
- Date: 2026-09-30
- Spec: docs/superpowers/specs/2026-09-30-direction-layer-g1-design.md (umbrella: …-direction-layer-architecture.md)

## Context
improve-requirements-3 adds Purpose → Identity → Goal → Strategy → Tactic above quests. The repo already has projects
and milestones ("Main Quest = project") and rule-generated daily quests.

## Decisions
1. **Mission ↔ project:** a project belongs to a mission (`projects.mission_id`, nullable). Projects stay as work
   bundles; missions are outcomes.
2. **Names in code:** `purpose`, `identity`, `mission`, `path`, `protocol` (not goal/strategy/tactic): `goal` collides
   with quest objectives and the UI says MISSION/PATH/PROTOCOL.
3. **Growth / Maintenance is derived:** effective mission = `task.mission_id ?? project.mission_id`; none → maintenance.
   Not stored, so it can't drift. Exposed as `task_plan_actual.effective_mission_id`.
4. **Agreement rule in the service, not a trigger:** a task's mission (direct or via its protocol) must equal its
   project's mission when both are set; a project can't move to a mission its tasks disagree with. The protocol ⇒
   mission part is a composite FK.
5. **One active path per mission, retired paths are read-only history** (partial unique index + triggers);
   `switch_path` retires and inserts atomically and archives the old path's protocols. Tasks keep their protocol links.
6. **Only new links must be active.** Closing a mission or retiring a path never breaks existing links or saves.
7. **Single active purpose** (partial unique index); setting a new one archives the old one.

## Consequences
- No backfill: every existing task starts as maintenance.
- Hard-deleting a mission/path/protocol with references is blocked (NO ACTION); the UI only closes/archives.
```

Add `| 0020 | Direction layer: purpose, identities, missions, paths, protocols | accepted |` to `docs/decisions/README.md`.

- [ ] **Step 5: Docs** —
  - `docs/schema.md`: add a section after "SYSTEM analysis F2":
    ```markdown
    ## Direction layer G1 (ADR 0020)
    - `purposes(statement, status active|archived)`: one active per user (partial unique).
    - `identities(name, description, status, sort_order)`; `mission_identities(mission_id, identity_id)` N:M, composite FKs.
    - `missions(title, outcome, deadline date, status active|achieved|dropped, closed_at, purpose_id)`;
      `(status = 'active') = (closed_at is null)`.
    - `mission_criteria(label, kind check|numeric, target_value, current_value, unit, met_at, position)`.
    - `paths(mission_id, title, approach, trade_offs, status active|retired, started_at, retired_at)`: one active per
      mission; retired rows read-only (trigger, 23514). `switch_path(mission, title, approach, trade_offs)` (invoker).
    - `protocols(path_id, mission_id, title, steps text[] ≤ 12, intended_minutes 5–600, status, sort_order)`;
      FK `(path_id, mission_id) → paths`; only archiving is allowed on a retired path.
    - `tasks.mission_id/protocol_id` (FK `(protocol_id, mission_id) → protocols`, protocol ⇒ mission),
      `projects.mission_id`. `task_plan_actual` appends `mission_id, protocol_id, effective_mission_id`.
    - Growth = effective mission set; maintenance otherwise (derived, not stored).
    ```
  - `docs/architecture.md`: add `features/direction` to the feature list: "purpose → protocol hierarchy; `scheduler` and `projects` services call `resolveDirectionLink`; `direction` imports neither."
  - `docs/progress.md`: add above "Improvement F2":
    ```markdown
    ## Improvement G1 — direction layer (docs/superpowers/specs/2026-09-30-direction-layer-g1-design.md)
    - [x] Purposes, identities, missions (+ identities, criteria), paths, protocols; task/project links; `switch_path`; retired guards (SQL tests, ADR 0020)
    - [x] Pure breadcrumb and link rules; terms for directive/mission/path/protocol
    - [x] `/scheduler/directive` (directive, identities, missions, criteria, path + history, protocols)
    - [x] Task drawer picker + breadcrumb, Growth chip in the list, mission on projects
    - [x] E2E `directive.spec.ts`; cleanup restores the owner's purpose
    ```

- [ ] **Step 6: Full verification**

Run, in order: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build`, then the whole E2E suite (`npm run test:e2e` with the env as in Step 3). MCP `get_advisors` (security) once more.
Expected: all pass; no new advisor warnings. If any existing E2E suite fails, check whether it's a G1 regression (e.g. the drawer's form now posts `direction`) before touching that suite.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/directive.spec.ts tests/e2e/helpers.ts docs/decisions/0020-direction-layer.md docs/decisions/README.md docs/schema.md docs/architecture.md docs/progress.md
git commit -m "G1: directive E2E, cleanup, ADR 0020, docs"
```
