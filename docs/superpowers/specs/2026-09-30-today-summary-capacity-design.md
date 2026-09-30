# Today view, week summary, capacity notice (sub-project D3) — design

- Date: 2026-09-30
- Sources:
  - `docs/improve-requirements.md` §21, §23
  - `docs/improve-requirements-2.md` §47
  - Umbrella §6/§8 (former sub-project C)
  - D2 (daily capacity) and B (block actions, reschedule)
- Last part of D.

## Goal
The left panel answers "What am I doing now? What's next?" The calendar shows a one-line week summary. When a day
is planned well beyond the user's recent capacity, a calm notice offers to move the overflow, and nothing is ever
moved automatically.

## Decisions made with the user
1. The Today view **replaces the left panel's list**, and the calendar stays beside it.
2. **[계획 조정]** opens a dialog that pre-selects the overflow blocks. The user confirms, and the chosen blocks move
   to the same time the next day.

## 1. Today panel

### Summary line (panel top)
`오늘 · 계획 5h 20m · 작업 2h 42m · 남은 2h 38m`
- Values come from `computeDaySummary`: planned = the day's non-cancelled blocks; worked = focused finished +
  running.
- Remaining = planned − worked. When negative, it reads "계획보다 12m 더 작업".
- The bottom `TodayMetricsBar` drops planned/actual and keeps focus average, completed x/y and [하루 마무리].

### Sections (below quick add, banner and tag filter)
`todaySections(input) → { now, next, later, unscheduled, completed }`, pure, in
`src/features/scheduler/utils/today.ts`.

- **Input:**
  - tasks: the Today list
  - blocks: the fetched calendar blocks
  - sessions
  - active session
  - now, timezone
  - the selected tag ids
- **now:**
  - With a running session: the running item.
  - Otherwise: today's planned blocks covering `now` (state `planned` or `not_started` via `blockState`).
  - Plus today's **missed** blocks, each with its block actions.
- **next:** the first planned block today starting after `now`.
- **later:** the remaining planned blocks today after `next`.
- **unscheduled:** open tasks with no planned block ending after `now` on any day (inbox and partial tasks
  included). They render as today's draggable list items.
- **completed:** tasks completed today (collapsed, with a count).
- **Excluded:** open tasks whose only upcoming blocks are on other days. They're visible on the calendar. This is
  the one behavioral difference from the old "오늘 할 일" list (recorded in ADR 0015).
- **Tag filter:** applies to every section (a block's task must match).

### Block rows
`10:00–11:20 · 제목 (1h 20m)` with the B `BlockActions` (▶, ⋯). The row body opens the drawer. Rows show state with
text ("진행 중", "⚠ 시작 안 함", "놓침").

## 2. Week summary line
- Above the calendar: `이번 주 · 계획 31h · 작업 27h · 완료 24개`. The label reads "이 주" when another week is shown.
- **planned/worked:** `computeDaySummary` over the displayed week range (clipped), from the blocks and sessions the
  page already loads.
- **completed:** a new query `countCompletedInRange(supabase, startIso, endIso)` (tasks with `completed_at` in range,
  head count).
- A small text line only; it never takes calendar height beyond one row.

## 3. Capacity notice

### Capacity
- `dailyCapacity(input)` is extracted from D2 `computeStats` into
  `src/features/analytics/utils/capacity.ts` (pure):
  - It takes sessions (with pauses), the planned work days, the minimum meaningful minutes, the timezone and now.
  - It returns the median focused minutes over the last 28 days' planned work days with ≥ the minimum.
  - `computeStats` uses the same function, so the numbers always agree.
- **Loader:** `loadCapacityInput(supabase, userId, now)` reads 28 days of sessions + pauses with an explicit
  `user_id`. The scheduler page calls it in its parallel read.

### Overload rule
`overloadFor(dayPlannedMinutes, capacity) = capacity !== null && planned > 1.3 × capacity && planned − capacity ≥ 60`,
evaluated for **today** and **tomorrow** (local days).

### Notice
- A card under the week summary. It is text-first, with no alarm styling beyond an icon + words:
  "내일 계획 5h 40m은 최근 근무일 보통 작업량 3h 15m보다 2h 25m 많아요."
- **[그대로 두기]** hides it for that date in this browser (`localStorage` key `kyod.capacity.dismissed.<date>`,
  try/catch).
- **[계획 조정]** opens the dialog.
- If both days are overloaded, today's notice shows first, then tomorrow's.

### Adjust dialog
- **Candidates:** that day's blocks with status `planned` that haven't started (`blockState` is `planned`; not
  started-late, not running, not missed).
- **Order:** priority descending (5 = least important first; **1 = most important** is the assumed meaning, ADR 0015),
  then later start first.
- **Pre-selection:** walk the candidates, selecting until planned − selected ≤ capacity.
- The live line reads "조정 후 계획 4h 10m · 보통 3h 15m".
- **Confirm:** "선택한 N개를 다음 날 같은 시각으로" calls `rescheduleBlockAction({ blockId, startsAt:
  sameTimeTomorrow(block.starts_at, tz) })` sequentially. Moves keep revisions (B rules). Errors toast per block and
  continue.
- Nothing moves without the confirm.

## 4. Code
- **New:**
  - `utils/today.ts` (`todaySections`, `overloadFor`, `overflowSelection`)
  - `analytics/utils/capacity.ts`
  - `analytics/queries/capacity.queries.ts`
  - `queries/task.queries.ts` → `countCompletedInRange`
  - Components: `today-summary.tsx`, `today-sections.tsx` (block rows reuse `BlockActions`), `week-summary.tsx`,
    `capacity-notice.tsx` (notice + adjust dialog)
- **Modify:**
  - `today-task-panel.tsx`: uses sections instead of one list; quick add, banner and filter stay.
  - `today-metrics-bar.tsx`: drops planned/actual.
  - `scheduler-workspace.tsx`: week summary + notice above the calendar.
  - `page.tsx`: capacity input, week completed count.
  - `analytics/utils/stats.ts`: uses `dailyCapacity`.
- Existing E2E locators that use "오늘 할 일 목록" need updating to the new sections (list items keep their names).

## 5. Errors and edge cases
- No capacity (too little history) → no notice.
- A day with only running/started/missed blocks → no candidates; the dialog says "옮길 수 있는 일정이 없습니다."
- A reschedule failing for one block doesn't stop the others; the summary toast reports moved/failed counts.
- Midnight: sections are computed with `now` from `useNow(60_000)`, so they roll over without a reload.
- Mobile: the panel stacks as today, and the sections are collapsible (지금 and 다음 open by default).

## 6. Tests
- **Unit** `tests/unit/today.test.ts`:
  - Section classification: running, covering block, not-started, missed, next/later ordering, unscheduled vs.
    other-day blocks, completed today.
  - The tag filter.
  - `overloadFor` boundaries (1.3×, +60).
  - `overflowSelection` order and stopping point.
- **Unit:** `dailyCapacity` equals `computeStats(...).patterns.dailyCapacityMinutes` on the D2 fixtures.
- **E2E** `tests/e2e/today.spec.ts`:
  - A task with a block later today appears under 다음; a blockless task under 미배정.
  - The week summary line is visible.
  - Capacity:
    1. Seed ~10 past work days of 60-minute manual sessions (capacity 60).
    2. Seed 3 blocks tomorrow totaling 180 minutes, then see the tomorrow notice.
    3. [계획 조정] pre-selects blocks; confirm.
    4. Tomorrow's planned minutes drop to ≤ capacity, and the moved blocks are on the day after.
  - Existing suites updated where they relied on the old list.

## 7. Docs
ADR 0015 (Today sections replace the list, other-day tasks excluded, priority meaning, the capacity notice rule and
manual confirm), `docs/progress.md`, `docs/schema.md` (no schema change; note the capacity reuse).

## Out of scope
- Gamified "SYSTEM NOTICE" styling (E).
- AI-generated plan adjustments (F).
- Moving to a slot other than the same time tomorrow (the B reschedule menu still offers that per block).
