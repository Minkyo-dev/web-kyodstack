# Calendar planning (sub-project B) — design

- Date: 2026-09-30
- Sources: `docs/improve-requirements.md` §5–§9, §17, §24–§25; umbrella `2026-09-30-growth-system-architecture.md` (B)
- Depends on: sub-project A (focus flow: switch dialog, sessions linked to blocks)

## Goal
Plan and act from the calendar itself. The user can start or complete work from a block and recover from an
unstarted or missed block without leaving the calendar. Drops show the recommended duration and let the user keep
their own estimate. Actual work can be overlaid on demand. The data also records misses for D's Reliability and
Recovery stats.

## Decisions made with the user
1. **Not started / missed.** A block shows "시작 안 함" with actions 15 minutes after its start when no session
   exists. When the block ends with no session, it becomes `missed` in the data.
2. **Recommendation confirm.** Only when the user has a personal estimate that differs from the recommendation by
   ≥ 10 minutes. The drop creates the block at the recommended length; an action toast then offers
   [keep my estimate].
3. **Actual overlay.** The default is a user setting (`show_actual_default`); a calendar toggle changes the current
   view only. A running session is always shown.

## 1. Data

### Block status `missed`
- `schedule_blocks.status` check adds `missed`: `planned | completed | skipped | cancelled | missed`.
- Only the system sets `planned → missed`. There is no user transition out of `missed`: rescheduling a missed block
  creates a new block and the miss stays as history.
- `set_schedule_block_status` keeps its transitions. A `missed` block accepts `cancelled` ("미배정으로"), which
  writes the usual cancel revision; everything else from `missed` is rejected with `23514`.

### `mark_missed_blocks(p_user_id uuid) returns int` (security invoker)
- For an authenticated caller, `p_user_id` must equal `auth.uid()` (else `42501`). Under the service role
  (`auth.uid()` null), any user id is allowed. Every statement filters `user_id = p_user_id` explicitly.
- It marks `missed` every block of that user with `status = 'planned'` and `ends_at < now()` that has:
  - no session with `schedule_block_id = block.id`, and
  - no session of the same task with `started_at` in `[starts_at − 30 min, ends_at)`
    (the same matching rule D uses for Reliability).
- Returns the number of rows changed. It is idempotent.
- Called:
  - by the scheduler page load (server, as the user) before blocks are read, and
  - by the nightly `duration_profile_refresh` job for each user (admin client).

### "Not started" is derived, not stored
`blockState(block, sessions, now)` in `utils/block-state.ts` (pure):
| state | condition |
|---|---|
| `running` | an open session linked to the block, or an open session of the task inside the block window |
| `done` | status `completed`, or a finished linked/matching session exists |
| `not_started` | status `planned`, now ≥ starts_at + 15 min, now < ends_at, and no linked/matching session |
| `missed` | status `missed`, or status `planned` with now ≥ ends_at and no session (before the next mark run) |
| `planned` | otherwise, for status `planned` |
| `skipped` / `cancelled` | from status |

### Reschedule rules
- **Before the block ends** (planned / not started): move the existing block (`move_schedule_block`). The revision
  keeps the history, so D can tell a proactive move from a late one.
- **After it ends** (missed): create a new block for the task at the chosen time, with the old block's length.
  The missed block is unchanged.
- **Targets** (`utils/block-state.ts`, pure, DST-safe via the tz utils):
  - `nextFreeSlot(now, blocks, lengthMin, tz)`: now rounded up to 15 minutes, then pushed past any overlapping
    planned block, and never earlier than the workday start. If nothing fits before 23:59, the result is null and
    the option is hidden.
  - `sameTimeTomorrow(block, tz)`: the same local wall time on the next local day.
  - A picked date and time.
  - "미배정으로": cancel the block. If the task has no other `planned` block, the task goes back to `inbox`.
    This happens in one DB function, `unschedule_block(p_block_id)`.

### Setting
`scheduler_settings.show_actual_default boolean not null default false`.

### Keep-my-estimate resize
Keeping the estimate resizes the new block through `move_schedule_block`, which writes a `resized` revision.
**D must not count resizes made within 5 minutes of a block's creation as rescheduling.** This rule goes into the D spec.

## 2. UI

### Block card (`calendar-event-content.tsx`)
- Default content: title, time, and a status icon + text for non-planned states.
- On hover (desktop) or tap (mobile), when the task is open:
  - **▶ 시작.** With no timer, `startWorkSession({ blockId })`. With another timer running, it opens the A switch
    dialog, and the target carries `blockId`.
  - **⋯ 메뉴:** 할 일 완료 · 다시 잡기 · 건너뛰기 · 미배정으로.
- Clicking the body opens the drawer as today. Action buttons stop propagation, so they neither start a drag nor
  open the drawer.

### Not started / missed
- **Not started:** the card shows "⚠ 시작 안 함". If the block is ≥ 45 minutes tall on screen, the card shows
  [지금 시작] [다시 잡기] [건너뛰기]; otherwise these actions move to the ⋯ menu.
- **Missed:** muted style with the label "놓침". Actions: [다시 잡기] (new block) and [미배정으로].
  The copy stays neutral.

### Reschedule popover
- Options: `오늘 HH:MM` (next free slot) · `내일 HH:MM` · `시간 선택…` · `미배정으로`.
- `시간 선택…` opens an inline date + time form. The length is kept.

### Drop with recommendation
- While dragging, the mirror event shows "추천 1h 20m" when the task has a learned recommendation.
- After the drop, if the task has `user_estimated_minutes` and |recommended − estimate| ≥ 10, a toast appears:
  "추천 1h 20m으로 잡았어요 (비슷한 작업 N개 기준)" with the action **[1h 유지]**, which resizes the block to the
  estimate. If the user ignores it, the recommended length stays.
- **Deviation from requirements §7:** a toast instead of a card beside the block. It needs no calendar-anchored
  positioning and works on mobile and with screen readers.

### Actual overlay
- The toolbar next to the week navigation has a "실제 작업 보기" checkbox. Its initial value is
  `show_actual_default`, and it applies to the current view only.
- A ⚙ popover in the scheduler header has the switch "실제 작업을 기본으로 표시", which saves the setting.
- Running sessions are always shown.

### Mobile
The actions sit behind a tap on the card (a bottom sheet with the same items). The reschedule options are the same.

## 3. Code changes
- Migration `calendar_planning`: status check with `missed`; `mark_missed_blocks`; `unschedule_block`;
  `set_schedule_block_status` updated for `missed`; the setting column. Regenerate types, run advisors.
- `utils/block-state.ts` (new, pure): `blockState`, `nextFreeSlot`, `sameTimeTomorrow`.
- Services and actions:
  - `rescheduleBlock` (moves the block before it ends, otherwise creates a new block).
  - `unscheduleBlock`.
  - `updateSchedulerSettings({ showActualDefault })`.
  - `markMissedBlocks(client, userId)`.
- Page: call `markMissedBlocks` before reading blocks. Job: call it per user in `runDurationProfileRefresh`.
- Components:
  - `calendar-event-content.tsx` (actions and states).
  - New `block-actions.tsx` (menu and reschedule popover).
  - `weekly-calendar.tsx` (overlay filter, drop toast, start/switch with a block).
  - New `scheduler-settings-popover.tsx`.
  - `scheduler-workspace.tsx`: the switch target gains `blockId`.
- `BLOCK_STATUS_LABEL` gains `missed: "놓침"`.

## 4. Errors
- Acting on a block that changed in another tab → `CONFLICT` toast and refresh.
- Rescheduling a missed block into a time that overlaps other blocks is allowed; the existing overlap warning toast
  applies.
- Starting a closed task from a block → the existing `CONFLICT` message.

## 5. Tests
- **SQL** `supabase/tests/rls/calendar_planning.sql`:
  - A past block with no session becomes missed.
  - A block with a linked session, or with a matching session of the same task in its window, does not.
  - Future blocks don't.
  - Another user's blocks can't be marked by A (42501 when passing B's id).
  - A second call changes 0 rows.
  - `missed → cancelled` is allowed; `missed → planned/completed` is rejected.
  - `unschedule_block` returns the task to inbox only when no other planned block exists.
- **Unit** `tests/unit/block-state.test.ts`: every `blockState` row; `nextFreeSlot` (rounding, skipping a
  blocking block, workday start, null late at night); `sameTimeTomorrow` across the DST change (2026-11-01 Toronto).
- **E2E** `tests/e2e/calendar-planning.spec.ts`:
  - Start from a block via hover. The FocusBar shows the task, and the session has `schedule_block_id`.
  - A past block inserted through the DB shows "놓침" after reload. "다시 잡기 → 내일" creates a new block and
    the old one stays missed.
  - Drop a task with estimate 60 and a learned recommendation ≥ 70 → toast → [유지] → the block is 60 minutes.
  - The "실제 작업 보기" toggle hides/shows finished sessions; the settings switch persists across reload.

## 6. Docs
`docs/schema.md` (missed, functions, setting), ADR 0012 (missed status and reschedule rules), `docs/progress.md`.

## Out of scope
Today view layout (D), stats that use misses (D), AI scheduling suggestions (F).
