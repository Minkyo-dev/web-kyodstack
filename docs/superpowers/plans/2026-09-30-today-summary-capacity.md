# Today View, Week Summary, Capacity Notice (Sub-project D3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Turn the left panel into a Today view: summary, then 지금 / 다음 / 이후 / 미배정 / 완료.
- Add a one-line week summary above the calendar.
- Add a capacity notice that pre-selects overflow blocks and moves them to tomorrow only when the user confirms.

**Architecture:**
- **Pure logic:** `scheduler/utils/today.ts` (`todaySections`, `overloadFor`, `overflowSelection`) and
  `analytics/utils/capacity.ts` (`dailyCapacity`, shared with D2's `computeStats`).
- **Data:** the page loads capacity input, today+tomorrow blocks and the week's completed count.
- **Components:** new components render these results; block rows reuse B's `BlockActions`.

**Tech Stack:** Next.js 16, React 19, Supabase, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-today-summary-capacity-design.md`.

## Global Constraints
- `AGENTS.md` rules. No schema change in D3.
- The admin client stays job-only; page queries filter `user_id` explicitly where they are shared with jobs.
- Nothing moves without a confirm. Copy is factual, and text carries the meaning, not color.
- Stage explicit paths only (`AGENTS.md` is the user's).
- Before each commit: `npx tsc --noEmit && npx eslint . && npx vitest run`. The last task adds a build and the
  full E2E.
- Plan-level ruling (spec gap): for the overload check, a day's planned minutes count blocks with status
  `planned`, `completed` or `missed`. Skipped blocks are excluded because the user already declared them not
  happening, and cancelled ones are excluded as in the spec.

## Review Focus
1. **The running task also has no future block.** It must appear only once (under 지금, not also under 미배정).
   → Task 1 test.
2. **A task whose only upcoming block is tomorrow.** It appears in neither today's sections nor 미배정.
   → Task 1 test.
3. **Overload with capacity null (new account).** No notice. → Task 1 test.
4. **Pre-selection when every candidate is priority 1.** It falls back to the latest start first.
   → Task 1 test.
5. **The adjust dialog after a reschedule partly fails.** It reports the counts and closes, and the page refreshes.
   → Task 3 implementation (toast `N개 옮김, M개 실패`).

---

### Task 1: Pure utilities (today sections, overload, capacity)

**Files:**
- Create: `src/features/scheduler/utils/today.ts`, `src/features/analytics/utils/capacity.ts`
- Modify: `src/features/analytics/utils/stats.ts` (use `dailyCapacity`)
- Test: `tests/unit/today.test.ts`

**Interfaces:**
```ts
// today.ts
export type TodaySections = {
  running: SessionWithTask | null;
  current: CalendarBlock[];      // planned/not-started blocks covering now
  missed: CalendarBlock[];       // today's missed blocks
  next: CalendarBlock | null;
  later: CalendarBlock[];
  unscheduled: Task[];
  completed: Task[];
};
export function todaySections(input: { tasks: Task[]; blocks: CalendarBlock[]; sessions: SessionWithTask[]; activeSession: SessionWithTask | null; now: Date; todayRange: { start: string; end: string }; tagFilter: string[] }): TodaySections;
export function dayPlannedMinutes(blocks: { starts_at: string; ends_at: string; status: string }[], range: { start: string; end: string }): number;
export function overloadFor(plannedMinutes: number, capacity: number | null): boolean;
export type OverflowCandidate = { id: string; minutes: number; priority: number; starts_at: string };
export function overflowSelection(candidates: OverflowCandidate[], plannedMinutes: number, capacity: number): string[];
// capacity.ts
export function dailyCapacity(input: { sessions: { started_at: string; ended_at: string | null; pauses: PauseLike[] }[]; plannedWorkDays: number[]; minMeaningfulMinutes: number; timezone: string; now: string }): number | null;
```

- [ ] **Step 1: Failing tests** `tests/unit/today.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { dayPlannedMinutes, overflowSelection, overloadFor, todaySections } from "@/features/scheduler/utils/today";
import { dailyCapacity } from "@/features/analytics/utils/capacity";
import type { CalendarBlock } from "@/features/scheduler/domain/schedule.types";
import type { Task } from "@/features/scheduler/domain/task.types";
import type { SessionWithTask } from "@/features/scheduler/domain/work-session.types";

const L = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-04:00`).toISOString();
const DAY = "2026-10-28";
const todayRange = { start: L(DAY, "00:00"), end: L("2026-10-29", "00:00") };
const now = new Date(L(DAY, "12:00"));
const task = (id: string, over: Partial<Task> = {}) =>
  ({ id, title: id, status: "planned", priority: 3, tags: [], ...over }) as unknown as Task;
const block = (id: string, taskId: string, start: string, end: string, status = "planned", t = task(taskId)) =>
  ({ id, task_id: taskId, starts_at: start, ends_at: end, status, task: t }) as unknown as CalendarBlock;
const sess = (taskId: string, start: string, end: string | null, blockId: string | null = null) =>
  ({ id: `s-${taskId}`, task_id: taskId, schedule_block_id: blockId, started_at: start, ended_at: end, pauses: [], work_log: null, task: { id: taskId, title: taskId } }) as unknown as SessionWithTask;
const base = { tasks: [] as Task[], blocks: [] as CalendarBlock[], sessions: [] as SessionWithTask[], activeSession: null, now, todayRange, tagFilter: [] as string[] };

describe("todaySections", () => {
  it("current / next / later / missed from today's blocks", () => {
    const blocks = [
      block("m", "tm", L(DAY, "08:00"), L(DAY, "09:00")), // ended, no session → missed
      block("c", "tc", L(DAY, "11:30"), L(DAY, "12:30")), // covers now
      block("n", "tn", L(DAY, "14:00"), L(DAY, "15:00")),
      block("l", "tl", L(DAY, "16:00"), L(DAY, "17:00")),
    ];
    const s = todaySections({ ...base, blocks, tasks: blocks.map((b) => b.task) });
    expect(s.missed.map((b) => b.id)).toEqual(["m"]);
    expect(s.current.map((b) => b.id)).toEqual(["c"]);
    expect(s.next?.id).toBe("n");
    expect(s.later.map((b) => b.id)).toEqual(["l"]);
    expect(s.unscheduled).toEqual([]);
  });
  it("running task shows once; its block isn't listed as current", () => {
    const t = task("run", { status: "in_progress" });
    const b = block("rb", "run", L(DAY, "11:30"), L(DAY, "12:30"), "planned", t);
    const active = sess("run", L(DAY, "11:35"), null, "rb");
    const s = todaySections({ ...base, tasks: [t], blocks: [b], sessions: [active], activeSession: active });
    expect(s.running?.task_id).toBe("run");
    expect(s.current).toEqual([]);
    expect(s.unscheduled).toEqual([]);
  });
  it("unscheduled = open tasks without an upcoming block; other-day-only tasks are excluded", () => {
    const tomorrowOnly = task("tmr");
    const loose = task("loose", { status: "inbox" });
    const blocks = [block("t1", "tmr", L("2026-10-29", "10:00"), L("2026-10-29", "11:00"), "planned", tomorrowOnly)];
    const s = todaySections({ ...base, tasks: [tomorrowOnly, loose], blocks });
    expect(s.unscheduled.map((t) => t.id)).toEqual(["loose"]);
    expect([s.next, ...s.later, ...s.current]).toEqual([null]);
  });
  it("completed today and tag filter", () => {
    const tag = { id: "g", name: "x", color: null };
    const a = task("a", { status: "inbox", tags: [tag] });
    const b = task("b", { status: "inbox" });
    const c = task("c", { status: "completed", tags: [tag] });
    const s = todaySections({ ...base, tasks: [a, b, c], tagFilter: ["g"] });
    expect(s.unscheduled.map((t) => t.id)).toEqual(["a"]);
    expect(s.completed.map((t) => t.id)).toEqual(["c"]);
  });
});

describe("overload", () => {
  it("planned minutes exclude skipped and cancelled; clip to the day", () => {
    const blocks = [
      { starts_at: L(DAY, "09:00"), ends_at: L(DAY, "10:00"), status: "planned" },
      { starts_at: L(DAY, "10:00"), ends_at: L(DAY, "11:00"), status: "skipped" },
      { starts_at: L(DAY, "11:00"), ends_at: L(DAY, "12:00"), status: "cancelled" },
      { starts_at: L(DAY, "23:30"), ends_at: L("2026-10-29", "00:30"), status: "missed" },
    ];
    expect(dayPlannedMinutes(blocks, todayRange)).toBe(90);
  });
  it("> 1.3× capacity and ≥ 60 min above", () => {
    expect(overloadFor(300, 200)).toBe(true); // 1.5×, +100
    expect(overloadFor(260, 200)).toBe(false); // exactly 1.3×
    expect(overloadFor(150, 100)).toBe(false); // 1.5× but only +50
    expect(overloadFor(500, null)).toBe(false);
  });
  it("overflowSelection: low priority (high number) first, then latest start, until within capacity", () => {
    const c = [
      { id: "a", minutes: 60, priority: 1, starts_at: L(DAY, "09:00") },
      { id: "b", minutes: 60, priority: 5, starts_at: L(DAY, "10:00") },
      { id: "c", minutes: 60, priority: 3, starts_at: L(DAY, "15:00") },
      { id: "d", minutes: 60, priority: 3, starts_at: L(DAY, "13:00") },
    ];
    expect(overflowSelection(c, 240, 120)).toEqual(["b", "c"]);
    const ones = c.map((x) => ({ ...x, priority: 1 }));
    expect(overflowSelection(ones, 240, 180)).toEqual(["c"]); // latest start first
  });
});

describe("dailyCapacity", () => {
  it("median of meaningful work days in the last 28 days (today excluded)", () => {
    const s = (d: string, mins: number) => ({ started_at: L(d, "09:00"), ended_at: new Date(new Date(L(d, "09:00")).getTime() + mins * 60_000).toISOString(), pauses: [] });
    const sessions = [s("2026-10-26", 60), s("2026-10-27", 180), s("2026-10-23", 10), s(DAY, 300)];
    const cap = dailyCapacity({ sessions, plannedWorkDays: [1, 2, 3, 4, 5], minMeaningfulMinutes: 30, timezone: "America/Toronto", now: now.toISOString() });
    expect(cap).toBe(120);
  });
});
```

- [ ] **Step 2: Run to verify it fails** (module not found).

- [ ] **Step 3: Implement**

`analytics/utils/capacity.ts`:
```ts
/** Typical daily capacity (D2 spec §2, D3 spec §3): median focused minutes of the last 28 days'
 * planned work days with at least the meaningful minimum. Today is excluded (not finished). Pure. */
import { addLocalDays, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { focusedMinutesInWindow, type PauseLike } from "@/features/scheduler/utils/focus";
import { median } from "@/features/scheduler/utils/estimator";

export function dailyCapacity(input: {
  sessions: { started_at: string; ended_at: string | null; pauses: PauseLike[] }[];
  plannedWorkDays: number[];
  minMeaningfulMinutes: number;
  timezone: string;
  now: string;
}): number | null {
  const tz = input.timezone;
  const nowMs = new Date(input.now).getTime();
  const today = toLocalDate(input.now, tz);
  const days: number[] = [];
  for (let d = addLocalDays(today, -28, tz); d < today; d = addLocalDays(d, 1, tz)) {
    if (!input.plannedWorkDays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) continue;
    const r = localDayRange(d, tz);
    const from = new Date(r.start).getTime();
    const to = new Date(r.end).getTime();
    const m = input.sessions.reduce((sum, s) => sum + focusedMinutesInWindow(s, s.pauses, from, to, nowMs), 0);
    if (m >= input.minMeaningfulMinutes) days.push(m);
  }
  return days.length ? Math.round(median(days)!) : null;
}
```
In `stats.ts`, replace the `capacityDays` computation and `dailyCapacityMinutes` value with
`dailyCapacity({ sessions: input.sessions, plannedWorkDays: planned, minMeaningfulMinutes: min, timezone: tz, now: input.now })`.
The D2 stats tests must stay green.

`scheduler/utils/today.ts`:
```ts
/** Today view sections (D3 spec §1), overload rule and overflow pre-selection (§3). Pure. */
import type { CalendarBlock } from "../domain/schedule.types";
import type { Task } from "../domain/task.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { blockState } from "./block-state";

const t = (iso: string) => new Date(iso).getTime();
const MIN = 60_000;

export type TodaySections = {
  running: SessionWithTask | null;
  current: CalendarBlock[];
  missed: CalendarBlock[];
  next: CalendarBlock | null;
  later: CalendarBlock[];
  unscheduled: Task[];
  completed: Task[];
};

export function todaySections(input: {
  tasks: Task[];
  blocks: CalendarBlock[];
  sessions: SessionWithTask[];
  activeSession: SessionWithTask | null;
  now: Date;
  todayRange: { start: string; end: string };
  tagFilter: string[];
}): TodaySections {
  const nowMs = input.now.getTime();
  const match = (task: Pick<Task, "tags">) =>
    input.tagFilter.length === 0 || task.tags.some((g) => input.tagFilter.includes(g.id));
  const from = t(input.todayRange.start);
  const to = t(input.todayRange.end);
  const runningTaskId = input.activeSession?.task_id ?? null;

  const today = input.blocks
    .filter((b) => (b.status === "planned" || b.status === "missed") && t(b.starts_at) < to && t(b.ends_at) > from)
    .filter((b) => match(b.task) && b.task_id !== runningTaskId)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const current: CalendarBlock[] = [];
  const missed: CalendarBlock[] = [];
  const upcoming: CalendarBlock[] = [];
  for (const b of today) {
    const state = blockState(b, input.sessions, input.now);
    if (state === "missed") missed.push(b);
    else if (state === "running") continue;
    else if (t(b.starts_at) <= nowMs && nowMs < t(b.ends_at)) {
      if (state === "planned" || state === "not_started") current.push(b);
    } else if (t(b.starts_at) > nowMs) upcoming.push(b);
  }

  const hasUpcomingBlock = new Set(
    input.blocks.filter((b) => b.status === "planned" && t(b.ends_at) > nowMs).map((b) => b.task_id),
  );
  const open = input.tasks.filter((x) => x.status !== "completed" && x.status !== "cancelled" && match(x));
  return {
    running: input.activeSession,
    current,
    missed,
    next: upcoming[0] ?? null,
    later: upcoming.slice(1),
    unscheduled: open.filter((x) => !hasUpcomingBlock.has(x.id) && x.id !== runningTaskId),
    completed: input.tasks.filter((x) => x.status === "completed" && match(x)),
  };
}

/** Planned minutes of one day for the overload check: planned/completed/missed blocks, clipped. */
export function dayPlannedMinutes(
  blocks: { starts_at: string; ends_at: string; status: string }[],
  range: { start: string; end: string },
): number {
  const from = t(range.start);
  const to = t(range.end);
  return blocks
    .filter((b) => b.status === "planned" || b.status === "completed" || b.status === "missed")
    .reduce((sum, b) => sum + Math.max(0, Math.min(t(b.ends_at), to) - Math.max(t(b.starts_at), from)) / MIN, 0);
}

export function overloadFor(plannedMinutes: number, capacity: number | null): boolean {
  return capacity !== null && plannedMinutes > 1.3 * capacity && plannedMinutes - capacity >= 60;
}

export type OverflowCandidate = { id: string; minutes: number; priority: number; starts_at: string };

/** Least important (highest number) first, then the latest start, until planned fits the capacity. */
export function overflowSelection(candidates: OverflowCandidate[], plannedMinutes: number, capacity: number): string[] {
  const order = [...candidates].sort((a, b) => b.priority - a.priority || b.starts_at.localeCompare(a.starts_at));
  const picked: string[] = [];
  let remaining = plannedMinutes;
  for (const c of order) {
    if (remaining <= capacity) break;
    picked.push(c.id);
    remaining -= c.minutes;
  }
  return picked;
}
```
Check the first overflow test: sorted order b(5), c(3, 15:00), d(3, 13:00), a(1). Starting from 240 → pick b →
180 > 120 → pick c → 120 ≤ 120 → stop. Result `[b, c]`. ✓ Second: all 1 → c(15:00) → 180 ≤ 180 → stop → `[c]`. ✓

- [ ] **Step 4: Run** `npx vitest run` (the new tests plus the D2 stats tests). Expected: all PASS.
- [ ] **Step 5: Commit** `D3-1: today sections, overload rule, shared daily capacity`.

---

### Task 2: Data for the page

**Files:**
- Create: `src/features/analytics/queries/capacity.queries.ts`
- Modify: `src/features/scheduler/queries/task.queries.ts`, `src/app/(private)/scheduler/page.tsx`,
  `src/features/scheduler/components/scheduler-workspace.tsx` (props only)

**Interfaces:**
- `loadDailyCapacity(supabase, userId, now, settings, timezone): Promise<number | null>`: 28 days of sessions with
  pauses (`user_id` filter), then `dailyCapacity`.
- `countCompletedInRange(supabase, startIso, endIso): Promise<number>`: a head count on `tasks` with `status =
  completed` and `completed_at` in range.
- The page adds these to its parallel read: `capacity`, `weekCompleted` (the displayed week range) and
  `nearBlocks = listBlocksInRange(supabase, todayRange.start, tomorrowRange.end)`. It passes them to the
  workspace as `capacity`, `weekCompleted` and `nearBlocks`.

- [ ] Implement, then run tsc/eslint/vitest.
- [ ] Commit `D3-2: capacity, week completed count and near blocks for the scheduler page`.

---

### Task 3: Components and wiring

**Files:**
- Create: `src/features/scheduler/components/today-sections.tsx`, `week-summary.tsx`, `capacity-notice.tsx`
- Modify: `today-task-panel.tsx`, `today-metrics-bar.tsx`, `scheduler-workspace.tsx`

**Behavior:**
- **`TodayTaskPanel`:**
  - The header becomes `<h2>오늘</h2>` plus a summary line: `계획 X · 작업 Y · 남은 Z`, from
    `computeDaySummary` over `todayRange`.
    - "작업" = actual + running.
    - When remaining < 0, it reads "계획보다 Nm 더 작업".
  - Quick add, banner and tag filter stay.
  - The list area becomes a `div` (the Draggable container, same `ref`) holding `TodaySections`.
- **`TodaySections` props:** sections, the render helpers for task items (reuse the existing `TaskListItem`
  rendering for `unscheduled` and `completed`), `context`, `blocks`, `now`, `onStartBlock`, `onOpenTask`.
  - It renders headed groups (`<section aria-labelledby>`): 지금, 다음, 이후, 미배정, 오늘 완료. A group with no
    items is hidden, except 미배정, which shows its empty text "미배정 할 일이 없습니다.". 오늘 완료 is a
    `<details>`.
  - **지금:**
    - The running row: "진행 중 · {title}", with the focused clock from `focusStats` + `useNow(1000)`.
    - Current and missed rows: `BlockRow`.
  - **`BlockRow`:** `{time range} · {title}` plus a state label ("시작 안 함" / "놓침") plus `<BlockActions …
    inline={false} />`. The row button opens the drawer.
  - Unscheduled items keep `data-draggable-task` (via `TaskListItem`), so dragging keeps working.
- **`TodayMetricsBar`:** remove the 계획/실제 `Metric`s and keep 집중, 완료 and the reflection button (the dialog
  still gets `summary`).
- **`WeekSummary({ week, blocks, sessions, completed, today, timezone })`:**
  `computeDaySummary` over `[localDayRange(week.startDate).start, localDayRange(week.endDate).start)`.
  - Label: "이번 주" if today is in the week, else "이 주".
  - Text: `{label} · 계획 Xh · 작업 Yh · 완료 N개` (`formatMinutes`).
  - Render it as a `<p aria-label="주간 요약">` above the calendar section.
- **`CapacityNotice({ capacity, nearBlocks, sessions, today, timezone, settings })`:**
  - For today, then tomorrow: `dayPlannedMinutes(nearBlocks, range)`, then `overloadFor`, then check it isn't
    dismissed (localStorage via `useSyncExternalStore`, as `TemplateTypeBanner` does).
  - Shows the first overloaded day as a `role="note"` card: "{오늘|내일} 계획 P는 최근 근무일 보통 작업량 C보다 D
    많아요." with [계획 조정] and [그대로 두기].
  - **Dialog "계획 조정":**
    - Candidates are that day's blocks with status `planned` and `starts_at > now`, as `OverflowCandidate` with
      `priority = block.task.priority` and minutes from start/end.
    - Pre-checked with `overflowSelection`. Checkboxes list `{time} · {title} ({minutes})`.
    - The live line: "조정 후 계획 X · 보통 C".
    - Confirm: "선택한 N개를 다음 날 같은 시각으로" loops `rescheduleBlockAction({ blockId, startsAt:
      sameTimeTomorrow(b.starts_at, tz) })`, counts ok/failed, then toasts "N개 옮김" (+ ", M개 실패") and closes.
    - Empty candidates: "옮길 수 있는 일정이 없습니다."
- **Workspace:** render `<WeekSummary …/>` and `<CapacityNotice …/>` above the calendar inside the calendar
  column (make the section a flex column so the calendar keeps the remaining height).

- [ ] Implement, then run tsc/eslint/vitest. Take screenshots at 1400 and 390 px (today sections, week summary; the
  notice with seeded data).
- [ ] Commit `D3-3: Today sections, week summary, capacity notice with adjust dialog`.

---

### Task 4: E2E, docs, final verification

**Files:**
- Create: `tests/e2e/today.spec.ts`, `docs/decisions/0015-today-view-and-capacity.md`
- Modify: `docs/decisions/README.md`, `docs/progress.md`

- [ ] **E2E** `today.spec.ts`

```ts
import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

const localDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));
const at = (date: string, hhmm: string) => {
  // Toronto offset for that date: probe via Intl
  const probe = new Date(`${date}T12:00:00Z`);
  const tzHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Toronto" }).format(probe));
  const offset = 12 - tzHour; // hours behind UTC
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h + offset, m)).toISOString();
};

test.describe("today view and capacity", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("sections, week summary, capacity notice → adjust moves overflow to the next day", async ({ page }) => {
    const db = await dbAsUser();
    const { data: me } = await db.auth.getUser();
    const uid = me.user!.id;
    const { data: before } = await db.from("scheduler_settings").select("planned_work_days, min_meaningful_minutes").single();
    const stamp = Date.now();
    const today = localDate(Date.now());
    const tomorrow = localDate(Date.now() + 86_400_000);

    try {
      // Every day is a work day so the seeded history counts regardless of the weekday.
      await db.from("scheduler_settings").update({ planned_work_days: [0, 1, 2, 3, 4, 5, 6], min_meaningful_minutes: 30 }).eq("user_id", uid);

      // History: 10 past days × 60 min → capacity 60.
      const { data: hist } = await db.from("tasks").insert({ user_id: uid, title: `${E2E_PREFIX} 기록 ${stamp}` }).select("id").single();
      await db.from("work_sessions").insert(
        Array.from({ length: 10 }, (_, i) => {
          const d = localDate(Date.now() - (i + 2) * 86_400_000);
          return { user_id: uid, task_id: hist!.id, source: "manual", started_at: at(d, "09:00"), ended_at: at(d, "10:00") };
        }),
      );

      // Sections: a blockless task and a task with a block tomorrow (excluded from today).
      const loose = `${E2E_PREFIX} 미배정 ${stamp}`;
      await db.from("tasks").insert({ user_id: uid, title: loose, target_date: today });

      // Tomorrow: 3 × 60 min = 180 > 1.3 × 60 and +120 → notice.
      const titles = [1, 2, 3].map((i) => `${E2E_PREFIX} 내일 ${i} ${stamp}`);
      for (const [i, title] of titles.entries()) {
        const { data: t } = await db.from("tasks").insert({ user_id: uid, title, priority: 3 + i - 1 }).select("id").single();
        await db.rpc("create_schedule_block", {
          p_task_id: t!.id,
          p_starts_at: at(tomorrow, `${10 + i * 2}:00`),
          p_ends_at: at(tomorrow, `${11 + i * 2}:00`),
        });
      }

      await login(page);
      await expect(page.getByRole("region", { name: "미배정" })).toContainText(loose);
      await expect(page.getByLabel("주간 요약")).toContainText("계획");

      const notice = page.getByRole("note").filter({ hasText: "내일 계획" });
      await expect(notice).toContainText("보통 작업량 1h");
      await notice.getByRole("button", { name: "계획 조정" }).click();
      const dialog = page.getByRole("dialog", { name: "계획 조정" });
      await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(2); // 180 → ≤ 60 needs 2 moved
      await dialog.getByRole("button", { name: /다음 날 같은 시각으로/ }).click();
      await expect(dialog).toHaveCount(0);

      await expect
        .poll(async () => {
          const { data } = await db.from("schedule_blocks").select("starts_at, status").in("task_id",
            (await db.from("tasks").select("id").in("title", titles)).data!.map((x) => x.id));
          return data!.filter((b) => b.status === "planned" && localDate(Date.parse(b.starts_at)) === tomorrow).length;
        })
        .toBe(1);
    } finally {
      await db.from("scheduler_settings").update(before!).eq("user_id", uid);
    }
  });
});
```
The seeded manual sessions must not overlap the owner's real sessions. Direct DB inserts bypass the service
overlap check. The 09:00–10:00 slots on past days are acceptable for the test account; cleanup removes the task
and its sessions cascade.

- [ ] **Docs**
- ADR 0015 records:
  - The Today sections replace the list; other-day-only tasks are excluded.
  - The overload rule (1.3× and +60; planned counts planned/completed/missed).
  - Priority 1 = most important (assumed; used for overflow order).
  - Manual confirm; nothing moves automatically.
  - The shared `dailyCapacity`.
- Add the README row and a `progress.md` D3 checklist.

- [ ] **Full verification**: tsc, eslint, vitest, build (restart the dev server if needed), all E2E (12 specs),
  DB clean, settings restored.
- [ ] **Commit and push**: `D3-4: Today/capacity E2E; ADR 0015, docs`.
