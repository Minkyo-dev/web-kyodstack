# Calendar Planning (Sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Act on the plan from the calendar: start, complete or reschedule from a block; show not-started and
missed blocks; confirm the recommended length after a drop; overlay actual work on demand.

**Architecture:**
- **DB.** A new block status `missed` is set only by `mark_missed_blocks(user)`, which is idempotent and called on
  page load and by the nightly job. `unschedule_block` cancels a block and returns an idle task to the inbox.
- **Pure logic.** `utils/block-state.ts` derives the visual state (not started, missed, …) and the reschedule
  targets (DST-safe).
- **UI.** Blocks gain ▶ and ⋯ actions. The calendar gets an actual-work toggle whose default is a user setting.
  A drop toast offers "keep my estimate".

**Tech Stack:** Next.js 16, React 19, Supabase Postgres + RLS (remote only via MCP), Zod 4, Vitest, Playwright,
FullCalendar 6 (luxon3), shadcn/ui on Base UI, sonner, date-fns 4 + @date-fns/tz.

**Spec:** `docs/superpowers/specs/2026-09-30-calendar-planning-design.md`. Read it first. Also read A's
`2026-09-29-focus-flow-design.md` for the switch dialog and FocusBar that this builds on.

## Global Constraints

- `AGENTS.md` rules. DB workflow:
  1. Write the migration file.
  2. Apply it with MCP `apply_migration`.
  3. Run `list_migrations` and rename the file to the remote version.
  4. Regenerate the types with `generate_typescript_types`.
  5. Run the SQL tests via `execute_sql`.
  6. Run `get_advisors`.
- Never edit an applied migration.
- Mutations: Zod → `runAction` (auth) → service → `ActionResult`. Never take `user_id` from the client.
- DB functions: `security invoker`, `set search_path = ''`, revoke from `public, anon`.
- `createAdminClient()` only in jobs; every query it reaches filters `user_id` explicitly.
- Planned blocks and actual sessions never overwrite each other. A missed block is never edited back; rescheduling
  after the end creates a new block.
- Status by icon + text, never color alone. Neutral copy ("놓침", never "failed").
- UI copy Korean. E2E data titles start with `[e2e]`.
- Before each commit: `npx tsc --noEmit && npx eslint . && npx vitest run`. The final task also runs `npm run build`
  and the E2E suite (dev server on :3000, `E2E_BASE_URL=http://localhost:3000`).

## Review Focus

1. **A block that ends while the page is open.** It should look missed without a reload, via `blockState` with
   `now`; the DB status follows on the next load. → Task 2 test "planned but ended → missed".
2. **Rescheduling a block that ended but isn't marked missed yet** (the mark hasn't run). It must create a new
   block, not move the old one. → Task 4 `rescheduleBlock` branches on `ends_at <= now`, not on status;
   E2E in Task 8.
3. **`nextFreeSlot` late at night / past the workday end.** It should return null and hide the option instead of
   proposing tomorrow 00:00. → Task 2 test.
4. **"Same time tomorrow" across the DST change** (Toronto 2026-11-01). The local wall time must be kept.
   → Task 2 test.
5. **Clicking ▶ or ⋯ on a block.** It must not start a drag or open the drawer. → Task 5 handlers stop propagation
   on `pointerdown` and `click`; E2E in Task 8 clicks ▶ and asserts the drawer did not open.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_calendar_planning.sql` (create) | `missed` status, `mark_missed_blocks`, `unschedule_block`, status fn update, setting column |
| `supabase/tests/rls/calendar_planning.sql` (create) | SQL tests |
| `src/features/scheduler/utils/block-state.ts` (create) | `blockState`, `nextFreeSlot`, `sameTimeTomorrow` |
| `src/features/scheduler/domain/scheduler.constants.ts` (modify) | `missed` status + label |
| `src/features/scheduler/domain/task.types.ts` (modify) | `SchedulerSettings` + `show_actual_default` |
| `src/features/scheduler/queries/schedule.queries.ts` (modify) | select the setting |
| `src/features/scheduler/schemas/schedule.schema.ts` (modify) | reschedule/unschedule/settings schemas |
| `src/features/scheduler/services/scheduling.service.ts` (modify) | `markMissedBlocks`, `rescheduleBlock`, `unscheduleBlock`, `updateSchedulerSettings` |
| `src/features/scheduler/actions/schedule.actions.ts` (modify) | actions |
| `src/app/(private)/scheduler/page.tsx`, `src/features/jobs/services/jobs.ts` (modify) | call `markMissedBlocks` |
| `src/features/scheduler/components/block-actions.tsx` (create) | ▶ + ⋯ menu + pick-time dialog |
| `src/features/scheduler/components/calendar-event-content.tsx` (modify) | states + actions |
| `src/features/scheduler/components/weekly-calendar.tsx` (modify) | overlay filter, drop toast, mirror recommendation |
| `src/features/scheduler/components/scheduler-settings-menu.tsx` (create) | ⚙ menu with the default switch |
| `src/features/scheduler/components/scheduler-workspace.tsx`, `switch-task-dialog.tsx`, `task-detail-drawer.tsx`, `task-list-item.tsx`, `today-task-panel.tsx` (modify) | wiring |
| `src/app/globals.css` (modify) | missed / not-started styles |
| `tests/unit/block-state.test.ts` (create), `tests/e2e/calendar-planning.spec.ts` (create), `tests/e2e/duration-learning.spec.ts` (modify) | tests |
| `docs/schema.md`, `docs/decisions/0012-missed-blocks-and-rescheduling.md`, `docs/decisions/README.md`, `docs/progress.md` | docs |

---

### Task 1: Migration — missed status, mark/unschedule functions, setting

**Files:**
- Create: `supabase/tests/rls/calendar_planning.sql`
- Create: `supabase/migrations/20260930150000_calendar_planning.sql` (renamed after apply)
- Modify: `src/types/database.ts` (regenerated)

**Interfaces:**
- Produces (SQL):
  - `mark_missed_blocks(p_user_id uuid) returns integer`: the count marked; `42501` if an authenticated caller
    passes another user's id.
  - `unschedule_block(p_block_id uuid) returns schedule_blocks`: the cancelled block; `P0002` not found;
    `23514` 'only planned or missed blocks can be unscheduled'.
  - `set_schedule_block_status` now also allows `missed → cancelled`.
  - `scheduler_settings.show_actual_default boolean not null default false`.

- [ ] **Step 1: Find the existing status constraint name**

MCP `execute_sql`:
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.schedule_blocks'::regclass and contype = 'c';
```
Expected: one row whose definition lists `'planned', 'completed', 'skipped', 'cancelled'`. Use its name in Step 3
(expected `schedule_blocks_status_check`).

- [ ] **Step 2: Write the SQL test** `supabase/tests/rls/calendar_planning.sql`

```sql
-- Calendar planning: missed marking, unschedule, missed transitions, RLS.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

insert into public.tasks (id, user_id, title, status)
values
  ('60000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'missed one', 'planned'),
  ('60000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a', 'linked', 'planned'),
  ('60000000-0000-4000-a000-0000000000a3', '00000000-0000-4000-a000-00000000000a', 'matched', 'planned'),
  ('60000000-0000-4000-a000-0000000000a4', '00000000-0000-4000-a000-00000000000a', 'future', 'planned'),
  ('60000000-0000-4000-a000-0000000000a5', '00000000-0000-4000-a000-00000000000a', 'two blocks', 'planned');

insert into public.schedule_blocks (id, user_id, task_id, starts_at, ends_at)
values
  ('70000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-00000000000a', now() - interval '3 hours', now() - interval '2 hours'),
  ('70000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-0000000000a2', now() - interval '3 hours', now() - interval '2 hours'),
  ('70000000-0000-4000-a000-0000000000a3', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-0000000000a3', now() - interval '3 hours', now() - interval '2 hours'),
  ('70000000-0000-4000-a000-0000000000a4', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-0000000000a4', now() + interval '1 hour', now() + interval '2 hours'),
  ('70000000-0000-4000-a000-0000000000a5', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-0000000000a5', now() + interval '1 hour', now() + interval '2 hours'),
  ('70000000-0000-4000-a000-0000000000a6', '00000000-0000-4000-a000-00000000000a',
   '60000000-0000-4000-a000-0000000000a5', now() + interval '3 hours', now() + interval '4 hours');

-- linked session (started from the block) and a matching session (same task, inside the window)
insert into public.work_sessions (user_id, task_id, schedule_block_id, started_at, ended_at, source)
values
  ('00000000-0000-4000-a000-00000000000a', '60000000-0000-4000-a000-0000000000a2',
   '70000000-0000-4000-a000-0000000000a2', now() - interval '170 minutes', now() - interval '150 minutes', 'manual'),
  ('00000000-0000-4000-a000-00000000000a', '60000000-0000-4000-a000-0000000000a3',
   null, now() - interval '200 minutes', now() - interval '190 minutes', 'manual');

do $$
declare n int;
begin
  -- A cannot mark B
  begin
    perform public.mark_missed_blocks('00000000-0000-4000-a000-00000000000b');
    raise exception 'FAIL: marked another user';
  exception when insufficient_privilege then null;
  end;

  n := public.mark_missed_blocks('00000000-0000-4000-a000-00000000000a');
  assert n = 1, format('exactly one missed, got %s', n);
  assert (select status from public.schedule_blocks where id = '70000000-0000-4000-a000-00000000000a') = 'missed',
    'past block without session is missed';
  assert (select status from public.schedule_blocks where id = '70000000-0000-4000-a000-0000000000a2') = 'planned',
    'linked session keeps planned';
  assert (select status from public.schedule_blocks where id = '70000000-0000-4000-a000-0000000000a3') = 'planned',
    'matching session (start − 30 min window) keeps planned';
  assert (select status from public.schedule_blocks where id = '70000000-0000-4000-a000-0000000000a4') = 'planned',
    'future block untouched';
  assert public.mark_missed_blocks('00000000-0000-4000-a000-00000000000a') = 0, 'idempotent';

  -- missed transitions: planned/completed rejected, cancelled allowed
  begin
    perform public.set_schedule_block_status('70000000-0000-4000-a000-00000000000a', 'planned');
    raise exception 'FAIL: missed → planned';
  exception when check_violation then null;
  end;
  begin
    perform public.set_schedule_block_status('70000000-0000-4000-a000-00000000000a', 'completed');
    raise exception 'FAIL: missed → completed';
  exception when check_violation then null;
  end;
  begin
    perform public.move_schedule_block('70000000-0000-4000-a000-00000000000a', now(), now() + interval '1 hour');
    raise exception 'FAIL: moved a missed block';
  exception when check_violation then null;
  end;

  -- unschedule the missed block: task has no other planned block → inbox
  perform public.unschedule_block('70000000-0000-4000-a000-00000000000a');
  assert (select status from public.schedule_blocks where id = '70000000-0000-4000-a000-00000000000a') = 'cancelled',
    'missed → cancelled';
  assert (select status from public.tasks where id = '60000000-0000-4000-a000-00000000000a') = 'inbox',
    'task back to inbox';
  assert (select count(*) from public.schedule_block_revisions
           where schedule_block_id = '70000000-0000-4000-a000-00000000000a' and change_type = 'cancelled') = 1,
    'cancel revision written';

  -- unschedule one of two planned blocks: task stays planned
  perform public.unschedule_block('70000000-0000-4000-a000-0000000000a5');
  assert (select status from public.tasks where id = '60000000-0000-4000-a000-0000000000a5') = 'planned',
    'other planned block keeps the task planned';

  -- cannot unschedule a cancelled block
  begin
    perform public.unschedule_block('70000000-0000-4000-a000-0000000000a5');
    raise exception 'FAIL: unscheduled twice';
  exception when check_violation then null;
  end;

  -- setting column default
  assert (select show_actual_default from public.scheduler_settings) = false, 'setting defaults to false';
end;
$$;

-- B cannot unschedule A's block
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.unschedule_block('70000000-0000-4000-a000-0000000000a4');
    raise exception 'FAIL: B unscheduled A block';
  exception when no_data_found then null;
  end;
  assert public.mark_missed_blocks('00000000-0000-4000-a000-00000000000b') = 0, 'B marks nothing of A';
end;
$$;

-- service role (auth.uid() null) may mark any user
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  assert public.mark_missed_blocks('00000000-0000-4000-a000-00000000000a') = 0, 'service role call works';
end;
$$;

select 'PASS calendar_planning' as result;
rollback;
```

- [ ] **Step 3: Run the test to verify it fails**

MCP `execute_sql` with the file. Expected: `function public.mark_missed_blocks(uuid) does not exist`.

- [ ] **Step 4: Write the migration** `supabase/migrations/20260930150000_calendar_planning.sql`

```sql
-- Calendar planning (sub-project B): missed blocks, unschedule, actual-overlay setting.
-- Spec: docs/superpowers/specs/2026-09-30-calendar-planning-design.md

alter table public.schedule_blocks drop constraint schedule_blocks_status_check;
alter table public.schedule_blocks add constraint schedule_blocks_status_check
  check (status in ('planned', 'completed', 'skipped', 'cancelled', 'missed'));

alter table public.scheduler_settings
  add column show_actual_default boolean not null default false;

-- Only the system marks blocks missed. Idempotent; every statement is scoped to p_user_id, so it is
-- safe under the service role (nightly job) and restricted to self for signed-in callers.
create or replace function public.mark_missed_blocks(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is not null and v_uid <> p_user_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.schedule_blocks b
     set status = 'missed'
   where b.user_id = p_user_id
     and b.status = 'planned'
     and b.ends_at < now()
     and not exists (
       select 1
         from public.work_sessions w
        where w.user_id = p_user_id
          and (
            w.schedule_block_id = b.id
            or (w.task_id = b.task_id
                and w.started_at >= b.starts_at - interval '30 minutes'
                and w.started_at < b.ends_at)
          )
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- "미배정으로": cancel a planned or missed block; an idle planned task with no other planned block
-- returns to the inbox. One transaction, with the cancel revision.
create or replace function public.unschedule_block(p_block_id uuid)
returns public.schedule_blocks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.schedule_blocks;
  v_new public.schedule_blocks;
begin
  select * into v_old
    from public.schedule_blocks
   where id = p_block_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'schedule block not found' using errcode = 'P0002';
  end if;
  if v_old.status not in ('planned', 'missed') then
    raise exception 'only planned or missed blocks can be unscheduled' using errcode = '23514';
  end if;

  update public.schedule_blocks set status = 'cancelled' where id = p_block_id
  returning * into v_new;

  insert into public.schedule_block_revisions
    (user_id, schedule_block_id, change_type, actor, previous_starts_at, previous_ends_at)
  values (v_uid, p_block_id, 'cancelled', 'user', v_old.starts_at, v_old.ends_at);

  update public.tasks t
     set status = 'inbox'
   where t.id = v_old.task_id and t.user_id = v_uid and t.status = 'planned'
     and not exists (select 1 from public.schedule_blocks b
                      where b.task_id = t.id and b.user_id = v_uid and b.status = 'planned');

  return v_new;
end;
$$;

-- Same function as before, plus missed → cancelled.
create or replace function public.set_schedule_block_status(
  p_block_id uuid,
  p_status text
)
returns public.schedule_blocks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.schedule_blocks;
  v_new public.schedule_blocks;
begin
  select * into v_old
    from public.schedule_blocks
   where id = p_block_id and user_id = v_uid
   for update;

  if not found then
    raise exception 'schedule block not found' using errcode = 'P0002';
  end if;
  if p_status = v_old.status then
    return v_old;
  end if;
  if not (
    (v_old.status = 'planned' and p_status in ('completed', 'skipped', 'cancelled'))
    or (v_old.status in ('completed', 'skipped') and p_status = 'planned')
    or (v_old.status = 'missed' and p_status = 'cancelled')
  ) then
    raise exception 'invalid block status transition' using errcode = '23514';
  end if;

  update public.schedule_blocks
     set status = p_status
   where id = p_block_id
  returning * into v_new;

  if p_status = 'cancelled' then
    insert into public.schedule_block_revisions
      (user_id, schedule_block_id, change_type, actor,
       previous_starts_at, previous_ends_at)
    values (v_uid, p_block_id, 'cancelled', 'user', v_old.starts_at, v_old.ends_at);
  end if;

  return v_new;
end;
$$;

revoke execute on function public.mark_missed_blocks(uuid) from public, anon;
revoke execute on function public.unschedule_block(uuid) from public, anon;
grant execute on function public.mark_missed_blocks(uuid) to authenticated, service_role;
grant execute on function public.unschedule_block(uuid) to authenticated;
```

- [ ] **Step 5: Apply, rename, regenerate**

1. MCP `apply_migration` with name `calendar_planning`.
2. Run `list_migrations` and `git mv` the file to `<remote_version>_calendar_planning.sql`.
3. Run `generate_typescript_types` and write the result to `src/types/database.ts`.

- [ ] **Step 6: Run the SQL tests**

Run `calendar_planning.sql` (expected `PASS calendar_planning`), then `schedule_functions.sql` (expected `PASS …`).
Then run `get_advisors` (security). Expected: no new warnings beyond the generic GraphQL-visibility notices every
scheduler table already has.

- [ ] **Step 7: Commit**

```bash
npx tsc --noEmit
git add supabase src/types/database.ts
git commit -m "B1: missed blocks, unschedule, actual-overlay setting"
```

---

### Task 2: Pure block-state utilities

**Files:**
- Create: `src/features/scheduler/utils/block-state.ts`
- Test: `tests/unit/block-state.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const NOT_STARTED_GRACE_MINUTES = 15;
  export const MATCH_LEAD_MINUTES = 30;
  export type BlockVisualState = "planned" | "not_started" | "running" | "missed" | "completed" | "skipped" | "cancelled";
  export type BlockLike = { id: string; task_id: string; starts_at: string; ends_at: string; status: string };
  export type SessionRef = { schedule_block_id: string | null; task_id: string; started_at: string; ended_at: string | null };
  export function blockState(block: BlockLike, sessions: SessionRef[], now: Date): BlockVisualState;
  export function nextFreeSlot(input: { now: Date; lengthMinutes: number; blocks: BlockLike[]; excludeBlockId?: string; timezone: string; workdayStart: string }): string | null; // ISO start
  export function sameTimeTomorrow(startsAt: string, timezone: string): string; // ISO
  ```

- [ ] **Step 1: Write the failing tests** `tests/unit/block-state.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { blockState, nextFreeSlot, sameTimeTomorrow } from "@/features/scheduler/utils/block-state";

const TZ = "America/Toronto"; // EDT = UTC−4 until 2026-11-01
const blk = (s: string, e: string, status = "planned", id = "b1", task = "t1") => ({
  id,
  task_id: task,
  starts_at: s,
  ends_at: e,
  status,
});
const ses = (started: string, ended: string | null, blockId: string | null = null, task = "t1") => ({
  schedule_block_id: blockId,
  task_id: task,
  started_at: started,
  ended_at: ended,
});
const at = (iso: string) => new Date(iso);

describe("blockState", () => {
  const b = blk("2026-09-30T14:00:00Z", "2026-09-30T15:00:00Z");
  it("planned before start + 15 min", () => {
    expect(blockState(b, [], at("2026-09-30T14:14:00Z"))).toBe("planned");
  });
  it("not_started from start + 15 min until the end", () => {
    expect(blockState(b, [], at("2026-09-30T14:15:00Z"))).toBe("not_started");
    expect(blockState(b, [], at("2026-09-30T14:59:00Z"))).toBe("not_started");
  });
  it("planned but ended → missed (before the DB mark runs)", () => {
    expect(blockState(b, [], at("2026-09-30T15:00:00Z"))).toBe("missed");
  });
  it("stored missed stays missed", () => {
    expect(blockState({ ...b, status: "missed" }, [], at("2026-09-30T14:00:00Z"))).toBe("missed");
  });
  it("an open linked session → running; a finished one keeps it planned", () => {
    expect(blockState(b, [ses("2026-09-30T14:20:00Z", null, "b1")], at("2026-09-30T14:40:00Z"))).toBe("running");
    expect(blockState(b, [ses("2026-09-30T14:20:00Z", "2026-09-30T14:50:00Z", "b1")], at("2026-09-30T15:30:00Z"))).toBe(
      "planned",
    );
  });
  it("a same-task session starting within [start − 30 min, end) counts; other tasks don't", () => {
    expect(blockState(b, [ses("2026-09-30T13:35:00Z", "2026-09-30T13:50:00Z")], at("2026-09-30T15:30:00Z"))).toBe(
      "planned",
    );
    expect(
      blockState(b, [ses("2026-09-30T14:10:00Z", "2026-09-30T14:20:00Z", null, "other")], at("2026-09-30T15:30:00Z")),
    ).toBe("missed");
  });
  it("other statuses pass through", () => {
    expect(blockState({ ...b, status: "completed" }, [], at("2026-09-30T16:00:00Z"))).toBe("completed");
    expect(blockState({ ...b, status: "skipped" }, [], at("2026-09-30T16:00:00Z"))).toBe("skipped");
  });
});

describe("nextFreeSlot", () => {
  const base = { lengthMinutes: 60, blocks: [], timezone: TZ, workdayStart: "09:00:00" };
  it("rounds now up to 15 minutes", () => {
    // 10:07 local → 10:15 local = 14:15Z
    expect(nextFreeSlot({ ...base, now: at("2026-09-30T14:07:00Z") })).toBe("2026-09-30T14:15:00.000Z");
  });
  it("never before the workday start", () => {
    // 06:00 local → 09:00 local = 13:00Z
    expect(nextFreeSlot({ ...base, now: at("2026-09-30T10:00:00Z") })).toBe("2026-09-30T13:00:00.000Z");
  });
  it("skips past an overlapping planned block (rounded up), ignoring the excluded one", () => {
    const blocks = [
      blk("2026-09-30T14:00:00Z", "2026-09-30T15:10:00Z", "planned", "busy"),
      blk("2026-09-30T14:00:00Z", "2026-09-30T20:00:00Z", "planned", "self"),
    ];
    expect(nextFreeSlot({ ...base, blocks, excludeBlockId: "self", now: at("2026-09-30T14:07:00Z") })).toBe(
      "2026-09-30T15:15:00.000Z",
    );
  });
  it("ignores cancelled/missed blocks", () => {
    const blocks = [blk("2026-09-30T14:00:00Z", "2026-09-30T16:00:00Z", "missed", "m")];
    expect(nextFreeSlot({ ...base, blocks, now: at("2026-09-30T14:07:00Z") })).toBe("2026-09-30T14:15:00.000Z");
  });
  it("null when it would not end before local midnight", () => {
    // 23:20 local = 03:20Z next day
    expect(nextFreeSlot({ ...base, now: at("2026-10-01T03:20:00Z") })).toBeNull();
  });
});

describe("sameTimeTomorrow", () => {
  it("keeps the local wall time", () => {
    expect(sameTimeTomorrow("2026-09-30T23:00:00Z", TZ)).toBe("2026-10-01T23:00:00.000Z");
  });
  it("across the DST change: 19:00 EDT on Oct 31 → 19:00 EST on Nov 1", () => {
    expect(sameTimeTomorrow("2026-10-31T23:00:00Z", TZ)).toBe("2026-11-02T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/block-state.test.ts`
Expected: FAIL, `Cannot find package '@/features/scheduler/utils/block-state'`.

- [ ] **Step 3: Implement** `src/features/scheduler/utils/block-state.ts`

```ts
/**
 * Visual state of a calendar block and reschedule targets (calendar-planning design §1). Pure and
 * DST-safe: local days come from the tz utils, never from fixed offsets.
 */
import { addLocalDays, localDateTimeToIso, localDayRange, toLocalDate, toLocalTime } from "./timezone";

export const NOT_STARTED_GRACE_MINUTES = 15;
/** Same rule as the DB mark and D's Reliability matching. */
export const MATCH_LEAD_MINUTES = 30;

export type BlockVisualState =
  | "planned"
  | "not_started"
  | "running"
  | "missed"
  | "completed"
  | "skipped"
  | "cancelled";
export type BlockLike = { id: string; task_id: string; starts_at: string; ends_at: string; status: string };
export type SessionRef = {
  schedule_block_id: string | null;
  task_id: string;
  started_at: string;
  ended_at: string | null;
};

const MIN = 60_000;
const t = (iso: string) => new Date(iso).getTime();

function matches(block: BlockLike, s: SessionRef) {
  if (s.schedule_block_id === block.id) return true;
  const start = t(s.started_at);
  return s.task_id === block.task_id && start >= t(block.starts_at) - MATCH_LEAD_MINUTES * MIN && start < t(block.ends_at);
}

export function blockState(block: BlockLike, sessions: SessionRef[], now: Date): BlockVisualState {
  if (block.status !== "planned") return block.status as BlockVisualState;
  const mine = sessions.filter((s) => matches(block, s));
  if (mine.some((s) => s.ended_at === null)) return "running";
  if (mine.length > 0) return "planned";
  const n = now.getTime();
  if (n >= t(block.ends_at)) return "missed";
  if (n >= t(block.starts_at) + NOT_STARTED_GRACE_MINUTES * MIN) return "not_started";
  return "planned";
}

const ceil15 = (ms: number) => Math.ceil(ms / (15 * MIN)) * 15 * MIN;

/** Earliest 15-minute start today that fits `lengthMinutes` before local midnight without overlapping a planned block. */
export function nextFreeSlot(input: {
  now: Date;
  lengthMinutes: number;
  blocks: BlockLike[];
  excludeBlockId?: string;
  timezone: string;
  workdayStart: string;
}): string | null {
  const today = toLocalDate(input.now, input.timezone);
  const dayEnd = t(localDayRange(today, input.timezone).end.toISOString());
  const workStart = t(localDateTimeToIso(today, input.workdayStart.slice(0, 5), input.timezone));
  const busy = input.blocks
    .filter((b) => b.status === "planned" && b.id !== input.excludeBlockId)
    .map((b) => [t(b.starts_at), t(b.ends_at)] as const)
    .sort((a, b) => a[0] - b[0]);

  let start = Math.max(ceil15(input.now.getTime()), workStart);
  const len = input.lengthMinutes * MIN;
  for (;;) {
    const hit = busy.find(([s, e]) => s < start + len && e > start);
    if (!hit) break;
    start = ceil15(hit[1]);
  }
  return start + len <= dayEnd ? new Date(start).toISOString() : null;
}

/** Same local wall time on the next local day. */
export function sameTimeTomorrow(startsAt: string, timezone: string): string {
  const date = toLocalDate(startsAt, timezone);
  return localDateTimeToIso(addLocalDays(date, 1, timezone), toLocalTime(startsAt, timezone), timezone);
}
```

Before running, check the tz helper signatures in `src/features/scheduler/utils/timezone.ts`:
- `localDayRange` returns `{ start, end }`. If they are ISO strings rather than Dates, drop `.toISOString()`.
- `localDateTimeToIso(date, "HH:mm", zone)` returns ISO with `.000Z`. If it returns another ISO form, normalize
  with `new Date(x).toISOString()`, both in the implementation and via the expected strings.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/block-state.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/scheduler/utils/block-state.ts tests/unit/block-state.test.ts
git commit -m "B2: pure block state and reschedule targets"
```

---

### Task 3: Domain types, settings context, drawer handling of `missed`

**Files:**
- Modify: `src/features/scheduler/domain/scheduler.constants.ts`
- Modify: `src/features/scheduler/domain/task.types.ts`
- Modify: `src/features/scheduler/queries/schedule.queries.ts`
- Modify: `src/features/scheduler/components/task-detail-drawer.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `BLOCK_STATUSES` includes `"missed"`; `BLOCK_STATUS_LABEL.missed = "놓침"`;
  `SchedulerSettings` includes `show_actual_default: boolean`.

- [ ] **Step 1: Implement**
- `scheduler.constants.ts`:
  - `BLOCK_STATUSES = ["planned", "completed", "skipped", "cancelled", "missed"] as const;`
  - Add `missed: "놓침",` to `BLOCK_STATUS_LABEL`.
- `task.types.ts`: add `| "show_actual_default"` to the `SchedulerSettings` Pick.
- `schedule.queries.ts` `getSchedulerContext`: append `, show_actual_default` to the settings select literal.
- `task-detail-drawer.tsx`, blocks list:
  - The non-planned branch renders `<BlockButton … status="planned" label="되돌리기" />`. Render it only when
    `b.status === "completed" || b.status === "skipped"`.
  - For `missed`, render `<BlockButton blockId={b.id} status="cancelled" label="삭제" />` instead, because
    `missed → cancelled` is allowed.
- `globals.css`, after `.sched-block--skipped`:
  ```css
  .fc .sched-block--missed {
    background: var(--muted);
    border-left-color: var(--warning);
    border-left-style: dashed;
    color: var(--muted-foreground);
  }
  .fc .sched-block--not-started {
    border-left-color: var(--warning);
  }
  ```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: pass. If `tsc` flags an exhaustive `Record<BlockStatus, …>` elsewhere, add the `missed` entry there with
the same label.

- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "B3: missed status in the domain; settings carry show_actual_default"
```

---

### Task 4: Services, actions, page and job wiring

**Files:**
- Modify: `src/features/scheduler/schemas/schedule.schema.ts`
- Modify: `src/features/scheduler/services/scheduling.service.ts`
- Modify: `src/features/scheduler/actions/schedule.actions.ts`
- Modify: `src/app/(private)/scheduler/page.tsx`
- Modify: `src/features/jobs/services/jobs.ts`

**Interfaces:**
- Consumes: SQL functions (Task 1).
- Produces:
  - `markMissedBlocks(supabase: SupabaseServerClient, userId: string): Promise<number>`, which never throws:
    it logs and returns 0 on error.
  - `rescheduleBlockAction({ blockId, startsAt })` → `ScheduleBlock`. It moves the block while it hasn't ended,
    otherwise it creates a new block with the same length.
  - `unscheduleBlockAction({ blockId })` → `ScheduleBlock`.
  - `updateSchedulerSettingsAction({ showActualDefault })` → `void`.

- [ ] **Step 1: Schemas** (append to `schedule.schema.ts`)

```ts
export const rescheduleBlockSchema = z.object({ blockId: z.uuid(), startsAt: instant });
export type RescheduleBlockInput = z.infer<typeof rescheduleBlockSchema>;

export const blockIdSchema = z.object({ blockId: z.uuid() });

export const updateSchedulerSettingsSchema = z.object({ showActualDefault: z.boolean() });
export type UpdateSchedulerSettingsInput = z.infer<typeof updateSchedulerSettingsSchema>;
```

- [ ] **Step 2: Service** (append to `scheduling.service.ts`; add the needed imports:
  `SupabaseServerClient` from `@/lib/supabase/server`, `log` from `@/lib/logger`, `addMinutes` from `date-fns`
  if it isn't already imported, and the new input types)

```ts
/**
 * Mark ended planned blocks without a session as missed (calendar-planning design §1).
 * Called before the page reads blocks and by the nightly job. Best-effort: never fails the caller.
 */
export async function markMissedBlocks(supabase: SupabaseServerClient, userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("mark_missed_blocks", { p_user_id: userId });
  if (error) {
    log({ action: "schedule.mark_missed", userId, success: false, errorCode: "DATABASE_ERROR", detail: error.message });
    return 0;
  }
  return data ?? 0;
}

/**
 * Before the block ends: move it (the revision records the reschedule).
 * After it ends (missed, or not marked yet): a new block with the same length; the old one stays as history.
 */
export async function rescheduleBlock(ctx: ActionContext, input: RescheduleBlockInput): Promise<ScheduleBlock> {
  const { data: block, error } = await ctx.supabase
    .from("schedule_blocks")
    .select("id, task_id, starts_at, ends_at, status")
    .eq("id", input.blockId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!block) throw new AppError("NOT_FOUND");
  if (block.status !== "planned" && block.status !== "missed") {
    throw new AppError("CONFLICT", "이 일정은 다시 잡을 수 없습니다.");
  }
  const lengthMs = new Date(block.ends_at).getTime() - new Date(block.starts_at).getTime();
  const endsAt = new Date(new Date(input.startsAt).getTime() + lengthMs).toISOString();
  const ended = new Date(block.ends_at).getTime() <= Date.now();
  if (block.status === "planned" && !ended) {
    return moveBlock(ctx, { blockId: block.id, startsAt: input.startsAt, endsAt });
  }
  return scheduleTask(ctx, { taskId: block.task_id, startsAt: input.startsAt, endsAt });
}

export async function unscheduleBlock(ctx: ActionContext, blockId: string): Promise<ScheduleBlock> {
  const { data, error } = await ctx.supabase.rpc("unschedule_block", { p_block_id: blockId }).single();
  if (error) {
    if (error.code === "23514") throw new AppError("CONFLICT", "이미 처리된 일정입니다.");
    throw fromDbError(error);
  }
  return data as ScheduleBlock;
}

export async function updateSchedulerSettings(
  ctx: ActionContext,
  input: UpdateSchedulerSettingsInput,
): Promise<void> {
  const { error } = await ctx.supabase
    .from("scheduler_settings")
    .update({ show_actual_default: input.showActualDefault })
    .eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}
```
If `.single()` on `unschedule_block` narrows to `never` (as with A's `stop_work_session`), cast via
`const block = data as ScheduleBlock;`.

- [ ] **Step 3: Actions** (append to `schedule.actions.ts`, and extend the schema import)

```ts
export async function rescheduleBlockAction(input: unknown) {
  return runAction("schedule.reschedule", rescheduleBlockSchema, input, async (data, ctx) =>
    done(await scheduling.rescheduleBlock(ctx, data)),
  );
}

export async function unscheduleBlockAction(input: unknown) {
  return runAction("schedule.unschedule", blockIdSchema, input, async ({ blockId }, ctx) =>
    done(await scheduling.unscheduleBlock(ctx, blockId)),
  );
}

export async function updateSchedulerSettingsAction(input: unknown) {
  return runAction("scheduler.settings", updateSchedulerSettingsSchema, input, async (data, ctx) =>
    done(await scheduling.updateSchedulerSettings(ctx, data)),
  );
}
```

- [ ] **Step 4: Page and job**
- `page.tsx`: after `const context = await getSchedulerContext(...)`, add
  `await markMissedBlocks(supabase, user.id);`, and import it from
  `@/features/scheduler/services/scheduling.service`. Blocks are read after this, so they show `missed`.
- `jobs.ts` `runDurationProfileRefresh` handler: before `rebuildUserProfiles`, add
  `const missed = await markMissedBlocks(ctx.supabase, ctx.user.id);` and put `missed` into `detail`
  (`{ templates, missed }`). Import the function.

If `scheduling.service.ts` starts with `import "server-only"` and the page import complains, it won't:
page.tsx is a server component. The job imports it the same way it already imports other scheduler services.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`. Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "B4: reschedule/unschedule/settings services; mark missed on load and nightly"
```

---

### Task 5: Block actions on the calendar card

**Files:**
- Create: `src/features/scheduler/components/block-actions.tsx`
- Modify: `src/features/scheduler/components/calendar-event-content.tsx`
- Modify: `src/features/scheduler/components/weekly-calendar.tsx`
- Modify: `src/features/scheduler/components/switch-task-dialog.tsx`
- Modify: `src/features/scheduler/components/scheduler-workspace.tsx`

**Interfaces:**
- Consumes: `blockState`, `nextFreeSlot`, `sameTimeTomorrow` (Task 2); `rescheduleBlockAction`,
  `unscheduleBlockAction`, `setScheduleBlockStatusAction` (Task 4); `completeTaskAction` (existing).
- Produces:
  - `type BlockActionHandlers = { onStartBlock: (block: CalendarBlock) => void }` passed from the workspace through
    `WeeklyCalendar` to `CalendarEventContent`.
  - `BlockActions({ block, state, blocks, context, now, onStart, inline })`: buttons `${title} 시작` (▶) and
    `${title} 일정 메뉴` (⋯). Menu items: `할 일 완료`, `오늘 HH:MM`, `내일 HH:MM`, `시간 선택…`, `건너뛰기`, `미배정으로`.
  - The switch dialog target becomes `{ task: Task; blockId?: string }`.

- [ ] **Step 1: Switch target carries a block**

In `switch-task-dialog.tsx`, change the prop to `target: { task: Task; blockId?: string } | null`. Use
`target.task.title` in the text, and call `switchWorkSessionAction({ taskId: target.task.id, blockId: target.blockId })`.
When `blockId` is set, pass only `{ blockId: target.blockId }`, since the block decides the task in
`start_work_session`.

In `scheduler-workspace.tsx`:
- `switchTarget` state type becomes `{ task: Task; blockId?: string } | null`.
- `startTask(task)` stays for list/drawer starts and sets `{ task }`.
- Add:
  ```tsx
  const startBlock = (block: CalendarBlock) => {
    if (!activeSession) return run(() => startWorkSessionAction({ blockId: block.id }));
    setSwitchTarget({ task: block.task, blockId: block.id });
  };
  ```
- The summary `thenStart` becomes `{ task: Task; blockId?: string }`, and `onDone` starts with
  `next.blockId ? { blockId: next.blockId } : { taskId: next.task.id }`.
- Pass `onStartBlock={startBlock}` to `WeeklyCalendar`.

- [ ] **Step 2: BlockActions** `block-actions.tsx`

```tsx
"use client";

import { useState } from "react";
import { MoreHorizontal, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionRunner } from "@/hooks/use-action-runner";
import {
  rescheduleBlockAction,
  setScheduleBlockStatusAction,
  unscheduleBlockAction,
} from "../actions/schedule.actions";
import { completeTaskAction } from "../actions/task.actions";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext } from "../domain/task.types";
import { nextFreeSlot, sameTimeTomorrow, type BlockVisualState } from "../utils/block-state";
import { localDateTimeToIso, toLocalDate, toLocalTime } from "../utils/timezone";

/** Stop FullCalendar from starting a drag or firing eventClick for our controls (Review Focus 5). */
const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onClick: (e: React.MouseEvent) => e.stopPropagation() };

export function BlockActions({
  block,
  state,
  blocks,
  context,
  now,
  inline,
  onStart,
}: {
  block: CalendarBlock;
  state: BlockVisualState;
  blocks: CalendarBlock[];
  context: SchedulerContext;
  now: Date;
  /** Tall not-started blocks show text buttons instead of icons. */
  inline: boolean;
  onStart: () => void;
}) {
  const { run, pending } = useActionRunner();
  const [picking, setPicking] = useState(false);
  const { timezone, settings } = context;
  const taskOpen = block.task.status !== "completed" && block.task.status !== "cancelled";
  const actionable = state === "planned" || state === "not_started" || state === "missed";
  if (!taskOpen || !actionable) return null;

  const length = (new Date(block.ends_at).getTime() - new Date(block.starts_at).getTime()) / 60_000;
  const today = nextFreeSlot({
    now,
    lengthMinutes: length,
    blocks,
    excludeBlockId: block.id,
    timezone,
    workdayStart: settings.workday_start,
  });
  const tomorrow = sameTimeTomorrow(block.starts_at, timezone);
  const reschedule = (startsAt: string) =>
    run(() => rescheduleBlockAction({ blockId: block.id, startsAt }), { success: "일정을 다시 잡았습니다." });
  const canStart = state !== "missed";

  return (
    <span className="flex items-center gap-0.5" {...stop}>
      {canStart &&
        (inline ? (
          <Button size="xs" variant="secondary" disabled={pending} onClick={onStart}>
            지금 시작
          </Button>
        ) : (
          <button
            type="button"
            aria-label={`${block.task.title} 시작`}
            onClick={onStart}
            className="rounded-sm p-0.5 hover:bg-background/60"
          >
            <Play className="size-3" aria-hidden />
          </button>
        ))}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${block.task.title} 일정 메뉴`}
          className="rounded-sm p-0.5 hover:bg-background/60"
        >
          <MoreHorizontal className="size-3" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onClick={() => run(() => completeTaskAction({ taskId: block.task_id }))}>
            할 일 완료
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">다시 잡기</DropdownMenuLabel>
          {today && (
            <DropdownMenuItem onClick={() => reschedule(today)}>오늘 {toLocalTime(today, timezone)}</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => reschedule(tomorrow)}>내일 {toLocalTime(tomorrow, timezone)}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPicking(true)}>시간 선택…</DropdownMenuItem>
          <DropdownMenuSeparator />
          {state !== "missed" && (
            <DropdownMenuItem
              onClick={() => run(() => setScheduleBlockStatusAction({ blockId: block.id, status: "skipped" }))}
            >
              건너뛰기
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => run(() => unscheduleBlockAction({ blockId: block.id }))}>
            미배정으로
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const startsAt = localDateTimeToIso(String(fd.get("date")), String(fd.get("time")), timezone);
              run(() => rescheduleBlockAction({ blockId: block.id, startsAt }), {
                success: "일정을 다시 잡았습니다.",
                onSuccess: () => setPicking(false),
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>시간 선택</DialogTitle>
            </DialogHeader>
            <div className="my-4 flex gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`pick-date-${block.id}`} className="text-xs text-muted-foreground">
                  날짜
                </Label>
                <Input id={`pick-date-${block.id}`} name="date" type="date" required defaultValue={toLocalDate(tomorrow, timezone)} />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor={`pick-time-${block.id}`} className="text-xs text-muted-foreground">
                  시작 시각
                </Label>
                <Input id={`pick-time-${block.id}`} name="time" type="time" required defaultValue={toLocalTime(block.starts_at, timezone)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                다시 잡기
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </span>
  );
}
```
If `DropdownMenuItem` in this Base UI wrapper uses `onClick` differently (for example `onSelect`), use whatever
`src/components/ui/dropdown-menu.tsx` forwards. Read its `DropdownMenuItem` props first.

- [ ] **Step 3: CalendarEventContent**

Replace the block branch with a version that takes the state and actions. New props:
`{ arg, timezone, context, blocks, sessions, now, onStartBlock }`. The session branch stays as it is.

```tsx
  const block = arg.event.extendedProps.block as CalendarBlock | undefined;
  if (!block) {
    // Drag mirror of an external task: show the recommendation (Task 7 fills `recommendedMinutes`).
    const rec = arg.event.extendedProps.recommendedMinutes as number | undefined;
    return (
      <div className="flex h-full flex-col overflow-hidden px-1 py-0.5 leading-tight">
        <p className="truncate text-xs font-medium">{arg.event.title}</p>
        {rec && <p className="truncate text-[11px] opacity-80">추천 {formatMinutes(rec)}</p>}
      </div>
    );
  }
  const state = blockState(block, sessions, now);
  const start = arg.event.start;
  const end = arg.event.end;
  const time = start && end ? `${toLocalTime(start, timezone)}–${toLocalTime(end, timezone)}` : arg.timeText;
  const tall = start && end ? end.getTime() - start.getTime() >= 45 * 60_000 : false;

  return (
    <div className="group/block flex h-full flex-col overflow-hidden px-1 py-0.5 leading-tight">
      <div className="flex items-start gap-1">
        <p className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs font-medium">
          {state === "completed" && <Check className="size-3 shrink-0" aria-hidden />}
          {state === "skipped" && <SkipForward className="size-3 shrink-0" aria-hidden />}
          {(state === "not_started" || state === "missed") && <AlertTriangle className="size-3 shrink-0" aria-hidden />}
          {block.is_locked && <Lock className="size-3 shrink-0" aria-hidden />}
          <span className="truncate">{arg.event.title}</span>
        </p>
        {!arg.isMirror && (
          <span
            className={cn(
              "shrink-0",
              state === "not_started" || state === "missed" ? "" : "md:opacity-0 md:group-hover/block:opacity-100 md:focus-within:opacity-100",
            )}
          >
            <BlockActions
              block={block}
              state={state}
              blocks={blocks}
              context={context}
              now={now}
              inline={false}
              onStart={() => onStartBlock(block)}
            />
          </span>
        )}
      </div>
      <p className="truncate text-[11px] tabular-nums opacity-80">
        {time}
        {state === "not_started" && " · 시작 안 함"}
        {state === "missed" && " · 놓침"}
        {state === "running" && " · 진행 중"}
        {(state === "completed" || state === "skipped") && ` · ${BLOCK_STATUS_LABEL[state]}`}
      </p>
      {state === "not_started" && tall && !arg.isMirror && (
        <div className="mt-1">
          <BlockActions
            block={block}
            state={state}
            blocks={blocks}
            context={context}
            now={now}
            inline
            onStart={() => onStartBlock(block)}
          />
        </div>
      )}
    </div>
  );
```
Imports:
- `AlertTriangle` from lucide.
- `cn` from `@/lib/utils`.
- `BlockActions`.
- `blockState`.
- `formatMinutes` from `../utils/duration`.
- `SchedulerContext`, `SessionWithTask` types.

For a tall not-started block, the top-right icon actions and the inline row both render. Keep both: the icons give
the menu, the inline row gives the one-tap start.

- [ ] **Step 4: WeeklyCalendar wiring**
- Add the props `onStartBlock: (block: CalendarBlock) => void` and `showActual: boolean` (Task 6 supplies it;
  for now pass `true` from the workspace).
- `useNow` is currently only for running sessions. Make it always tick every 60 s:
  `const now = useNow(60_000);`. Remove the `hasRunning` argument; running sessions still re-render every
  minute, which matches today's behavior.
- The block class names add the visual state:
  `classNames: ["sched-block", \`sched-block--${b.status}\`, blockState(b, sessions, now) === "not_started" ? "sched-block--not-started" : ""].filter(Boolean)`.
- A missed block is not editable: `editable: b.status === "planned" && blockState(b, sessions, now) !== "missed"`.
- `eventContent={(arg) => <CalendarEventContent arg={arg} timezone={timezone} context={context} blocks={blocks} sessions={sessions} now={now} onStartBlock={onStartBlock} />}`.
- Keep `useMemo` deps in sync. Add `now` where `blockState` is used inside the events memo.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`. Expected: pass. Browser checks are in Task 8.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "B5: block card states and actions (start, complete, reschedule, skip, unschedule)"
```

---

### Task 6: Actual-work overlay toggle and settings menu

**Files:**
- Create: `src/features/scheduler/components/scheduler-settings-menu.tsx`
- Modify: `src/features/scheduler/components/scheduler-workspace.tsx`
- Modify: `src/features/scheduler/components/weekly-calendar.tsx`

**Interfaces:**
- Consumes: `updateSchedulerSettingsAction` (Task 4), `context.settings.show_actual_default` (Task 3).
- Produces:
  - Checkbox `실제 작업 보기` (label) in the header.
  - Button `스케줄러 설정`, a DropdownMenu with the checkbox item `실제 작업을 기본으로 표시`.

- [ ] **Step 1: Settings menu**

```tsx
"use client";

import { Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionRunner } from "@/hooks/use-action-runner";
import { updateSchedulerSettingsAction } from "../actions/schedule.actions";

/** User defaults for the scheduler view (calendar-planning design §2). */
export function SchedulerSettingsMenu({ showActualDefault }: { showActualDefault: boolean }) {
  const { run } = useActionRunner();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="스케줄러 설정"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Settings className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuCheckboxItem
          checked={showActualDefault}
          onCheckedChange={(checked) =>
            run(() => updateSchedulerSettingsAction({ showActualDefault: Boolean(checked) }), {
              success: "기본 설정을 저장했습니다.",
            })
          }
        >
          실제 작업을 기본으로 표시
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```
Read `DropdownMenuCheckboxItem`'s props in `src/components/ui/dropdown-menu.tsx` first (Base UI:
`checked` / `onCheckedChange`).

- [ ] **Step 2: Workspace toggle**

In `scheduler-workspace.tsx`:
```tsx
  const [showActual, setShowActual] = useState(context.settings.show_actual_default);
```
In the header's right cluster, before `WeekNavigation`:
```tsx
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showActual}
              onChange={(e) => setShowActual(e.target.checked)}
              className="size-3.5 accent-foreground"
            />
            실제 작업 보기
          </label>
          <SchedulerSettingsMenu showActualDefault={context.settings.show_actual_default} />
```
Pass `showActual={showActual}` to `WeeklyCalendar`, replacing the temporary `true` from Task 5.

- [ ] **Step 3: Calendar filter**

In `weekly-calendar.tsx`, in the events memo, use
`...sessions.filter((x) => showActual || x.ended_at === null).map(...)` instead of `...sessions.map(...)`
(running is always shown). Add `showActual` to the deps. `blockState` still receives the full `sessions`, so
not-started/missed detection doesn't depend on the overlay.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "B6: actual-work overlay toggle with a saved default"
```

---

### Task 7: Drop preview recommendation and keep-my-estimate toast

**Files:**
- Modify: `src/features/scheduler/components/task-list-item.tsx`
- Modify: `src/features/scheduler/components/today-task-panel.tsx`
- Modify: `src/features/scheduler/components/weekly-calendar.tsx`

**Interfaces:**
- Consumes: `DurationEstimate` (`minutes`, `scope`, `sampleCount`), `moveScheduleBlockAction` (existing).
- Produces:
  - The drag data attributes `data-recommended` (minutes, only when learned) and `data-samples`.
  - The drop toast action label `${formatMinutes(estimate)} 유지`.

- [ ] **Step 1: Data attributes**

In `task-list-item.tsx`'s draggable spread, add:
```tsx
        "data-recommended": learned ? String(estimate!.minutes) : undefined,
        "data-samples": learned ? String(estimate!.sampleCount) : undefined,
```

In `today-task-panel.tsx`'s Draggable `eventData.extendedProps`, add:
```ts
            recommendedMinutes: itemEl.hasAttribute("data-recommended")
              ? Number(itemEl.getAttribute("data-recommended"))
              : undefined,
            sampleCount: Number(itemEl.getAttribute("data-samples") ?? 0),
```

- [ ] **Step 2: Toast after drop**

In `weekly-calendar.tsx` `handleReceive`, after `setBlocks(...)` / `warnOverlap(...)` for a created block:
```ts
      const estimateMin = task.user_estimated_minutes;
      const blockMin = Math.round((new Date(block.ends_at).getTime() - new Date(block.starts_at).getTime()) / 60_000);
      if (result.data.source === "duration_recommendation" && estimateMin && Math.abs(blockMin - estimateMin) >= 10) {
        const samples = Number(info.event.extendedProps.sampleCount ?? 0);
        toast(`추천 ${formatMinutes(blockMin)}으로 잡았어요`, {
          description: samples > 0 ? `비슷한 작업 ${samples}개 기준` : undefined,
          duration: 10_000,
          action: {
            label: `${formatMinutes(estimateMin)} 유지`,
            onClick: async () => {
              const endsAt = new Date(new Date(block.starts_at).getTime() + estimateMin * 60_000).toISOString();
              const r = await moveScheduleBlockAction({ blockId: block.id, startsAt: block.starts_at, endsAt });
              if (!r.ok) return toast.error(r.message);
              setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, ends_at: endsAt } : b)));
            },
          },
        });
      }
```
`task` is the `tasksById.get(taskId)` already in scope. Import `formatMinutes` from `../utils/duration`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`. Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "B7: drop preview shows the recommendation; toast offers keeping my estimate"
```

---

### Task 8: E2E, docs, final verification

**Files:**
- Create: `tests/e2e/calendar-planning.spec.ts`
- Modify: `tests/e2e/duration-learning.spec.ts`
- Create: `docs/decisions/0012-missed-blocks-and-rescheduling.md`
- Modify: `docs/decisions/README.md`, `docs/schema.md`, `docs/progress.md`

- [ ] **Step 1: duration-learning keep-my-estimate**

In `tests/e2e/duration-learning.spec.ts`, right after
`expect(task!.recommended_minutes).toBe(80);`, add:
```ts
    // Recommendation differs from the 60-minute estimate by ≥ 10 → toast offers keeping it.
    await page.getByRole("button", { name: "1h 유지" }).click();
    await expect(savedEvent(page, title)).toContainText("10:00–11:00");
    const { data: kept } = await db.from("schedule_blocks").select("starts_at, ends_at").eq("task_id", task!.id).single();
    expect((Date.parse(kept!.ends_at) - Date.parse(kept!.starts_at)) / 60_000).toBe(60);
```
Also change its select to `select("id, recommended_minutes")` if `id` isn't already selected (it is).

- [ ] **Step 2: calendar-planning.spec.ts**

```ts
import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

const iso = (ms: number) => new Date(ms).toISOString();
const localDate = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));

test.describe("calendar planning", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("start from a block without opening the drawer", async ({ page }) => {
    const db = await dbAsUser();
    const { data: running } = await db.from("work_sessions").select("id").is("ended_at", null);
    test.skip((running?.length ?? 0) > 0, "A real timer is running on this account; not touching it.");
    const { data: me } = await db.auth.getUser();
    const title = `${E2E_PREFIX} 블록 시작 ${Date.now()}`;
    const { data: task } = await db
      .from("tasks")
      .insert({ user_id: me.user!.id, title, user_estimated_minutes: 60 })
      .select("id")
      .single();
    const start = Date.now() + 5 * 60_000;
    const { data: block } = await db
      .rpc("create_schedule_block", { p_task_id: task!.id, p_starts_at: iso(start), p_ends_at: iso(start + 3_600_000) })
      .single();

    await login(page);
    await page.goto(`/scheduler?week=${localDate(start)}`);
    const event = page.locator(".fc-event.sched-block", { hasText: title });
    await event.hover();
    await event.getByRole("button", { name: `${title} 시작` }).click();
    await expect(page.getByRole("status", { name: "집중 중인 작업" })).toContainText(title);
    await expect(page.getByRole("dialog", { name: title })).toHaveCount(0); // drawer did not open
    const { data: session } = await db
      .from("work_sessions")
      .select("schedule_block_id")
      .eq("task_id", task!.id)
      .single();
    expect(session!.schedule_block_id).toBe((block as { id: string }).id);
  });

  test("missed block → reschedule tomorrow creates a new block and keeps the miss", async ({ page }) => {
    const db = await dbAsUser();
    const { data: me } = await db.auth.getUser();
    const title = `${E2E_PREFIX} 놓친 블록 ${Date.now()}`;
    const { data: task } = await db
      .from("tasks")
      .insert({ user_id: me.user!.id, title, user_estimated_minutes: 30 })
      .select("id")
      .single();
    const start = Date.now() - 2 * 3_600_000;
    const { data: created } = await db
      .rpc("create_schedule_block", { p_task_id: task!.id, p_starts_at: iso(start), p_ends_at: iso(start + 1_800_000) })
      .single();
    const oldId = (created as { id: string }).id;

    await login(page);
    await page.goto(`/scheduler?week=${localDate(start)}`);
    const event = page.locator(".fc-event.sched-block", { hasText: title });
    await expect(event).toContainText("놓침");
    await event.getByRole("button", { name: `${title} 일정 메뉴` }).click();
    await page.getByRole("menuitem", { name: /^내일 / }).click();

    await expect
      .poll(async () => (await db.from("schedule_blocks").select("id").eq("task_id", task!.id)).data?.length)
      .toBe(2);
    const { data: blocks } = await db
      .from("schedule_blocks")
      .select("id, status, starts_at")
      .eq("task_id", task!.id)
      .order("starts_at");
    expect(blocks![0]).toMatchObject({ id: oldId, status: "missed" });
    expect(blocks![1].status).toBe("planned");
    expect(localDate(Date.parse(blocks![1].starts_at))).toBe(localDate(start + 86_400_000));
  });

  test("actual-work toggle hides finished sessions; the default setting persists", async ({ page }) => {
    const db = await dbAsUser();
    const { data: me } = await db.auth.getUser();
    const { data: settings } = await db.from("scheduler_settings").select("show_actual_default").single();
    const title = `${E2E_PREFIX} 실제 표시 ${Date.now()}`;
    const { data: task } = await db
      .from("tasks")
      .insert({ user_id: me.user!.id, title })
      .select("id")
      .single();
    const start = Date.now() - 26 * 3_600_000; // yesterday-ish, never in the future
    await db.from("work_sessions").insert({
      user_id: me.user!.id,
      task_id: task!.id,
      started_at: iso(start),
      ended_at: iso(start + 1_800_000),
      source: "manual",
    });
    try {
      await db.from("scheduler_settings").update({ show_actual_default: false }).eq("user_id", me.user!.id);
      await login(page);
      await page.goto(`/scheduler?week=${localDate(start)}`);
      const session = page.locator(".fc-event.sched-session", { hasText: title });
      await expect(session).toHaveCount(0);
      await page.getByLabel("실제 작업 보기").check();
      await expect(session.first()).toBeVisible();

      await page.getByRole("button", { name: "스케줄러 설정" }).click();
      await page.getByRole("menuitemcheckbox", { name: "실제 작업을 기본으로 표시" }).click();
      await expect
        .poll(async () => (await db.from("scheduler_settings").select("show_actual_default").single()).data?.show_actual_default)
        .toBe(true);
      await page.reload();
      await expect(page.getByLabel("실제 작업 보기")).toBeChecked();
    } finally {
      await db
        .from("scheduler_settings")
        .update({ show_actual_default: settings!.show_actual_default })
        .eq("user_id", me.user!.id);
    }
  });
});
```

- [ ] **Step 3: Docs**
- `docs/decisions/0012-missed-blocks-and-rescheduling.md`:
  ```markdown
  # 0012. Missed blocks and rescheduling
  - Status: accepted
  - Date: 2026-09-30

  ## Decision
  - `schedule_blocks.status` adds `missed`, set only by `mark_missed_blocks(user)` (on page load and in the nightly
    duration-profile job). A block is missed when it ended without a linked session or a same-task session starting
    in [start − 30 min, end). "Not started" (start + 15 min, before the end) is derived in the UI, never stored.
  - Missed blocks are history: they can't be moved or reopened, only cancelled ("미배정으로"). Rescheduling before
    the end moves the block (revision); after the end it creates a new block.
  - `unschedule_block` cancels a planned/missed block and returns an idle planned task to the inbox when no other
    planned block remains.
  - The recommendation confirm is an action toast, not a card beside the block (requirements §7 deviation): no
    calendar-anchored positioning, and it works on mobile and with screen readers.
  - On mobile the ▶/⋯ controls are always visible instead of opening a bottom sheet (spec deviation). Same actions,
    fewer layers.
  - D must not count resizes made within 5 minutes of a block's creation as rescheduling ("keep my estimate").
  ```
- Add `| 0012 | Missed blocks and rescheduling | accepted |` to `docs/decisions/README.md`.
- In `docs/schema.md`, add a `## Calendar planning (Improvement B, ADR 0012)` section with the status list, the two
  functions and their errors, and `scheduler_settings.show_actual_default`.
- In `docs/progress.md`, add an `## Improvement B — calendar planning` checklist (migration + SQL tests; block
  state utils; block actions; overlay toggle + setting; drop toast; E2E).

- [ ] **Step 4: Full verification**

```bash
npx tsc --noEmit
npx eslint .
npx vitest run
npm run build
set -a; source .env.local; set +a; E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=… E2E_PASSWORD=… npx playwright test
```
Expected:
- All pass. E2E: 7 suites (6 existing + calendar-planning).
- MCP `execute_sql` `select count(*) from public.tasks where title like '[e2e]%'` → 0.

Also check the mobile layout with a screenshot at 390 px (block ▶/⋯ visible and not overlapping the title).

- [ ] **Step 5: Commit**

```bash
git add tests docs
git commit -m "B8: E2E for calendar planning; ADR 0012, docs"
```
