# Focus Flow (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pause/resume, task switching, a work summary with Complete / Continue Later, and a `work_logs` table,
and make "actual minutes" mean focused minutes (wall time minus pauses).

**Architecture:** DB functions do each state change atomically (`pause`, `resume`, `stop`, `switch`). Pure TS
utilities (`utils/focus.ts`) derive elapsed/paused/focused time for the UI and the metrics. Work results move
from `work_sessions` columns to `work_logs` with an expand → backfill → contract migration pair. The header timer
becomes a bottom `FocusBar`, and the stop dialog becomes `WorkSummaryDialog`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Supabase Postgres + RLS (remote only, via
Supabase MCP), Zod 4, Vitest, Playwright, shadcn/ui on Base UI, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-29-focus-flow-design.md` (umbrella:
`docs/superpowers/specs/2026-09-30-growth-system-architecture.md`). Read both before starting.

## Global Constraints

- Follow `AGENTS.md`: this is Next 16 (`proxy.ts`, async `params`/`cookies`); run `eslint` directly.
- DB workflow per `AGENTS.md`:
  1. Write `supabase/migrations/<timestamp>_<name>.sql`.
  2. Apply it with MCP `apply_migration` using the same name.
  3. Run `list_migrations` and rename the local file to the remote version.
  4. Regenerate `src/types/database.ts` with MCP `generate_typescript_types`.
  5. Run the SQL tests with MCP `execute_sql`.
  6. Run `get_advisors` (security).
- Never edit an applied migration. Add a new one.
- Every mutation: Zod → `requireUser` (via `runAction`) → service → `ActionResult`. Never accept `user_id` from the client.
- Every DB function: `security invoker`, `set search_path = ''`, `revoke execute … from public, anon`,
  `grant execute … to authenticated`.
- Every new table: RLS with `user_id = (select auth.uid())`, composite `(id, user_id)` ownership FKs, `anon` revoked.
- Planned (`schedule_blocks`) and actual (`work_sessions`) never overwrite each other. Stopping a session never
  completes a task unless the user pressed [할 일 완료].
- One open session per user (existing partial unique index `work_sessions_one_active_per_user_idx`).
- Status is never shown by color alone: icon + text.
- UI copy is Korean. Phrase differences factually ("14분 더 걸림"), never judgmentally.
- E2E data titles start with `[e2e]`.
- Pin exact versions for any new package (none expected).
- Verification before each commit that touches code: `npx tsc --noEmit && npx eslint . && npx vitest run`.
  Before the final commit, also run `npm run build` and the E2E suite.

## Review Focus

1. **A timer left running for more than 16 h, then switched or stopped.** The user should get a clear Korean
   message telling them to correct the end time, not a DB check-constraint error. → Task 2 test `sessionTooLong`;
   Task 5 uses it in `switchWorkSession`.
2. **An end-time correction that falls before (or inside) a recorded pause.** It should be rejected with
   "종료 시각이 일시정지 기록보다 앞설 수 없습니다.", and nothing should change. → Task 1 SQL test "end before pause";
   Task 5 maps the message.
3. **A pause that crosses local midnight or the week boundary.** Day and week totals should subtract only the part
   of the pause inside the window. → Task 3 tests.
4. **Pause pressed twice (double click or two tabs).** The second press should show the CONFLICT toast, and there
   should still be one open pause. → Task 1 SQL test "second open pause"; Task 5 maps 23514 → CONFLICT.
5. **Closing the summary dialog with Escape.** Nothing should be saved and the timer should keep running.
   → Task 9 E2E step.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_focus_pauses.sql` (create) | pauses + work_logs tables, RLS, 4 functions, backfill, view v2 |
| `supabase/migrations/<ts>_drop_session_scores.sql` (create, Task 10) | contract: drop score/note columns from `work_sessions` |
| `supabase/tests/rls/focus_pauses.sql` (create) | SQL tests for the above |
| `src/features/scheduler/utils/focus.ts` (create) | pure: focus stats, window clipping, plan/remaining/difference text, 16 h guard |
| `src/features/scheduler/utils/metrics.ts` (modify) | day summary v2 (pauses, work-log focus) |
| `src/features/scheduler/utils/weekly-metrics.ts` (modify) | week metrics v2 (pauses) |
| `src/features/scheduler/domain/work-session.types.ts` (modify) | `SessionPause`, `WorkLog`, extended `SessionWithTask` |
| `src/features/scheduler/domain/scheduler.constants.ts` (modify) | `PAUSE_REASONS`, `PAUSE_REASON_LABEL` |
| `src/features/scheduler/queries/session.queries.ts` (modify) | load pauses + work log with sessions |
| `src/features/scheduler/queries/week.queries.ts` (modify) | week input from pauses + work logs |
| `src/features/scheduler/schemas/work-session.schema.ts` (modify) | new input schemas |
| `src/features/scheduler/services/work-session.service.ts` (modify) | pause/resume/reason/note/stop(RPC)/switch/manual→work_logs |
| `src/features/scheduler/actions/work-session.actions.ts` (modify) | matching server actions |
| `src/features/scheduler/components/focus-bar.tsx` (create) | bottom bar + expanded sheet + reason chips |
| `src/features/scheduler/components/work-summary-dialog.tsx` (create) | summary, Complete / Continue Later |
| `src/features/scheduler/components/switch-task-dialog.tsx` (create) | finish-first / hold-and-start / cancel |
| `src/features/scheduler/components/work-session-timer.tsx`, `stop-session-dialog.tsx` (delete) | replaced |
| `src/features/scheduler/components/scheduler-workspace.tsx` (modify) | wiring: bar, dialogs, plan lookup |
| `src/features/scheduler/components/today-task-panel.tsx`, `task-list-item.tsx` (modify) | ▶ always visible, partial badge, drop sizing |
| `src/features/scheduler/components/weekly-calendar.tsx` (modify) | fixed-duration drops for partial tasks |
| `src/features/scheduler/components/calendar-event-content.tsx`, `task-detail-drawer.tsx` (modify) | read focus from `work_log` |
| `tests/unit/focus.test.ts` (create), `tests/unit/metrics.test.ts`, `tests/unit/weekly-metrics.test.ts` (modify) | unit tests |
| `tests/e2e/focus-flow.spec.ts` (create), `tests/e2e/work-tracking.spec.ts` (modify) | E2E |
| `docs/schema.md`, `docs/decisions/0011-focus-pauses-and-work-logs.md`, `docs/decisions/README.md`, `docs/progress.md` | docs |

---

### Task 1: Migration — pauses, work logs, DB functions, backfill, view v2

**Files:**
- Create: `supabase/tests/rls/focus_pauses.sql`
- Create: `supabase/migrations/20260930120000_focus_pauses.sql` (renamed to the remote version after apply)
- Modify: `src/types/database.ts` (regenerated)

**Interfaces:**
- Produces (SQL):
  - `pause_work_session(p_session_id uuid, p_reason text default null) returns work_session_pauses`
  - `resume_work_session(p_session_id uuid) returns work_session_pauses`
  - `stop_work_session(p_session_id uuid, p_ended_at timestamptz default null, p_focus smallint default null,
    p_mood smallint default null, p_energy smallint default null, p_note text default null,
    p_complete_task boolean default false) returns work_sessions`
  - `switch_work_session(p_task_id uuid default null, p_block_id uuid default null) returns work_sessions`
  - Errors: `P0002` not found; `23514` with messages `session finished`, `already paused`, `not paused`,
    `end before start`, `end before pause`; `23505` second open session.
  - Tables `work_session_pauses`, `work_logs`, with FK names `work_session_pauses_session_id_user_id_fkey`
    and `work_logs_session_id_user_id_fkey`.
  - View `task_plan_actual` gains `paused_minutes`. `actual_minutes` is now focused minutes, and `average_focus`
    now comes from `work_logs`.

- [ ] **Step 1: Write the SQL test** `supabase/tests/rls/focus_pauses.sql`

```sql
-- Focus flow: pauses, work logs, stop/switch functions, view v2, RLS.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

-- B owns a running session (created as B)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
insert into public.tasks (id, user_id, title)
values ('30000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'B task');
insert into public.work_sessions (id, user_id, task_id, started_at, source)
values ('40000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000b',
        '30000000-0000-4000-a000-00000000000b', now() - interval '10 minutes', 'timer');

-- Switch to A
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
insert into public.tasks (id, user_id, title, user_estimated_minutes)
values
  ('30000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'A task', 60),
  ('30000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a', 'A task 2', 30);

do $$
declare
  s public.work_sessions;
  s2 public.work_sessions;
  p public.work_session_pauses;
  n int;
begin
  -- A cannot pause B's session
  begin
    perform public.pause_work_session('40000000-0000-4000-a000-00000000000b');
    raise exception 'FAIL: paused another user''s session';
  exception when no_data_found then null;
  end;
  assert (select count(*) from public.work_session_pauses) = 0, 'A sees no pauses of B';
  assert (select count(*) from public.work_logs) = 0, 'A sees no logs of B';

  -- Start, pause with reason, second pause rejected
  s := public.start_work_session('30000000-0000-4000-a000-00000000000a', null);
  p := public.pause_work_session(s.id, 'coffee');
  assert p.resumed_at is null and p.reason = 'coffee', 'open pause with reason';
  begin
    perform public.pause_work_session(s.id);
    raise exception 'FAIL: second open pause';
  exception when check_violation then null;
  end;

  -- Resume closes it; resume again rejected
  p := public.resume_work_session(s.id);
  assert p.resumed_at is not null, 'resumed';
  begin
    perform public.resume_work_session(s.id);
    raise exception 'FAIL: resume when not paused';
  exception when check_violation then null;
  end;

  -- Make the timeline deterministic: session 60 min ago, pause 40..30 min ago (10 min)
  update public.work_sessions set started_at = now() - interval '60 minutes' where id = s.id;
  update public.work_session_pauses
     set paused_at = now() - interval '40 minutes', resumed_at = now() - interval '30 minutes'
   where id = p.id;

  -- End before the pause → rejected, nothing changes
  begin
    perform public.stop_work_session(s.id, now() - interval '35 minutes');
    raise exception 'FAIL: end inside a pause';
  exception when check_violation then
    assert sqlerrm = 'end before pause', 'message end before pause';
  end;
  assert (select ended_at from public.work_sessions where id = s.id) is null, 'still running';

  -- Pause again, then stop while paused: open pause closes at ended_at; log upserted; task completed
  p := public.pause_work_session(s.id);
  update public.work_session_pauses set paused_at = now() - interval '5 minutes' where id = p.id;
  perform public.stop_work_session(s.id, null, 4::smallint, 3::smallint, null, 'done', true);
  assert (select resumed_at from public.work_session_pauses where id = p.id)
       = (select ended_at from public.work_sessions where id = s.id), 'open pause closed at end';
  assert (select status from public.tasks where id = s.task_id) = 'completed', 'completed atomically';
  select count(*) into n from public.work_logs where session_id = s.id;
  assert n = 1, 'exactly one log';
  assert (select focus_score from public.work_logs where session_id = s.id) = 4, 'log focus';

  -- Stopping again rejected
  begin
    perform public.stop_work_session(s.id);
    raise exception 'FAIL: double stop';
  exception when check_violation then null;
  end;

  -- View: 60 min wall − 10 − 5 = 45 focused, 15 paused
  assert (select round(actual_minutes) from public.task_plan_actual where task_id = s.task_id) = 45,
    'actual subtracts pauses';
  assert (select round(paused_minutes) from public.task_plan_actual where task_id = s.task_id) = 15,
    'paused minutes';
  assert (select average_focus from public.task_plan_actual where task_id = s.task_id) = 4,
    'average focus from logs';

  -- Switch: start task 2, switch back to task 1's sibling → exactly one open session, no log for the held one
  s2 := public.start_work_session('30000000-0000-4000-a000-0000000000a2', null);
  -- now() is constant inside a transaction; move the start back so ended_at > started_at holds
  update public.work_sessions set started_at = now() - interval '10 minutes' where id = s2.id;
  perform public.pause_work_session(s2.id);
  perform public.switch_work_session('30000000-0000-4000-a000-0000000000a2', null);
  assert (select ended_at from public.work_sessions where id = s2.id) is not null, 'held session ended';
  assert (select count(*) from public.work_session_pauses where session_id = s2.id and resumed_at is null) = 0,
    'held session pause closed';
  assert (select count(*) from public.work_logs where session_id = s2.id) = 0, 'no log on hold';
  select count(*) into n from public.work_sessions where ended_at is null;
  assert n = 1, 'exactly one open session after switch';
  assert (select status from public.tasks where id = '30000000-0000-4000-a000-0000000000a2') = 'in_progress',
    'held task stays in_progress';

  -- Log for another user's task rejected by composite FK
  begin
    insert into public.work_logs (user_id, task_id, note)
    values ('00000000-0000-4000-a000-00000000000a', '30000000-0000-4000-a000-00000000000b', 'x');
    raise exception 'FAIL: log on B task';
  exception when foreign_key_violation then null;
  end;
  -- Log owned by B rejected by RLS
  begin
    insert into public.work_logs (user_id, task_id, note)
    values ('00000000-0000-4000-a000-00000000000b', '30000000-0000-4000-a000-00000000000b', 'x');
    raise exception 'FAIL: log as B';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- anon sees nothing
set local role anon;
do $$
begin
  begin
    perform 1 from public.work_logs limit 1;
    raise exception 'FAIL: anon read work_logs';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.work_session_pauses limit 1;
    raise exception 'FAIL: anon read pauses';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select 'PASS focus_pauses' as result;
rollback;
```

Also add a backfill check to the migration step (Step 4). The backfill runs inside the migration, so it is
verified with a query there rather than in this file.

- [ ] **Step 2: Run the test to verify it fails**

Run with MCP `execute_sql` (paste the file). Expected: error `function public.pause_work_session(uuid) does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20260930120000_focus_pauses.sql`

```sql
-- Focus flow (sub-project A): pause intervals, work logs, atomic stop/switch, actual minutes v2.
-- Spec: docs/superpowers/specs/2026-09-29-focus-flow-design.md

alter table public.work_sessions
  add constraint work_sessions_id_user_id_key unique (id, user_id);

-- Pause intervals. Session state is derived: open pause = paused.
create table public.work_session_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  paused_at timestamptz not null,
  resumed_at timestamptz,
  reason text check (reason in ('coffee', 'phone', 'meeting', 'break', 'other')),
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.work_sessions(id, user_id) on delete cascade,
  check (resumed_at is null or resumed_at >= paused_at)
);
create unique index work_session_pauses_one_open_idx
  on public.work_session_pauses(session_id) where resumed_at is null;
create index work_session_pauses_session_user_idx on public.work_session_pauses(session_id, user_id);

-- Work results (umbrella decision 2). At most one log per session; session_id null = task-level note.
create table public.work_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null,
  session_id uuid unique,
  focus_score smallint check (focus_score between 1 and 5),
  mood_score smallint check (mood_score between 1 and 5),
  energy_score smallint check (energy_score between 1 and 5),
  note text check (note is null or length(note) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (session_id, user_id) references public.work_sessions(id, user_id)
    on delete set null (session_id)
);
create index work_logs_task_user_idx on public.work_logs(task_id, user_id);
create index work_logs_session_user_idx on public.work_logs(session_id, user_id);
create trigger work_logs_set_updated_at before update on public.work_logs
  for each row execute function public.set_updated_at();

alter table public.work_session_pauses enable row level security;
alter table public.work_logs enable row level security;

create policy work_session_pauses_select_own on public.work_session_pauses
  for select to authenticated using (user_id = (select auth.uid()));
create policy work_session_pauses_insert_own on public.work_session_pauses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy work_session_pauses_update_own on public.work_session_pauses
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy work_logs_select_own on public.work_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy work_logs_insert_own on public.work_logs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy work_logs_update_own on public.work_logs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy work_logs_delete_own on public.work_logs
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.work_session_pauses, public.work_logs from anon;

-- Backfill (idempotent): every session with a score or note gets its log.
insert into public.work_logs (user_id, task_id, session_id, focus_score, mood_score, energy_score, note, created_at)
select user_id, task_id, id, focus_score, mood_score, energy_score, note, coalesce(ended_at, created_at)
  from public.work_sessions
 where focus_score is not null or mood_score is not null or energy_score is not null or note is not null
on conflict (session_id) do nothing;

create or replace function public.pause_work_session(p_session_id uuid, p_reason text default null)
returns public.work_session_pauses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ended timestamptz;
  v_pause public.work_session_pauses;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  select ended_at into v_ended
    from public.work_sessions
   where id = p_session_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_ended is not null then
    raise exception 'session finished' using errcode = '23514';
  end if;
  if exists (select 1 from public.work_session_pauses
              where session_id = p_session_id and resumed_at is null) then
    raise exception 'already paused' using errcode = '23514';
  end if;
  insert into public.work_session_pauses (user_id, session_id, paused_at, reason)
  values (v_uid, p_session_id, now(), p_reason)
  returning * into v_pause;
  return v_pause;
end;
$$;

create or replace function public.resume_work_session(p_session_id uuid)
returns public.work_session_pauses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ended timestamptz;
  v_pause public.work_session_pauses;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  select ended_at into v_ended
    from public.work_sessions
   where id = p_session_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_ended is not null then
    raise exception 'session finished' using errcode = '23514';
  end if;
  update public.work_session_pauses
     set resumed_at = now()
   where session_id = p_session_id and resumed_at is null
  returning * into v_pause;
  if not found then
    raise exception 'not paused' using errcode = '23514';
  end if;
  return v_pause;
end;
$$;

create or replace function public.stop_work_session(
  p_session_id uuid,
  p_ended_at timestamptz default null,
  p_focus smallint default null,
  p_mood smallint default null,
  p_energy smallint default null,
  p_note text default null,
  p_complete_task boolean default false
)
returns public.work_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.work_sessions;
  v_end timestamptz;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  select * into v_session
    from public.work_sessions
   where id = p_session_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_session.ended_at is not null then
    raise exception 'session finished' using errcode = '23514';
  end if;

  v_end := coalesce(p_ended_at, now());
  if v_end <= v_session.started_at then
    raise exception 'end before start' using errcode = '23514';
  end if;
  if exists (select 1 from public.work_session_pauses
              where session_id = p_session_id
                and (paused_at > v_end or resumed_at > v_end)) then
    raise exception 'end before pause' using errcode = '23514';
  end if;

  update public.work_session_pauses
     set resumed_at = v_end
   where session_id = p_session_id and resumed_at is null;

  update public.work_sessions
     set ended_at = v_end
   where id = p_session_id
  returning * into v_session;

  if p_focus is not null or p_mood is not null or p_energy is not null or p_note is not null then
    insert into public.work_logs (user_id, task_id, session_id, focus_score, mood_score, energy_score, note)
    values (v_uid, v_session.task_id, p_session_id, p_focus, p_mood, p_energy, p_note)
    on conflict (session_id) do update
      set focus_score = excluded.focus_score,
          mood_score = excluded.mood_score,
          energy_score = excluded.energy_score,
          note = coalesce(excluded.note, public.work_logs.note);
  end if;

  if p_complete_task then
    update public.tasks
       set status = 'completed', completed_at = now()
     where id = v_session.task_id and user_id = v_uid
       and status in ('inbox', 'planned', 'in_progress');
  end if;

  return v_session;
end;
$$;

create or replace function public.switch_work_session(
  p_task_id uuid default null,
  p_block_id uuid default null
)
returns public.work_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_open uuid;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  select id into v_open
    from public.work_sessions
   where user_id = v_uid and ended_at is null
   for update;
  if not found then
    raise exception 'no open session' using errcode = 'P0002';
  end if;

  update public.work_session_pauses
     set resumed_at = now()
   where session_id = v_open and resumed_at is null;
  update public.work_sessions set ended_at = now() where id = v_open;

  return public.start_work_session(p_task_id, p_block_id);
end;
$$;

revoke execute on function public.pause_work_session(uuid, text) from public, anon;
revoke execute on function public.resume_work_session(uuid) from public, anon;
revoke execute on function public.stop_work_session(uuid, timestamptz, smallint, smallint, smallint, text, boolean)
  from public, anon;
revoke execute on function public.switch_work_session(uuid, uuid) from public, anon;
grant execute on function public.pause_work_session(uuid, text) to authenticated;
grant execute on function public.resume_work_session(uuid) to authenticated;
grant execute on function public.stop_work_session(uuid, timestamptz, smallint, smallint, smallint, text, boolean)
  to authenticated;
grant execute on function public.switch_work_session(uuid, uuid) to authenticated;

-- Actual minutes v2: focused = wall − pauses. Column order is kept; paused_minutes is appended.
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
  coalesce(a.paused_minutes, 0)::numeric as paused_minutes
from public.tasks t
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

- [ ] **Step 4: Apply, rename, verify the backfill, regenerate types**

1. MCP `apply_migration` with name `focus_pauses` and the file body.
2. MCP `list_migrations`. Rename the local file to `<remote_version>_focus_pauses.sql`
   (for example `git mv supabase/migrations/20260930120000_focus_pauses.sql supabase/migrations/<version>_focus_pauses.sql`).
3. Check the backfill with MCP `execute_sql`. Expected: `missing = 0`.
   ```sql
   select count(*) as missing
     from public.work_sessions s
    where (s.focus_score is not null or s.mood_score is not null or s.energy_score is not null or s.note is not null)
      and not exists (select 1 from public.work_logs l where l.session_id = s.id);
   ```
4. MCP `generate_typescript_types`, then write the result to `src/types/database.ts`.

- [ ] **Step 5: Run the SQL tests to verify they pass**

Run `supabase/tests/rls/focus_pauses.sql`, then re-run `work_sessions.sql` and `scheduler_core.sql`, all via MCP
`execute_sql`. Expected: `PASS focus_pauses`, `PASS …` for the others.

- [ ] **Step 6: Security advisors**

MCP `get_advisors` (type `security`). Expected: no new warnings for `work_session_pauses`, `work_logs` or the four
functions. Existing legacy warnings are known.

- [ ] **Step 7: Commit**

```bash
npx tsc --noEmit
git add supabase/migrations supabase/tests/rls/focus_pauses.sql src/types/database.ts
git commit -m "A1: pauses, work logs, atomic stop/switch, actual minutes v2"
```
`tsc` must still pass, because the old columns still exist.

---

### Task 2: Pure focus utilities

**Files:**
- Create: `src/features/scheduler/utils/focus.ts`
- Test: `tests/unit/focus.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PauseLike = { paused_at: string; resumed_at: string | null };
  export type FocusStats = { elapsedMs: number; pausedMs: number; focusedMs: number; paused: boolean };
  export function focusStats(session: { started_at: string; ended_at: string | null }, pauses: PauseLike[], now?: Date): FocusStats;
  export function focusedMinutesInWindow(session: { started_at: string; ended_at: string | null }, pauses: PauseLike[], from: number, to: number, now: number): number;
  export function sessionPlanMinutes(input: { block: { starts_at: string; ends_at: string } | null; estimateMinutes: number | null; priorActualMinutes: number }): number | null;
  export function remainingMinutes(estimateMinutes: number | null, actualMinutes: number): number | null;
  export function partialDropMinutes(remaining: number | null, minBlockMinutes: number): number | null;
  export function describeDifference(plannedMinutes: number, actualMinutes: number): string;
  export function describeRemaining(plannedMinutes: number, focusedMinutes: number): string;
  export function sessionTooLong(startedAt: string, now: Date): boolean;
  ```

- [ ] **Step 1: Write the failing tests** `tests/unit/focus.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  describeDifference,
  describeRemaining,
  focusStats,
  focusedMinutesInWindow,
  partialDropMinutes,
  remainingMinutes,
  sessionPlanMinutes,
  sessionTooLong,
} from "@/features/scheduler/utils/focus";

const t = (hhmm: string) => `2026-09-29T${hhmm}:00.000Z`;
const ms = (iso: string) => new Date(iso).getTime();

describe("focusStats", () => {
  it("spec §11 example: 19:12 start, 19:43–19:51 pause, 20:34 stop → 82 elapsed, 8 paused, 74 focused", () => {
    const s = focusStats({ started_at: t("19:12"), ended_at: t("20:34") }, [
      { paused_at: t("19:43"), resumed_at: t("19:51") },
    ]);
    expect(s.elapsedMs / 60_000).toBe(82);
    expect(s.pausedMs / 60_000).toBe(8);
    expect(s.focusedMs / 60_000).toBe(74);
    expect(s.paused).toBe(false);
  });

  it("running and paused: the open pause runs until now and the clock is frozen", () => {
    const s = focusStats({ started_at: t("10:00"), ended_at: null }, [{ paused_at: t("10:30"), resumed_at: null }],
      new Date(t("10:50")));
    expect(s.paused).toBe(true);
    expect(s.focusedMs / 60_000).toBe(30);
    expect(s.pausedMs / 60_000).toBe(20);
  });

  it("never negative", () => {
    const s = focusStats({ started_at: t("10:00"), ended_at: null }, [], new Date(t("09:59")));
    expect(s.elapsedMs).toBe(0);
    expect(s.focusedMs).toBe(0);
  });
});

describe("focusedMinutesInWindow", () => {
  it("subtracts only the part of a pause inside the window (pause crosses the window edge)", () => {
    // session 23:00–01:00 UTC, pause 23:50–00:20; window = [00:00, 24:00) of the 30th
    const session = { started_at: "2026-09-29T23:00:00Z", ended_at: "2026-09-30T01:00:00Z" };
    const pauses = [{ paused_at: "2026-09-29T23:50:00Z", resumed_at: "2026-09-30T00:20:00Z" }];
    const from = ms("2026-09-30T00:00:00Z");
    const to = ms("2026-10-01T00:00:00Z");
    expect(focusedMinutesInWindow(session, pauses, from, to, to)).toBe(40);
    expect(focusedMinutesInWindow(session, pauses, ms("2026-09-29T00:00:00Z"), from, to)).toBe(50);
  });

  it("a running session is counted up to now, minus its open pause", () => {
    const session = { started_at: t("10:00"), ended_at: null };
    const pauses = [{ paused_at: t("10:40"), resumed_at: null }];
    expect(focusedMinutesInWindow(session, pauses, ms(t("00:00")), ms(t("23:59")), ms(t("11:00")))).toBe(40);
  });
});

describe("plan / remaining", () => {
  it("block duration wins", () => {
    expect(sessionPlanMinutes({ block: { starts_at: t("19:00"), ends_at: t("20:20") }, estimateMinutes: 60, priorActualMinutes: 30 })).toBe(80);
  });
  it("otherwise estimate minus earlier actual, floored at 0", () => {
    expect(sessionPlanMinutes({ block: null, estimateMinutes: 60, priorActualMinutes: 45 })).toBe(15);
    expect(sessionPlanMinutes({ block: null, estimateMinutes: 60, priorActualMinutes: 90 })).toBe(0);
  });
  it("hidden without block or estimate", () => {
    expect(sessionPlanMinutes({ block: null, estimateMinutes: null, priorActualMinutes: 0 })).toBeNull();
  });
  it("remainingMinutes", () => {
    expect(remainingMinutes(80, 45)).toBe(35);
    expect(remainingMinutes(80, 90)).toBe(0);
    expect(remainingMinutes(null, 10)).toBeNull();
  });
  it("partialDropMinutes rounds up to 5 and respects the minimum block", () => {
    expect(partialDropMinutes(33, 15)).toBe(35);
    expect(partialDropMinutes(7, 15)).toBe(15);
    expect(partialDropMinutes(0, 15)).toBeNull();
    expect(partialDropMinutes(null, 15)).toBeNull();
  });
});

describe("wording (factual, never judgmental)", () => {
  it("difference", () => {
    expect(describeDifference(80, 94)).toBe("+14분 (18%) 더 걸림");
    expect(describeDifference(60, 54)).toBe("6분 덜 걸림");
    expect(describeDifference(60, 60.4)).toBe("계획과 같음");
  });
  it("remaining / overrun", () => {
    expect(describeRemaining(80, 42)).toBe("38분 남음");
    expect(describeRemaining(80, 92)).toBe("12분 초과");
  });
});

describe("sessionTooLong", () => {
  it("true after 16 hours", () => {
    expect(sessionTooLong(t("00:00"), new Date("2026-09-29T16:01:00Z"))).toBe(true);
    expect(sessionTooLong(t("00:00"), new Date("2026-09-29T15:59:00Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/focus.test.ts`
Expected: FAIL, `Failed to resolve import "@/features/scheduler/utils/focus"`.

- [ ] **Step 3: Implement** `src/features/scheduler/utils/focus.ts`

```ts
/**
 * Focused time (actual minutes v2): wall time minus pause intervals. Pure; shared by
 * the focus bar, the work summary and the day/week metrics. Spec: focus-flow design §1.
 */
import { MAX_SESSION_MINUTES } from "../domain/work-session.types";

export type PauseLike = { paused_at: string; resumed_at: string | null };
export type FocusStats = { elapsedMs: number; pausedMs: number; focusedMs: number; paused: boolean };

const MIN = 60_000;
const at = (iso: string) => new Date(iso).getTime();
const overlap = (s: number, e: number, from: number, to: number) => Math.max(0, Math.min(e, to) - Math.max(s, from));

export function focusStats(
  session: { started_at: string; ended_at: string | null },
  pauses: PauseLike[],
  now: Date = new Date(),
): FocusStats {
  const start = at(session.started_at);
  const end = session.ended_at ? at(session.ended_at) : now.getTime();
  const elapsedMs = Math.max(0, end - start);
  let pausedMs = 0;
  let paused = false;
  for (const p of pauses) {
    if (p.resumed_at === null && session.ended_at === null) paused = true;
    const pe = p.resumed_at ? at(p.resumed_at) : end;
    pausedMs += overlap(at(p.paused_at), pe, start, end);
  }
  pausedMs = Math.min(pausedMs, elapsedMs);
  return { elapsedMs, pausedMs, focusedMs: elapsedMs - pausedMs, paused };
}

/** Focused minutes of one session inside [from, to). A running session counts up to `now`. */
export function focusedMinutesInWindow(
  session: { started_at: string; ended_at: string | null },
  pauses: PauseLike[],
  from: number,
  to: number,
  now: number,
): number {
  const start = at(session.started_at);
  const end = session.ended_at ? at(session.ended_at) : now;
  const lo = Math.max(start, from);
  const hi = Math.min(end, to);
  if (hi <= lo) return 0;
  let paused = 0;
  for (const p of pauses) paused += overlap(at(p.paused_at), p.resumed_at ? at(p.resumed_at) : end, lo, hi);
  return Math.max(0, hi - lo - paused) / MIN;
}

/** "Planned" for one session: the linked block, else what is left of the estimate. */
export function sessionPlanMinutes(input: {
  block: { starts_at: string; ends_at: string } | null;
  estimateMinutes: number | null;
  priorActualMinutes: number;
}): number | null {
  if (input.block) return (at(input.block.ends_at) - at(input.block.starts_at)) / MIN;
  if (input.estimateMinutes === null) return null;
  return Math.max(0, input.estimateMinutes - input.priorActualMinutes);
}

export function remainingMinutes(estimateMinutes: number | null, actualMinutes: number): number | null {
  if (estimateMinutes === null) return null;
  return Math.max(0, Math.round(estimateMinutes - actualMinutes));
}

/** Block length when dropping a partially done task: the remainder, rounded up to 5, at least the minimum block. */
export function partialDropMinutes(remaining: number | null, minBlockMinutes: number): number | null {
  if (remaining === null || remaining <= 0) return null;
  return Math.max(minBlockMinutes, Math.ceil(remaining / 5) * 5);
}

export function describeDifference(plannedMinutes: number, actualMinutes: number): string {
  const diff = Math.round(actualMinutes - plannedMinutes);
  if (diff === 0) return "계획과 같음";
  if (diff < 0) return `${-diff}분 덜 걸림`;
  const pct = plannedMinutes > 0 ? ` (${Math.round((diff / plannedMinutes) * 100)}%)` : "";
  return `+${diff}분${pct} 더 걸림`;
}

export function describeRemaining(plannedMinutes: number, focusedMinutes: number): string {
  const left = Math.round(plannedMinutes - focusedMinutes);
  return left >= 0 ? `${left}분 남음` : `${-left}분 초과`;
}

/** A timer past the 16 h sanity bound must be stopped with a corrected end time first. */
export function sessionTooLong(startedAt: string, now: Date): boolean {
  return now.getTime() - at(startedAt) > MAX_SESSION_MINUTES * MIN;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/focus.test.ts`
Expected: PASS. If `describeDifference(80, 94)` gives a different percent, check the rounding: 14/80 = 17.5, which rounds to 18.

- [ ] **Step 5: Commit**

```bash
git add src/features/scheduler/utils/focus.ts tests/unit/focus.test.ts
git commit -m "A2: pure focus-time utilities"
```

---

### Task 3: Metrics v2 (pauses and work-log scores)

**Files:**
- Modify: `src/features/scheduler/utils/metrics.ts`
- Modify: `src/features/scheduler/utils/weekly-metrics.ts`
- Test: `tests/unit/metrics.test.ts`, `tests/unit/weekly-metrics.test.ts`

**Interfaces:**
- Consumes: `PauseLike`, `focusedMinutesInWindow` (Task 2).
- Produces:
  - `computeDaySummary` sessions become `{ started_at; ended_at; pauses: PauseLike[]; work_log: { focus_score: number | null } | null }[]`.
  - `WeekInput.sessions[]` gains `pauses: PauseLike[]`. The score fields keep their names, but are filled from the work log by the query (Task 4).
  - `METRICS_VERSION = "v2"`.

- [ ] **Step 1: Update the test fixtures and add failing tests**

In `tests/unit/metrics.test.ts`, replace the `ses` helper and add a pause test:

```ts
const ses = (
  s: string,
  e: string | null,
  focus: number | null = null,
  pauses: { paused_at: string; resumed_at: string | null }[] = [],
) => ({
  started_at: s,
  ended_at: e,
  pauses,
  work_log: focus === null ? null : { focus_score: focus },
});

describe("computeDaySummary v2 (pauses)", () => {
  it("actual subtracts pauses; a pause crossing midnight only counts inside the day", () => {
    const r = computeDaySummary({
      blocks: [],
      sessions: [
        // 03:00–05:00Z = 23:00–01:00 Toronto; pause 03:50–04:20Z crosses local midnight (04:00Z)
        ses("2026-09-29T03:00:00Z", "2026-09-29T05:00:00Z", null, [
          { paused_at: "2026-09-29T03:50:00Z", resumed_at: "2026-09-29T04:20:00Z" },
        ]),
      ],
      range,
    });
    // inside [04:00Z, …): 04:00–05:00 = 60 min, minus 04:00–04:20 = 20 → 40
    expect(r.actualMinutes).toBe(40);
  });

  it("running minutes exclude an open pause", () => {
    const r = computeDaySummary({
      blocks: [],
      sessions: [ses("2026-09-29T20:00:00Z", null, null, [{ paused_at: "2026-09-29T20:10:00Z", resumed_at: null }])],
      range,
      now: new Date("2026-09-29T20:30:00Z"),
    });
    expect(r.runningMinutes).toBe(10);
  });
});
```

In `tests/unit/weekly-metrics.test.ts`, add `pauses` to the `ses` helper and a new test:

```ts
const ses = (
  start: string,
  end: string | null,
  focus: number | null,
  type: string | null = null,
  pauses: { paused_at: string; resumed_at: string | null }[] = [],
) => ({
  started_at: start,
  ended_at: end,
  pauses,
  focus_score: focus,
  mood_score: null,
  energy_score: null,
  templateName: type,
});

it("v2: actual and deep work use focused minutes", () => {
  const m = computeWeeklyMetrics({
    ...base,
    sessions: [
      ses("2026-09-29T14:00:00Z", "2026-09-29T15:00:00Z", null, null, [
        { paused_at: "2026-09-29T14:20:00Z", resumed_at: "2026-09-29T14:35:00Z" },
      ]),
    ],
  });
  expect(m.version).toBe("v2");
  expect(m.actualMinutes).toBe(45);
  expect(m.deepWorkMinutes).toBe(0); // 45 < 50 focused minutes
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/metrics.test.ts tests/unit/weekly-metrics.test.ts`
Expected: FAIL. The TS types reject `pauses`/`work_log`, and the new assertions fail (actual 60 instead of 40, version v1).

- [ ] **Step 3: Implement**

`src/features/scheduler/utils/metrics.ts`: replace the header doc bullet for actual/averageFocus, `SessionLike`, and the session loop:

```ts
 * - actual:  Σ focused minutes (wall − pauses, v2) of finished sessions inside the window
 * - running: live focused minutes of the running session inside the window (UI only, never finalized)
 * - averageFocus: mean work-log focus_score of finished sessions that started in the window
 */
import { focusedMinutesInWindow, type PauseLike } from "./focus";

type BlockLike = { starts_at: string; ends_at: string; status: string };
type SessionLike = {
  started_at: string;
  ended_at: string | null;
  pauses: PauseLike[];
  work_log: { focus_score: number | null } | null;
};
```

```ts
  for (const s of input.sessions) {
    const start = new Date(s.started_at).getTime();
    const m = focusedMinutesInWindow(s, s.pauses, from, to, now);
    if (s.ended_at === null) {
      runningMinutes += m;
      continue;
    }
    actualMinutes += m;
    const focusScore = s.work_log?.focus_score ?? null;
    if (focusScore !== null && start >= from && start < to) focus.push(focusScore);
  }
```

`src/features/scheduler/utils/weekly-metrics.ts`:
- Set `export const METRICS_VERSION = "v2";`.
- Add `pauses: PauseLike[];` to the `WeekInput.sessions` item type, and import
  `import { focusedMinutesInWindow, type PauseLike } from "./focus";`.
- Replace `const m = clip(s.started_at, s.ended_at, from, to);` with
  `const m = focusedMinutesInWindow(s, s.pauses, from, to, to);`.
  `from`/`to` are the numeric window bounds already used by `clip`. If `clip` takes ISO strings, compute
  `const fromMs = new Date(input.range.start).getTime(); const toMs = new Date(input.range.end).getTime();` once
  and pass those.
- Update the file's doc comment: "actual = focused minutes (v2: wall − pauses)".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: all unit tests pass (the 71 existing tests plus the new ones).

- [ ] **Step 5: Commit**

```bash
git add src/features/scheduler/utils/metrics.ts src/features/scheduler/utils/weekly-metrics.ts tests/unit/metrics.test.ts tests/unit/weekly-metrics.test.ts
git commit -m "A3: day/week metrics v2 subtract pauses"
```
`tsc` will fail until Task 4 updates the callers. Commit Tasks 3 and 4 together if you prefer a green `tsc` at
every commit. The executor's rule is that `vitest` passes here and `tsc` passes after Task 4.

---

### Task 4: Types and queries (sessions carry pauses + work log)

**Files:**
- Modify: `src/features/scheduler/domain/work-session.types.ts`
- Modify: `src/features/scheduler/domain/scheduler.constants.ts`
- Modify: `src/features/scheduler/queries/session.queries.ts`
- Modify: `src/features/scheduler/queries/week.queries.ts`
- Modify: `src/features/scheduler/queries/analytics.queries.ts`
- Modify: `src/features/scheduler/components/calendar-event-content.tsx:59`
- Modify: `src/features/scheduler/components/task-detail-drawer.tsx:340`

**Interfaces:**
- Produces:
  ```ts
  export type PauseReason = (typeof PAUSE_REASONS)[number];
  export type SessionPause = { id: string; paused_at: string; resumed_at: string | null; reason: PauseReason | null };
  export type WorkLog = { id: string; focus_score: number | null; mood_score: number | null; energy_score: number | null; note: string | null };
  export type SessionWithTask = WorkSession & { task: { id: string; title: string }; pauses: SessionPause[]; work_log: WorkLog | null };
  // TaskPlanActual gains paused_minutes: number
  export const PAUSE_REASONS = ["coffee", "phone", "meeting", "break", "other"] as const;
  export const PAUSE_REASON_LABEL: Record<PauseReason, string>;
  ```

- [ ] **Step 1: Constants and types**

`scheduler.constants.ts`, appended:

```ts
/** Optional pause reasons (requirements §12). Never required. */
export const PAUSE_REASONS = ["coffee", "phone", "meeting", "break", "other"] as const;
export const PAUSE_REASON_LABEL: Record<(typeof PAUSE_REASONS)[number], string> = {
  coffee: "커피",
  phone: "전화",
  meeting: "회의",
  break: "휴식",
  other: "기타",
};
```

`work-session.types.ts`: add the types and extend `SessionWithTask` and `TaskPlanActual`:

```ts
import type { PAUSE_REASONS } from "./scheduler.constants";

export type PauseReason = (typeof PAUSE_REASONS)[number];
export type SessionPause = { id: string; paused_at: string; resumed_at: string | null; reason: PauseReason | null };
export type WorkLog = {
  id: string;
  focus_score: number | null;
  mood_score: number | null;
  energy_score: number | null;
  note: string | null;
};

/** Session with its task, pause intervals and work log (focus-flow design §1). */
export type SessionWithTask = WorkSession & {
  task: { id: string; title: string };
  pauses: SessionPause[];
  work_log: WorkLog | null;
};
```
Add `paused_minutes: number;` to `TaskPlanActual`.

- [ ] **Step 2: Session queries**

`session.queries.ts`: one select literal plus a normalizer. PostgREST may return `work_log` as an array when it
can't prove one-to-one.

```ts
const SESSION_SELECT =
  "*, task:tasks!work_sessions_task_id_user_id_fkey(id, title), pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(id, paused_at, resumed_at, reason), work_log:work_logs!work_logs_session_id_user_id_fkey(id, focus_score, mood_score, energy_score, note)";

type SessionRow = Omit<SessionWithTask, "work_log" | "pauses"> & {
  pauses: SessionWithTask["pauses"] | null;
  work_log: SessionWithTask["work_log"] | SessionWithTask["work_log"][];
};

function normalize(row: SessionRow): SessionWithTask {
  const log = Array.isArray(row.work_log) ? (row.work_log[0] ?? null) : row.work_log;
  const pauses = [...(row.pauses ?? [])].sort((a, b) => a.paused_at.localeCompare(b.paused_at));
  return { ...row, pauses, work_log: log };
}
```
Return `(data as unknown as SessionRow[]).map(normalize)` in `listSessionsInRange`, and
`data ? normalize(data as unknown as SessionRow) : null` in `getActiveSession`.

- [ ] **Step 3: Week query**

In `week.queries.ts`, replace the sessions select literal:

```ts
      .select(
        "started_at, ended_at, pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at), work_log:work_logs!work_logs_session_id_user_id_fkey(focus_score, mood_score, energy_score), task:tasks!work_sessions_task_id_user_id_fkey(template:task_templates!tasks_template_id_user_id_fkey(name))",
      )
      .eq("user_id", userId)
```
Add the `.eq("user_id", userId)` shown above. Every read in this file must be user-scoped (jobs run it under the
service role). Then replace the mapping:

```ts
    sessions: (sessions.data ?? []).map((s) => {
      const log = Array.isArray(s.work_log) ? (s.work_log[0] ?? null) : s.work_log;
      return {
        started_at: s.started_at,
        ended_at: s.ended_at,
        pauses: s.pauses ?? [],
        focus_score: log?.focus_score ?? null,
        mood_score: log?.mood_score ?? null,
        energy_score: log?.energy_score ?? null,
        templateName: s.task?.template?.name ?? null,
      };
    }),
```

- [ ] **Step 4: Plan/actual query**

In `analytics.queries.ts`, add `paused_minutes` to the select literal (append `, paused_minutes`) and to the mapping:
`paused_minutes: Number(row.paused_minutes ?? 0),`.

- [ ] **Step 5: Readers of the session focus score**

- `calendar-event-content.tsx`: change
  `{session.focus_score !== null && \` · 집중 ${session.focus_score}\`}` to
  `{session.work_log?.focus_score != null && \` · 집중 ${session.work_log.focus_score}\`}`.
- `task-detail-drawer.tsx` session list:
  - Change `{x.focus_score !== null && \` · 집중 ${x.focus_score}\`}` to
    `{x.work_log?.focus_score != null && \` · 집중 ${x.work_log.focus_score}\`}`.
  - Change the minutes to focused minutes: replace `formatMinutes(minutesBetween(x.started_at, x.ended_at))` with
    `formatMinutes(Math.round(focusStats(x, x.pauses).focusedMs / 60_000))`, and import
    `import { focusStats } from "../utils/focus";`.
- `today-metrics-bar.tsx` passes `sessions` (now `SessionWithTask[]`) straight to `computeDaySummary`; no change
  needed beyond the types lining up.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: all pass. If `tsc` reports `stopWorkSession`/`createManualWorkSession` still writing session score
columns, that is fine: the columns still exist until Task 10.

- [ ] **Step 7: Commit**

```bash
git add src/features/scheduler src/types/database.ts
git commit -m "A4: sessions carry pauses and work log; queries read work_logs"
```

---

### Task 5: Schemas, service and actions

**Files:**
- Modify: `src/features/scheduler/schemas/work-session.schema.ts`
- Modify: `src/features/scheduler/services/work-session.service.ts`
- Modify: `src/features/scheduler/actions/work-session.actions.ts`

**Interfaces:**
- Consumes: DB functions (Task 1), `sessionTooLong` (Task 2), `PAUSE_REASONS` (Task 4).
- Produces (server actions, each returning `ActionResult<…>`):
  - `pauseWorkSessionAction({ sessionId, reason? })` → `SessionPause`
  - `resumeWorkSessionAction({ sessionId })` → `SessionPause`
  - `setPauseReasonAction({ pauseId, reason })` → `void`
  - `saveWorkLogNoteAction({ sessionId, note })` → `void`
  - `stopWorkSessionAction({ sessionId, endedAt?, focusScore?, moodScore?, energyScore?, note?, completeTask? })` → `WorkSession`
  - `switchWorkSessionAction({ taskId?, blockId? })` → `WorkSession`
  - Unchanged names: `startWorkSessionAction`, `createManualWorkSessionAction`, `deleteWorkSessionAction`.

- [ ] **Step 1: Schemas**

Replace `work-session.schema.ts` with:

```ts
import { z } from "zod";
import { PAUSE_REASONS } from "../domain/scheduler.constants";

const instant = z.iso.datetime({ offset: true });
const optionalScore = z.coerce.number().int().min(1).max(5).nullable().optional();
const note = z.string().trim().max(5000).nullable().optional();

export const startWorkSessionSchema = z
  .object({ taskId: z.uuid().optional(), blockId: z.uuid().optional() })
  .refine((v) => v.taskId || v.blockId, "작업 또는 일정 블록이 필요합니다.");
export type StartWorkSessionInput = z.infer<typeof startWorkSessionSchema>;

/** Switch = hold the open session (no summary) and start another one, atomically. */
export const switchWorkSessionSchema = startWorkSessionSchema;

export const stopWorkSessionSchema = z.object({
  sessionId: z.uuid(),
  /** Defaults to now. Editable for a timer that was left running. */
  endedAt: instant.optional(),
  focusScore: optionalScore,
  moodScore: optionalScore,
  energyScore: optionalScore,
  note,
  /** [할 일 완료]: stop and complete in one transaction. */
  completeTask: z.boolean().optional(),
});
export type StopWorkSessionInput = z.infer<typeof stopWorkSessionSchema>;

export const pauseWorkSessionSchema = z.object({
  sessionId: z.uuid(),
  reason: z.enum(PAUSE_REASONS).optional(),
});
export type PauseWorkSessionInput = z.infer<typeof pauseWorkSessionSchema>;

export const setPauseReasonSchema = z.object({ pauseId: z.uuid(), reason: z.enum(PAUSE_REASONS) });
export type SetPauseReasonInput = z.infer<typeof setPauseReasonSchema>;

export const saveWorkLogNoteSchema = z.object({ sessionId: z.uuid(), note: z.string().trim().max(5000) });
export type SaveWorkLogNoteInput = z.infer<typeof saveWorkLogNoteSchema>;

export const manualWorkSessionSchema = z.object({
  taskId: z.uuid(),
  startedAt: instant,
  endedAt: instant,
  focusScore: optionalScore,
  moodScore: optionalScore,
  energyScore: optionalScore,
  note,
});
export type ManualWorkSessionInput = z.infer<typeof manualWorkSessionSchema>;

export const sessionIdSchema = z.object({ sessionId: z.uuid() });
```

- [ ] **Step 2: Service**

In `work-session.service.ts`:

Add imports:
```ts
import type { SessionPause } from "../domain/work-session.types";
import type {
  PauseWorkSessionInput,
  SaveWorkLogNoteInput,
  SetPauseReasonInput,
} from "../schemas/work-session.schema";
import { sessionTooLong } from "../utils/focus";
```

Add an RPC error mapper next to `assertSessionRange`:
```ts
/** Map the focus functions' check_violation messages to user-facing errors. */
function fromSessionFnError(error: { code?: string; message?: string }): AppError {
  if (error.code === "23505") return new AppError("ACTIVE_TIMER_EXISTS");
  if (error.code === "23514") {
    if (error.message === "end before pause") {
      return new AppError("INVALID_TIME_RANGE", "종료 시각이 일시정지 기록보다 앞설 수 없습니다.");
    }
    if (error.message === "end before start") return new AppError("INVALID_TIME_RANGE");
    if (error.message === "task is closed") {
      return new AppError("CONFLICT", "완료되었거나 취소된 작업은 시작할 수 없습니다.");
    }
    return new AppError("CONFLICT", "타이머 상태가 바뀌었습니다. 새로고침 후 다시 시도해 주세요.");
  }
  return fromDbError(error as Parameters<typeof fromDbError>[0]);
}
```

Replace `stopWorkSession`:
```ts
/** Stop (and optionally complete the task) in one DB transaction; closes an open pause. */
export async function stopWorkSession(
  ctx: ActionContext,
  input: StopWorkSessionInput,
): Promise<WorkSession> {
  const running = await ctx.supabase
    .from("work_sessions")
    .select("id, started_at")
    .eq("id", input.sessionId)
    .eq("user_id", ctx.user.id)
    .is("ended_at", null)
    .maybeSingle();
  if (running.error) throw fromDbError(running.error);
  if (!running.data) throw new AppError("CONFLICT", "이미 종료된 타이머입니다.");

  const endedAt = input.endedAt ?? new Date().toISOString();
  assertSessionRange(running.data.started_at, endedAt);

  const { data, error } = await ctx.supabase
    .rpc("stop_work_session", {
      p_session_id: input.sessionId,
      p_ended_at: endedAt,
      p_focus: input.focusScore ?? undefined,
      p_mood: input.moodScore ?? undefined,
      p_energy: input.energyScore ?? undefined,
      p_note: input.note || undefined,
      p_complete_task: input.completeTask ?? false,
    })
    .single();
  if (error) throw fromSessionFnError(error);
  await refreshIfCompleted(ctx, data.task_id);
  return data as WorkSession;
}
```

Add the new functions:
```ts
export async function pauseWorkSession(ctx: ActionContext, input: PauseWorkSessionInput): Promise<SessionPause> {
  const { data, error } = await ctx.supabase
    .rpc("pause_work_session", { p_session_id: input.sessionId, p_reason: input.reason })
    .single();
  if (error) throw fromSessionFnError(error);
  return data as SessionPause;
}

export async function resumeWorkSession(ctx: ActionContext, sessionId: string): Promise<SessionPause> {
  const { data, error } = await ctx.supabase.rpc("resume_work_session", { p_session_id: sessionId }).single();
  if (error) throw fromSessionFnError(error);
  return data as SessionPause;
}

/** Optional reason chosen after pausing (requirements §12). */
export async function setPauseReason(ctx: ActionContext, input: SetPauseReasonInput): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("work_session_pauses")
    .update({ reason: input.reason })
    .eq("id", input.pauseId)
    .eq("user_id", ctx.user.id)
    .select("id");
  if (error) throw fromDbError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
}

/** Note typed while the timer runs; upserts the session's work log (note only). */
export async function saveWorkLogNote(ctx: ActionContext, input: SaveWorkLogNoteInput): Promise<void> {
  const session = await ctx.supabase
    .from("work_sessions")
    .select("id, task_id")
    .eq("id", input.sessionId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (session.error) throw fromDbError(session.error);
  if (!session.data) throw new AppError("NOT_FOUND");
  const { error } = await ctx.supabase.from("work_logs").upsert(
    {
      user_id: ctx.user.id,
      task_id: session.data.task_id,
      session_id: session.data.id,
      note: input.note || null,
    },
    { onConflict: "session_id" },
  );
  if (error) throw fromDbError(error);
}

/** Hold the open session (no summary) and start another, atomically (focus-flow design §2). */
export async function switchWorkSession(
  ctx: ActionContext,
  input: StartWorkSessionInput,
): Promise<WorkSession> {
  const open = await ctx.supabase
    .from("work_sessions")
    .select("started_at")
    .eq("user_id", ctx.user.id)
    .is("ended_at", null)
    .maybeSingle();
  if (open.error) throw fromDbError(open.error);
  if (!open.data) throw new AppError("CONFLICT", "실행 중인 타이머가 없습니다.");
  if (sessionTooLong(open.data.started_at, new Date())) {
    throw new AppError(
      "INVALID_TIME_RANGE",
      "타이머가 16시간을 넘었습니다. 먼저 종료 시각을 고쳐서 마쳐 주세요.",
    );
  }
  const { data, error } = await ctx.supabase
    .rpc("switch_work_session", { p_task_id: input.taskId ?? undefined, p_block_id: input.blockId ?? undefined })
    .single();
  if (error) throw fromSessionFnError(error);
  return data as WorkSession;
}
```

Change `startWorkSession`'s error branch to `if (error) throw fromSessionFnError(error);`. The old inline mapping
had the same meaning.

Change `createManualWorkSession`: remove the four score/note fields from the session insert, then write the log.
If the log insert fails, compensate:
```ts
  if (
    input.focusScore != null || input.moodScore != null || input.energyScore != null || input.note
  ) {
    const log = await ctx.supabase.from("work_logs").insert({
      user_id: ctx.user.id,
      task_id: input.taskId,
      session_id: data.id,
      focus_score: input.focusScore ?? null,
      mood_score: input.moodScore ?? null,
      energy_score: input.energyScore ?? null,
      note: input.note || null,
    });
    if (log.error) {
      await ctx.supabase.from("work_sessions").delete().eq("id", data.id).eq("user_id", ctx.user.id);
      throw fromDbError(log.error);
    }
  }
```

If the generated RPC arg types mark optional params as `?: T` rather than `T | undefined`, drop the
`?? undefined` and pass the values as they are.

- [ ] **Step 3: Actions**

Append to `work-session.actions.ts`, and add the new schemas to the import:
```ts
export async function pauseWorkSessionAction(input: unknown) {
  return runAction("session.pause", pauseWorkSessionSchema, input, async (data, ctx) =>
    done(await sessions.pauseWorkSession(ctx, data)),
  );
}

export async function resumeWorkSessionAction(input: unknown) {
  return runAction("session.resume", sessionIdSchema, input, async ({ sessionId }, ctx) =>
    done(await sessions.resumeWorkSession(ctx, sessionId)),
  );
}

export async function setPauseReasonAction(input: unknown) {
  return runAction("session.pause_reason", setPauseReasonSchema, input, async (data, ctx) =>
    sessions.setPauseReason(ctx, data),
  );
}

export async function saveWorkLogNoteAction(input: unknown) {
  return runAction("session.note", saveWorkLogNoteSchema, input, async (data, ctx) =>
    sessions.saveWorkLogNote(ctx, data),
  );
}

export async function switchWorkSessionAction(input: unknown) {
  return runAction("session.switch", switchWorkSessionSchema, input, async (data, ctx) =>
    done(await sessions.switchWorkSession(ctx, data)),
  );
}
```
The pause reason and the note don't revalidate, because nothing on screen depends on them immediately and a
refresh would reset the typing.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: pass. The services are exercised by the SQL tests (Task 1) and by E2E (Task 9).

- [ ] **Step 5: Commit**

```bash
git add src/features/scheduler/schemas src/features/scheduler/services src/features/scheduler/actions
git commit -m "A5: pause/resume/switch/stop services and actions; manual sessions write work_logs"
```

---

### Task 6: FocusBar (replaces the header timer)

**Files:**
- Create: `src/features/scheduler/components/focus-bar.tsx`
- Delete: `src/features/scheduler/components/work-session-timer.tsx`
- Modify: `src/features/scheduler/components/scheduler-workspace.tsx`

**Interfaces:**
- Consumes: `pauseWorkSessionAction`, `resumeWorkSessionAction`, `setPauseReasonAction`, `saveWorkLogNoteAction`
  (Task 5); `focusStats`, `describeRemaining` (Task 2); `formatElapsed` (existing, `utils/metrics.ts`).
- Produces:
  `export function FocusBar(props: { session: SessionWithTask | null; plannedMinutes: number | null; onFinish: () => void }): JSX.Element | null`
  - Accessible name of the bar: `role="status" aria-label="집중 중인 작업"`.
  - Buttons: `일시정지`, `재개`, `종료`. Reason chips are a `group` named `일시정지 이유`.
  - Expanded sheet title: the task title. The textarea is labelled `작업 메모`.

- [ ] **Step 1: Implement** `focus-bar.tsx`

```tsx
"use client";

import { useState } from "react";
import { Pause, Play, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import {
  pauseWorkSessionAction,
  resumeWorkSessionAction,
  saveWorkLogNoteAction,
  setPauseReasonAction,
} from "../actions/work-session.actions";
import { PAUSE_REASON_LABEL, PAUSE_REASONS } from "../domain/scheduler.constants";
import type { SessionWithTask } from "../domain/work-session.types";
import { formatMinutes } from "../utils/duration";
import { describeRemaining, focusStats } from "../utils/focus";
import { formatElapsed } from "../utils/metrics";

/** Bottom focus bar (requirements §10). The clock shows focused time; paused freezes it. */
export function FocusBar({
  session,
  plannedMinutes,
  onFinish,
}: {
  session: SessionWithTask | null;
  plannedMinutes: number | null;
  onFinish: () => void;
}) {
  const { run, pending } = useActionRunner();
  const [expanded, setExpanded] = useState(false);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const openPause = session?.pauses.find((p) => p.resumed_at === null) ?? null;
  const now = useNow(1000, session !== null && openPause === null);
  if (!session) return null;

  const stats = focusStats(session, session.pauses, now);
  const focusedMin = stats.focusedMs / 60_000;

  const pause = () =>
    run(() => pauseWorkSessionAction({ sessionId: session.id }), { onSuccess: (p) => setReasonFor(p.id) });
  const resume = () =>
    run(() => resumeWorkSessionAction({ sessionId: session.id }), { onSuccess: () => setReasonFor(null) });

  return (
    <>
      <div
        role="status"
        aria-label="집중 중인 작업"
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 py-2 text-sm",
          stats.paused ? "border-border bg-muted" : "border-planned/40 bg-planned/10",
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-label="집중 상세 열기"
        >
          {stats.paused ? (
            <Pause className="size-4 shrink-0" aria-hidden />
          ) : (
            <Timer className="size-4 shrink-0 text-planned" aria-hidden />
          )}
          <span className="truncate font-medium">{session.task.title}</span>
          <span className="font-mono tabular-nums">{formatElapsed(stats.focusedMs)}</span>
          {stats.paused && <span className="text-xs text-muted-foreground">일시정지됨</span>}
        </button>

        {reasonFor && stats.paused && (
          <div role="group" aria-label="일시정지 이유" className="flex flex-wrap gap-1">
            {PAUSE_REASONS.map((r) => (
              <Button
                key={r}
                size="xs"
                variant="outline"
                onClick={() =>
                  run(() => setPauseReasonAction({ pauseId: reasonFor, reason: r }), {
                    onSuccess: () => setReasonFor(null),
                  })
                }
              >
                {PAUSE_REASON_LABEL[r]}
              </Button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5">
          {stats.paused ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={resume}>
              <Play aria-hidden />
              재개
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={pause}>
              <Pause aria-hidden />
              일시정지
            </Button>
          )}
          <Button size="sm" disabled={pending} onClick={onFinish}>
            <Square aria-hidden className="fill-current" />
            종료
          </Button>
        </div>
      </div>

      <Sheet open={expanded} onOpenChange={setExpanded}>
        <SheetContent side="bottom" className="mx-auto max-w-lg p-4">
          <SheetHeader className="p-0">
            <SheetTitle>{session.task.title}</SheetTitle>
            <SheetDescription className="font-mono text-2xl tabular-nums text-foreground">
              {formatElapsed(stats.focusedMs)}
            </SheetDescription>
          </SheetHeader>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">계획</dt>
            <dd className="tabular-nums">{plannedMinutes !== null ? formatMinutes(Math.round(plannedMinutes)) : "—"}</dd>
            <dt className="text-muted-foreground">경과</dt>
            <dd className="tabular-nums">{formatMinutes(Math.round(stats.elapsedMs / 60_000))}</dd>
            <dt className="text-muted-foreground">작업</dt>
            <dd className="tabular-nums">{formatMinutes(Math.round(focusedMin))}</dd>
            <dt className="text-muted-foreground">쉼</dt>
            <dd className="tabular-nums">{formatMinutes(Math.round(stats.pausedMs / 60_000))}</dd>
            {plannedMinutes !== null && (
              <>
                <dt className="text-muted-foreground">남은 시간</dt>
                <dd className="tabular-nums">{describeRemaining(plannedMinutes, focusedMin)}</dd>
              </>
            )}
          </dl>
          <div className="space-y-1">
            <Label htmlFor="focus-note" className="text-xs text-muted-foreground">
              작업 메모
            </Label>
            <Textarea
              id="focus-note"
              rows={3}
              maxLength={5000}
              defaultValue={session.work_log?.note ?? ""}
              onBlur={(e) => {
                const note = e.currentTarget.value.trim();
                if (note !== (session.work_log?.note ?? "")) {
                  run(() => saveWorkLogNoteAction({ sessionId: session.id, note }));
                }
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            {stats.paused ? (
              <Button variant="outline" disabled={pending} onClick={resume}>
                재개
              </Button>
            ) : (
              <Button variant="outline" disabled={pending} onClick={pause}>
                일시정지
              </Button>
            )}
            <Button
              disabled={pending}
              onClick={() => {
                setExpanded(false);
                onFinish();
              }}
            >
              종료
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

If `formatMinutes` isn't exported from `utils/duration.ts` under that name, use whatever the drawer already
imports for "1h 20m" formatting (`formatMinutes` in `task-detail-drawer.tsx`).

- [ ] **Step 2: Wire into the workspace (temporary finish handler)**

In `scheduler-workspace.tsx`:
- Remove the `WorkSessionTimer` import and its `<WorkSessionTimer … />` element from the header.
- Add `import { FocusBar } from "./focus-bar";`.
- Just above `<TodayMetricsBar …/>`, render:
  ```tsx
  <FocusBar session={activeSession} plannedMinutes={plannedFor(activeSession)} onFinish={() => activeSession && setSummary({ session: activeSession })} />
  ```
  `plannedFor` and `setSummary` are added in Task 7. For this task only, use
  `plannedMinutes={null}` and `onFinish={() => {}}`, and replace them in Task 7.
- Delete `work-session-timer.tsx` (`git rm`).

- [ ] **Step 3: Verify in the browser**

Run `npx tsc --noEmit && npx eslint .`. Then, with the dev server running (`npm run dev`, or the user's server on
:3000), open `/scheduler` with the Playwright MCP and check the following. Record anything that fails.
1. Start a timer from the list. The bar appears at the bottom and the clock ticks.
2. Press 일시정지. The clock freezes, "일시정지됨" shows, and the reason chips appear.
3. Choose 커피. The chips disappear.
4. Press 재개. The clock ticks again.
5. Click the title. The sheet opens with 계획/경과/작업/쉼, and the typed note survives a close and reopen after blur.

- [ ] **Step 4: Commit**

```bash
git add -A src/features/scheduler/components
git commit -m "A6: bottom FocusBar with pause/resume, reasons and expanded sheet"
```

---

### Task 7: WorkSummaryDialog, SwitchTaskDialog, workspace wiring

**Files:**
- Create: `src/features/scheduler/components/work-summary-dialog.tsx`
- Create: `src/features/scheduler/components/switch-task-dialog.tsx`
- Delete: `src/features/scheduler/components/stop-session-dialog.tsx`
- Modify: `src/features/scheduler/components/scheduler-workspace.tsx`
- Modify: `src/features/scheduler/components/today-task-panel.tsx`
- Modify: `src/features/scheduler/components/task-list-item.tsx`

**Interfaces:**
- Consumes: `stopWorkSessionAction`, `switchWorkSessionAction`, `startWorkSessionAction` (Task 5);
  `focusStats`, `sessionPlanMinutes`, `remainingMinutes`, `describeDifference` (Task 2); `estimateDuration`
  (existing).
- Produces:
  - `WorkSummaryDialog({ session, plannedMinutes, estimateMinutes, priorActualMinutes, timezone, onClose, onDone })`.
    The dialog title is `작업 마치기`, and the buttons are `할 일 완료` and `나중에 계속`.
    `onDone(): void` is called after a successful save.
  - `SwitchTaskDialog({ current, target, onCancel, onFinishFirst })`. The dialog title is `작업 전환`, and the
    buttons are `마치고 시작`, `보류하고 시작` and `취소`.
  - `TaskListItem` prop change: `onStart: () => void` replaces the internal start call; `timerBusy` is removed;
    the new prop is `partial: { actualMinutes: number; remainingMinutes: number | null } | null`.
  - `TodayTaskPanel` new props: `onStartTask: (task: Task) => void`, `planActual: Record<string, TaskPlanActual>`,
    `upcomingTaskIds: Set<string>`.

- [ ] **Step 1: WorkSummaryDialog**

```tsx
"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { stopWorkSessionAction } from "../actions/work-session.actions";
import type { SessionWithTask } from "../domain/work-session.types";
import { formatMinutes } from "../utils/duration";
import { describeDifference, focusStats, remainingMinutes } from "../utils/focus";
import { localDateTimeToIso, toLocalDate, toLocalTime, todayLocalDate } from "../utils/timezone";
import { readScore, ScoreInput } from "./score-input";

/**
 * Finish a focus session (requirements §14): facts first, optional ratings, then the user
 * decides whether the task is done. Closing the dialog saves nothing; the timer keeps running.
 */
export function WorkSummaryDialog({
  session,
  plannedMinutes,
  estimateMinutes,
  priorActualMinutes,
  timezone,
  onClose,
  onDone,
}: {
  session: SessionWithTask | null;
  plannedMinutes: number | null;
  estimateMinutes: number | null;
  priorActualMinutes: number;
  timezone: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { run, pending } = useActionRunner();
  if (!session) return null;

  const stats = focusStats(session, session.pauses);
  const focusedMin = stats.focusedMs / 60_000;
  const today = todayLocalDate(timezone);

  const submit = (form: HTMLFormElement, completeTask: boolean) => {
    const fd = new FormData(form);
    let endedAt: string | undefined;
    if (fd.get("endEdited") === "1") {
      endedAt = localDateTimeToIso(String(fd.get("endDate")), String(fd.get("endTime")), timezone);
    }
    run(
      () =>
        stopWorkSessionAction({
          sessionId: session.id,
          endedAt,
          focusScore: readScore(fd, "focusScore"),
          moodScore: readScore(fd, "moodScore"),
          energyScore: readScore(fd, "energyScore"),
          note: String(fd.get("note") ?? "").trim() || null,
          completeTask,
        }),
      {
        success: completeTask ? "할 일을 완료했습니다." : undefined,
        onSuccess: () => {
          if (!completeTask) {
            const left = remainingMinutes(estimateMinutes, priorActualMinutes + focusedMin);
            toast.success(
              left ? `남은 예상 ${formatMinutes(left)} — 캘린더로 끌어다 놓으세요.` : "작업 시간을 기록했습니다.",
            );
          }
          onDone();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            submit(e.currentTarget, submitter?.value === "complete");
          }}
          onChange={(e) => {
            const t = e.target as HTMLInputElement;
            if (t.name === "endTime" || t.name === "endDate") {
              (e.currentTarget.elements.namedItem("endEdited") as HTMLInputElement).value = "1";
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>작업 마치기</DialogTitle>
            <DialogDescription>{session.task.title}</DialogDescription>
          </DialogHeader>

          <dl className="my-4 grid grid-cols-3 gap-2 text-sm" aria-label="계획과 실제">
            <div>
              <dt className="text-xs text-muted-foreground">계획</dt>
              <dd className="font-medium tabular-nums">
                {plannedMinutes !== null ? formatMinutes(Math.round(plannedMinutes)) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">실제 작업</dt>
              <dd className="font-medium tabular-nums">{formatMinutes(Math.round(focusedMin))}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">차이</dt>
              <dd className="font-medium">
                {plannedMinutes !== null ? describeDifference(plannedMinutes, focusedMin) : "—"}
              </dd>
            </div>
          </dl>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <ScoreInput name="focusScore" label="집중" defaultValue={session.work_log?.focus_score} />
              <ScoreInput name="moodScore" label="기분" hint="선택" defaultValue={session.work_log?.mood_score} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="summary-note" className="text-xs text-muted-foreground">
                무엇을 했나요?
              </Label>
              <Textarea
                id="summary-note"
                name="note"
                rows={2}
                maxLength={5000}
                defaultValue={session.work_log?.note ?? ""}
              />
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">더보기</summary>
              <div className="mt-3 space-y-3">
                <ScoreInput name="energyScore" label="에너지" hint="선택" defaultValue={session.work_log?.energy_score} />
                <input type="hidden" name="endEdited" defaultValue="0" />
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="summary-end-date" className="text-xs text-muted-foreground">
                      종료 날짜
                    </Label>
                    <Input id="summary-end-date" name="endDate" type="date" defaultValue={today} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="summary-end-time" className="text-xs text-muted-foreground">
                      종료 시각 (기본: 지금)
                    </Label>
                    <Input
                      id="summary-end-time"
                      name="endTime"
                      type="time"
                      defaultValue={toLocalTime(new Date(), timezone)}
                    />
                  </div>
                </div>
              </div>
            </details>
            {toLocalDate(session.started_at, timezone) !== today && (
              <p className="text-xs text-warning">어제 시작한 타이머입니다. 더보기에서 종료 시각을 확인하세요.</p>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button type="submit" value="later" variant="outline" disabled={pending}>
              나중에 계속
            </Button>
            <Button type="submit" value="complete" disabled={pending}>
              할 일 완료
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: SwitchTaskDialog**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActionRunner } from "@/hooks/use-action-runner";
import { switchWorkSessionAction } from "../actions/work-session.actions";
import type { Task } from "../domain/task.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { focusStats } from "../utils/focus";
import { formatElapsed } from "../utils/metrics";

/** Only one open timer (requirements §13): finish the current one first, or hold it. */
export function SwitchTaskDialog({
  current,
  target,
  onCancel,
  onFinishFirst,
}: {
  current: SessionWithTask | null;
  target: Task | null;
  onCancel: () => void;
  onFinishFirst: () => void;
}) {
  const { run, pending } = useActionRunner();
  if (!current || !target) return null;
  const elapsed = formatElapsed(focusStats(current, current.pauses).focusedMs);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>작업 전환</DialogTitle>
          <DialogDescription>
            지금 작업 중: {current.task.title} · {elapsed}
            <br />“{target.title}”을(를) 시작할까요?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            취소
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(() => switchWorkSessionAction({ taskId: target.id }), {
                success: `${current.task.title}은(는) 보류했습니다.`,
                onSuccess: onCancel,
              })
            }
          >
            보류하고 시작
          </Button>
          <Button disabled={pending} onClick={onFinishFirst}>
            마치고 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: TaskListItem**

In `task-list-item.tsx`:
- Remove `startWorkSessionAction` from the imports and `timerBusy` from the props. Add the props
  `onStart: () => void;` and `partial: { actualMinutes: number; remainingMinutes: number | null } | null;`.
- In the `li` data attributes, add `"data-partial": partial?.remainingMinutes ? "" : undefined,` to the draggable spread.
- In the meta line, before the `running` badge, add:
  ```tsx
  {partial && (
    <span className="inline-flex items-center gap-0.5">
      <Timer className="size-3" aria-hidden />
      부분 진행 · {formatMinutes(Math.round(partial.actualMinutes))} 작업
      {partial.remainingMinutes ? ` · 남은 약 ${formatMinutes(partial.remainingMinutes)}` : ""}
    </span>
  )}
  ```
- Replace the start button condition `{!done && !timerBusy && (` with `{!done && !running && (`, and its
  `onClick` with `onClick={onStart}`. Remove `disabled={pending}` from that button, since the workspace owns
  pending for start.

- [ ] **Step 4: TodayTaskPanel**

In `today-task-panel.tsx`:
- New props: `onStartTask: (task: Task) => void; planActual: Record<string, TaskPlanActual>; upcomingTaskIds: Set<string>;`.
  Import `TaskPlanActual` from `../domain/work-session.types`, and `partialDropMinutes`/`remainingMinutes` from
  `../utils/focus`.
- In the Draggable `eventData`, add `fixedDuration: itemEl.hasAttribute("data-partial")` to `extendedProps`.
- For each open task:
  ```tsx
  const est = estimateDuration(task, settings, durationProfiles);
  const actual = planActual[task.id]?.actual_minutes ?? 0;
  const isPartial = task.status === "in_progress" && actual > 0 && !upcomingTaskIds.has(task.id);
  const left = isPartial ? remainingMinutes(est.minutes, actual) : null;
  const dropMinutes = partialDropMinutes(left, settings.min_block_minutes);
  <TaskListItem
    key={task.id}
    task={task}
    today={today}
    estimate={dropMinutes ? { ...est, minutes: dropMinutes } : est}
    running={activeSession?.task_id === task.id}
    partial={isPartial ? { actualMinutes: actual, remainingMinutes: left } : null}
    onStart={() => onStartTask(task)}
    onOpen={() => onOpenTask(task.id)}
  />
  ```
- For completed tasks, pass `partial={null}` and `onStart={() => {}}`. Completed tasks never render the start button.

If `SchedulerSettings` names the minimum block field differently, use the existing field that the estimator's
`recommendBlockMinutes` reads for the minimum (`min_block_minutes` in `scheduler_settings`).

- [ ] **Step 5: WeeklyCalendar fixed-duration drop**

In `weekly-calendar.tsx`, `handleReceive`: send `endsAt` for partial tasks so the server keeps the remainder
length instead of re-estimating.
```ts
    const fixed = info.event.extendedProps.fixedDuration === true && info.event.end;
    const result = await scheduleTaskAction({
      taskId,
      startsAt: start.toISOString(),
      ...(fixed ? { endsAt: info.event.end!.toISOString() } : {}),
    });
```
Check that `scheduleTaskSchema` already accepts an optional `endsAt`. `scheduleTask` reads `input.endsAt`, so it does.

- [ ] **Step 6: Workspace wiring**

In `scheduler-workspace.tsx`:
```tsx
import { useActionRunner } from "@/hooks/use-action-runner";
import { startWorkSessionAction } from "../actions/work-session.actions";
import { estimateDuration } from "../utils/estimator";
import { sessionPlanMinutes } from "../utils/focus";
import { SwitchTaskDialog } from "./switch-task-dialog";
import { WorkSummaryDialog } from "./work-summary-dialog";
```
Inside the component:
```tsx
  const { run } = useActionRunner();
  const [summary, setSummary] = useState<{ session: SessionWithTask; thenStart?: Task } | null>(null);
  const [switchTarget, setSwitchTarget] = useState<Task | null>(null);

  const planFor = (session: SessionWithTask | null) => {
    if (!session) return { planned: null, estimate: null, prior: 0 };
    const block = session.schedule_block_id ? blocks.find((b) => b.id === session.schedule_block_id) : undefined;
    const task = tasksById.get(session.task_id);
    const estimate = task ? estimateDuration(task, context.settings, durationProfiles).minutes : null;
    const prior = planActual[session.task_id]?.actual_minutes ?? 0;
    return {
      planned: sessionPlanMinutes({ block: block ?? null, estimateMinutes: estimate, priorActualMinutes: prior }),
      estimate,
      prior,
    };
  };

  const startTask = (task: Task) => {
    if (!activeSession) return run(() => startWorkSessionAction({ taskId: task.id }));
    if (activeSession.task_id !== task.id) setSwitchTarget(task);
  };

  const upcomingTaskIds = useMemo(() => {
    const now = Date.now();
    return new Set(blocks.filter((b) => b.status === "planned" && new Date(b.ends_at).getTime() > now).map((b) => b.task_id));
  }, [blocks]);

  const summaryPlan = planFor(summary?.session ?? null);
```
Pass the new props to `TodayTaskPanel` (`onStartTask={startTask}`, `planActual={planActual}`,
`upcomingTaskIds={upcomingTaskIds}`). Render near `TodayMetricsBar`:
```tsx
      <FocusBar
        session={activeSession}
        plannedMinutes={planFor(activeSession).planned}
        onFinish={() => activeSession && setSummary({ session: activeSession })}
      />
      <WorkSummaryDialog
        key={summary?.session.id ?? "none"}
        session={summary?.session ?? null}
        plannedMinutes={summaryPlan.planned}
        estimateMinutes={summaryPlan.estimate}
        priorActualMinutes={summaryPlan.prior}
        timezone={context.timezone}
        onClose={() => setSummary(null)}
        onDone={() => {
          const next = summary?.thenStart;
          setSummary(null);
          if (next) run(() => startWorkSessionAction({ taskId: next.id }));
        }}
      />
      <SwitchTaskDialog
        current={activeSession}
        target={switchTarget}
        onCancel={() => setSwitchTarget(null)}
        onFinishFirst={() => {
          if (activeSession && switchTarget) setSummary({ session: activeSession, thenStart: switchTarget });
          setSwitchTarget(null);
        }}
      />
```
Delete `stop-session-dialog.tsx` (`git rm`). `session-score-fields.tsx` is no longer used after this. If
`rg SessionScoreFields src` finds no other usage, delete it too.

- [ ] **Step 7: Verify in the browser**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`. Then, in the browser (Playwright MCP):
1. Start A, then press ▶ on B. The 작업 전환 dialog appears.
2. Press 보류하고 시작. The bar now shows B, and A shows "부분 진행".
3. Press ▶ on A, then 마치고 시작. The summary for B opens. Press 나중에 계속. The toast appears, then A starts.
4. Press 종료 → 할 일 완료. A moves to completed.
5. Drag the partial B onto the calendar. The block length equals the remainder (5-minute steps, at least the minimum block).

- [ ] **Step 8: Commit**

```bash
git add -A src/features/scheduler/components
git commit -m "A7: work summary (complete / continue later), switch dialog, partial tasks"
```

---

### Task 8: Drawer start buttons use the switch flow

**Files:**
- Modify: `src/features/scheduler/components/task-detail-drawer.tsx`
- Modify: `src/features/scheduler/components/scheduler-workspace.tsx`

**Interfaces:**
- Consumes: the workspace `startTask(task)` from Task 7.
- Produces: the `TaskDetailDrawer` prop `onStartTask: (task: Task) => void`.

- [ ] **Step 1: Implement**

The drawer's task-level start button currently calls `startWorkSessionAction({ taskId })` only when there is no
active session (`canStart`). Change it:
- `const canStart = isOpen && activeSession?.task_id !== task.id;`
- Its `onClick` becomes `onClick={() => onStartTask(task)}`.
- Keep block-level "이 일정으로 타이머 시작" buttons as they are, but show them only when `activeSession === null`.
  Starting from a block while another timer runs is sub-project B.
- Add `onStartTask` to the props, and pass `onStartTask={startTask}` from the workspace.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint .`. In the browser, with a timer running, open another task's drawer and press
시작. The 작업 전환 dialog appears.

- [ ] **Step 3: Commit**

```bash
git add src/features/scheduler/components
git commit -m "A8: drawer start goes through the switch dialog"
```

---

### Task 9: E2E

**Files:**
- Create: `tests/e2e/focus-flow.spec.ts`
- Modify: `tests/e2e/work-tracking.spec.ts`

**Interfaces:**
- Consumes the accessible names from Tasks 6 and 7: status `집중 중인 작업`; buttons `일시정지`, `재개`, `종료`;
  group `일시정지 이유`; dialog `작업 마치기` with `나중에 계속` / `할 일 완료`; dialog `작업 전환` with
  `보류하고 시작`.

- [ ] **Step 1: Update work-tracking.spec.ts**

Replace the "Flow 4" block from `const timer = …` through the `timed` assertions with:
```ts
    const bar = page.getByRole("status", { name: "집중 중인 작업" });
    await expect(bar).toContainText(title);
    await expect(page.locator(".fc-event.sched-session--running", { hasText: title }).first()).toBeVisible();

    await bar.getByRole("button", { name: "종료" }).click();
    const summary = page.getByRole("dialog", { name: "작업 마치기" });
    await summary.getByRole("group", { name: "집중" }).getByText("4", { exact: true }).click();
    await summary.getByRole("button", { name: "나중에 계속" }).click();
    await expect(bar).toHaveCount(0);

    const { data: task } = await db.from("tasks").select("id,status").eq("title", title).single();
    expect(task!.status).toBe("in_progress");
    const { data: timed } = await db
      .from("work_sessions")
      .select("id,ended_at,source")
      .eq("task_id", task!.id)
      .single();
    expect(timed!.source).toBe("timer");
    expect(timed!.ended_at).not.toBeNull();
    const { data: log } = await db.from("work_logs").select("focus_score").eq("session_id", timed!.id).single();
    expect(log!.focus_score).toBe(4);
```

- [ ] **Step 2: Write focus-flow.spec.ts**

```ts
import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// Sub-project A: pause/resume with reason, summary → Continue Later, switch (hold).
test.describe("focus flow", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("pause (reason) → resume → Escape keeps timer → Continue Later → partial; switch holds", async ({ page }) => {
    const db = await dbAsUser();
    const { data: running } = await db.from("work_sessions").select("id").is("ended_at", null);
    test.skip((running?.length ?? 0) > 0, "A real timer is running on this account; not touching it.");

    const a = `${E2E_PREFIX} 집중 A ${Date.now()}`;
    const b = `${E2E_PREFIX} 집중 B ${Date.now()}`;
    await login(page);
    for (const title of [a, b]) {
      await page.getByLabel("새 할 일").fill(title);
      await page.getByRole("button", { name: "할 일 추가" }).click();
      await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
    }

    await page.getByRole("button", { name: `${a} 타이머 시작` }).click();
    const bar = page.getByRole("status", { name: "집중 중인 작업" });
    await expect(bar).toContainText(a);

    await bar.getByRole("button", { name: "일시정지" }).click();
    await expect(bar).toContainText("일시정지됨");
    await bar.getByRole("group", { name: "일시정지 이유" }).getByRole("button", { name: "커피" }).click();
    await expect(bar.getByRole("group", { name: "일시정지 이유" })).toHaveCount(0);

    const { data: taskA } = await db.from("tasks").select("id").eq("title", a).single();
    const { data: sessionA } = await db.from("work_sessions").select("id").eq("task_id", taskA!.id).single();
    await expect
      .poll(async () => (await db.from("work_session_pauses").select("reason").eq("session_id", sessionA!.id)).data)
      .toEqual([{ reason: "coffee" }]);

    await bar.getByRole("button", { name: "재개" }).click();
    await expect(bar.getByRole("button", { name: "일시정지" })).toBeVisible();
    const { data: pauses } = await db
      .from("work_session_pauses")
      .select("resumed_at")
      .eq("session_id", sessionA!.id);
    expect(pauses![0].resumed_at).not.toBeNull();

    // Escape closes the summary without saving; the timer keeps running (Review Focus 5)
    await bar.getByRole("button", { name: "종료" }).click();
    await page.getByRole("dialog", { name: "작업 마치기" }).waitFor();
    await page.keyboard.press("Escape");
    await expect(bar).toContainText(a);
    const { data: stillOpen } = await db.from("work_sessions").select("ended_at").eq("id", sessionA!.id).single();
    expect(stillOpen!.ended_at).toBeNull();

    // Switch to B, holding A
    await page.getByRole("button", { name: `${b} 타이머 시작` }).click();
    const sw = page.getByRole("dialog", { name: "작업 전환" });
    await sw.getByRole("button", { name: "보류하고 시작" }).click();
    await expect(bar).toContainText(b);
    const { data: heldA } = await db.from("work_sessions").select("ended_at").eq("id", sessionA!.id).single();
    expect(heldA!.ended_at).not.toBeNull();
    const { count: logsA } = await db
      .from("work_logs")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionA!.id);
    expect(logsA).toBe(0);

    // Finish B → Continue Later → B is partial
    await bar.getByRole("button", { name: "종료" }).click();
    await page.getByRole("dialog", { name: "작업 마치기" }).getByRole("button", { name: "나중에 계속" }).click();
    await expect(bar).toHaveCount(0);
    await expect(page.getByRole("listitem").filter({ hasText: b })).toContainText("부분 진행");
    const { data: taskB } = await db.from("tasks").select("status").eq("title", b).single();
    expect(taskB!.status).toBe("in_progress");
  });
});
```

- [ ] **Step 3: Run the E2E suite**

Run (the user's dev server must be on :3000):
`set -a; source .env.local; set +a; E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=… E2E_PASSWORD=… npx playwright test`
Expected: 6 suites pass (the 5 existing ones plus `focus-flow`). Never write the credentials to a file. Take them
from the environment the user provides.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "A9: E2E for focus flow; work-tracking uses the summary dialog"
```

---

### Task 10: Contract migration, docs, final verification

**Files:**
- Create: `supabase/migrations/20260930130000_drop_session_scores.sql` (renamed to the remote version after apply)
- Modify: `src/types/database.ts` (regenerated)
- Modify: `supabase/tests/rls/work_sessions.sql` (stop writing `focus_score` on sessions)
- Modify: `docs/schema.md`, `docs/progress.md`, `docs/decisions/README.md`
- Create: `docs/decisions/0011-focus-pauses-and-work-logs.md`

- [ ] **Step 1: Confirm nothing reads the old columns**

Run: `rg -n "focus_score|mood_score|energy_score|\bnote\b" src/features/scheduler | rg -v "work_log|reflection|daily"`.
Expected: no hits that refer to `work_sessions` columns. Fix any hit before continuing.

- [ ] **Step 2: Update the old SQL test**

In `supabase/tests/rls/work_sessions.sql`:
- Replace `set ended_at = started_at + interval '50 minutes', focus_score = 4` with
  `set ended_at = started_at + interval '50 minutes'`.
- Remove `, focus_score` and `, 2` from the manual-session insert's column and value lists.
- Also remove or adjust any assertion on `average_focus` in that file to expect `null`, since there are no logs there.

- [ ] **Step 3: Write and apply the contract migration**

```sql
-- Contract step for sub-project A: work results now live only in work_logs.
alter table public.work_sessions
  drop column focus_score,
  drop column mood_score,
  drop column energy_score,
  drop column note;
```
Apply with MCP `apply_migration` (name `drop_session_scores`), rename the file to the remote version, and
regenerate `src/types/database.ts`. Re-run `focus_pauses.sql`, `work_sessions.sql` and `scheduler_core.sql`.
Expected: all PASS. Run `get_advisors`. Expected: no new warnings.

- [ ] **Step 4: Docs**

`docs/decisions/0011-focus-pauses-and-work-logs.md`:
```markdown
# 0011. Focus pauses and work logs
- Status: accepted
- Date: 2026-09-30

## Context
Requirements (improve-requirements §11–§16) separate elapsed, paused and focused time, and treat the work log
as its own concept. Before this, a session was one interval and carried its own scores and note.

## Decision
- Pauses are intervals in `work_session_pauses`. Session state is derived (open pause = paused). At most one
  open pause per session and one open session per user.
- `pause/resume/stop/switch_work_session` do each change in one transaction. Stop can also complete the task
  (`p_complete_task`). Switch holds the current session without a summary and starts the next one.
- Work results live in `work_logs` (0..1 per session, or task-level with `session_id` null). The session score
  and note columns were moved there and then dropped (expand → backfill → contract).
- **Actual minutes v2** = wall time − pauses. `task_plan_actual.actual_minutes`, day metrics and weekly metrics
  (`METRICS_VERSION = "v2"`) all use it. `paused_minutes` is exposed on the view.

## Consequences
- Duration learning uses focused time automatically (it reads the view).
- Pre-A sessions have no pauses and count as fully focused.
- Editing pauses is not supported yet.
```
- Add the row `| 0011 | Focus pauses and work logs | accepted |` to `docs/decisions/README.md`, matching that table's columns.
- In `docs/schema.md`:
  - Add a `## work_session_pauses / work_logs (Improvement A)` section summarizing the tables, the one-open-pause
    rule, the four functions and their errors.
  - Change the metric table rows so `actual_minutes` = "Σ focused minutes (wall − pauses) of finished sessions (v2)"
    and `average_focus` = "mean work-log `focus_score` of finished sessions that started in the window".
  - Add a concept map: TimeBlock = `schedule_blocks`, FocusSession = `work_sessions`, WorkLog = `work_logs`,
    DailyReview = `daily_reflections`.
- In `docs/progress.md`, add:
  ```markdown
  ## Improvement A — focus flow (docs/superpowers/specs/2026-09-29-focus-flow-design.md)
  - [x] Pauses, work logs, atomic stop/switch, actual minutes v2 (migration + SQL tests)
  - [x] FocusBar, WorkSummaryDialog (complete / continue later), SwitchTaskDialog, partial tasks
  - [x] Contract: session score/note columns dropped
  ```

- [ ] **Step 5: Full verification**

Run:
```bash
npx tsc --noEmit
npx eslint .
npx vitest run
npm run build
set -a; source .env.local; set +a; E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=… E2E_PASSWORD=… npx playwright test
```
Expected: everything passes, and the build has no errors. Afterwards, check the DB is clean with MCP
`execute_sql`: `select count(*) from public.tasks where title like '[e2e]%'` → 0.

- [ ] **Step 6: Commit**

```bash
git add supabase src/types/database.ts docs
git commit -m "A10: drop session score columns; docs, ADR 0011"
```
