# Focus flow (improvement bundle A) — design

- Date: 2026-09-29
- Source: `docs/improve-requirements.md` §9–§16, §27, §29 (principles 4–6)
- Scope: bundle A of three (A focus flow → B calendar planning → C Today/summary)

## Goal
Make "start → work (with pauses) → stop → reflect → complete or continue later" feel natural, and make
actual minutes mean **focused** minutes (wall time minus pauses). This feeds the existing duration learning.

## Decisions made with the user
1. **Switching tasks ends the current session.** "Pause current and start Y" closes X's session without a summary.
   X stays `in_progress`. Resuming X later starts a new session. At most one open session per user (unchanged).
2. **Continue Later** keeps the task `in_progress`. With no upcoming planned block, the task list shows it as
   partially done with the remaining estimate, and dragging it to the calendar sizes the block to the remainder.
3. **In-session pause is stored as pause intervals** (option 1 of 3), not as split sessions or a counter.

## 1. Data model

### `work_session_pauses` (new)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | → profiles, cascade |
| session_id | uuid | `(session_id, user_id)` → `work_sessions(id, user_id)`, on delete cascade |
| paused_at | timestamptz not null | |
| resumed_at | timestamptz null | null = currently paused |
| reason | text null | `coffee` \| `phone` \| `meeting` \| `break` \| `other` |
| created_at | timestamptz | |

- Check `resumed_at is null or resumed_at > paused_at`.
- Partial unique index: one open pause (`resumed_at is null`) per session.
- `work_sessions` gets `unique (id, user_id)` (it has none today) to back the composite FK.
- RLS: select/insert/update own rows (`user_id = (select auth.uid())`). No delete policy (pauses die with the session).
  `anon` revoked, as in `scheduler_hardening`.
- Session state is derived, never stored:
  - running = `ended_at is null` and no open pause
  - paused = `ended_at is null` and an open pause exists
  - finished = `ended_at is not null`

### DB functions (`security invoker`, `search_path = ''`, execute granted to `authenticated` only)
| function | behaviour | errors |
|---|---|---|
| `pause_work_session(p_session_id, p_reason default null)` | Inserts an open pause at `now()`. | `P0002` session not found / not own; `23514` session finished or already paused |
| `resume_work_session(p_session_id)` | Sets `resumed_at = now()` on the open pause. | `P0002`; `23514` not paused |
| `stop_work_session(p_session_id, p_ended_at default null, p_focus, p_mood, p_energy, p_note, p_complete_task default false)` | Locks the open session. `ended_at = coalesce(p_ended_at, now())`. Closes an open pause at `ended_at`. Rejects `ended_at` earlier than the latest `paused_at`. Writes scores/note. If `p_complete_task`, completes the task (`status = completed`, `completed_at = now()`) in the same transaction. | `P0002`; `23514` already finished, or end before a pause |
| `switch_work_session(p_task_id, p_block_id default null)` | Stops the caller's open session at `now()` (closing any open pause, no scores), then runs the same logic as `start_work_session` for the new task. One transaction. | as `start_work_session`; `P0002` when there is no open session |

- 16-hour and future-time limits stay in the service (`assertSessionRange`) before calling `stop_work_session`.
- The service maps errors as today: `23505` → `ACTIVE_TIMER_EXISTS`, `23514`/finished → `CONFLICT`, `P0002` → `NOT_FOUND`.
- Pause reasons can be set after the fact on the open pause via a plain RLS-guarded update (`setPauseReason`).
- The session note can be saved while running (`updateSessionNote`), a plain RLS-guarded update on an open session.

### Actual minutes v2
`actual = (ended_at − started_at) − Σ(pause.resumed_at − pause.paused_at)`

- `task_plan_actual` is redefined in the new migration. `actual_minutes` subtracts pauses; a new column
  `paused_minutes` is added. Duration profiles read this view, so learning uses focused time automatically.
- `computeDaySummary` and `computeWeeklyMetrics` subtract pause intervals clipped to the same window as the session.
  Bump the metric version to v2 in `docs/schema.md`.
- Manual sessions have no pauses. Editing pauses is out of scope.

## 2. UI flow

### FocusBar (replaces the header `WorkSessionTimer`)
- Fixed at the bottom of the scheduler workspace, above `TodayMetricsBar`, shown only while a session is open.
- Running: `● <task title> · 00:42:18 · [일시정지] [종료]`. The clock is focused time and ticks each second.
- Paused: the clock freezes; `⏸ 일시정지됨 · [재개] [종료]`. State is conveyed by icon + text, never color alone.
- After pausing, optional reason chips appear in the bar (커피 / 전화 / 회의 / 휴식 / 기타). Ignoring them is fine.
- Clicking the bar opens an expanded panel (bottom sheet, calendar stays visible):
  계획 / 경과 / 작업 / 쉼 / 남은 시간, pause/resume, finish, and a 작업 메모 textarea saved on blur.
- "Planned" for this session: the linked block's duration if the session started from a block; otherwise the task's
  personal estimate minus actual minutes from earlier sessions; otherwise hidden.
- Overruns are phrased factually: "12분 초과".

### SwitchTaskDialog
- The ▶ button stays visible on other tasks while a timer runs. Clicking it opens:
  "지금 작업 중: X · 00:42:18 — Y를 시작할까요?"
  - [X 마치고 시작] → WorkSummaryDialog for X; on save, start Y.
  - [X 보류하고 시작] → `switch_work_session`.
  - [취소]

### WorkSummaryDialog (replaces `StopSessionDialog`)
- Shows planned / actual focus / difference ("+14분 (17%) 더 걸림", or "6분 덜 걸림"; never judgmental).
- 집중도 1–5, 기분 1–5, "무엇을 했나요?" (prefilled from the running note).
- "더보기" reveals energy score and end-time correction (for a forgotten timer).
- [할 일 완료] → `stop_work_session(..., p_complete_task = true)`.
- [나중에 계속] → `stop_work_session(...)`, then toast "남은 예상 N분 — 캘린더로 끌어다 놓으세요".
- Closing the dialog saves nothing; the timer keeps running.

### Continue Later in the task list
- An open task with actual minutes > 0 and no upcoming planned block shows
  "부분 진행 · 45분 작업 · 남은 약 35분".
- Remaining = max(personal estimate − actual, 0); hidden when there is no estimate.
- Dropping such a task sizes the block to the remaining time, rounded up to 5 minutes, at least `min_block_minutes`.
  With no remaining time it falls back to the current estimator.

### Mobile
FocusBar spans the width; the expanded panel and summary open as bottom sheets.

## 3. Code changes
- Migration `focus_pauses`: table, RLS, indexes, four functions, view redefinition. Regenerate types, run advisors.
- `features/scheduler/services/work-session.service.ts`: pause, resume, setPauseReason, updateSessionNote,
  stop via RPC, switch.
- `features/scheduler/actions/work-session.actions.ts`: matching actions (Zod → user → service → `ActionResult`).
- `features/scheduler/queries/session.queries.ts`: load pauses with sessions.
- `features/scheduler/utils/focus.ts` (new, pure): elapsed / focused / paused / remaining from a session and its pauses.
  Used by FocusBar, WorkSummaryDialog and metrics.
- `utils/metrics.ts`, `utils/weekly-metrics.ts`: subtract clipped pauses.
- Components: new `focus-bar.tsx`, `switch-task-dialog.tsx`, `work-summary-dialog.tsx`; remove
  `stop-session-dialog.tsx` and `work-session-timer.tsx`; update `scheduler-workspace.tsx`, `task-list-item.tsx`,
  `task-detail-drawer.tsx`, and the drop-duration logic.

## 4. Errors
- Acting on a session already paused/stopped in another tab → `CONFLICT` toast and refresh.
- A second timer → `ACTIVE_TIMER_EXISTS` (the switch dialog is the normal path).
- End-time correction before the last pause start → validation error in the dialog.

## 5. Tests
- SQL `supabase/tests/rls/focus_pauses.sql`: cannot pause another user's session; no second open pause;
  stop while paused closes the pause; switch is atomic and leaves exactly one open session;
  stop + complete is atomic; the view subtracts pauses.
- Unit: `focus.ts`; day/week metrics with pauses crossing the window edge.
- E2E `tests/e2e/focus-flow.spec.ts`: start → pause (reason) → resume → finish summary → Continue Later →
  partial badge; switch dialog "보류하고 시작". Update `work-tracking.spec.ts` for the new summary dialog.
  All existing suites must still pass.

## 6. Docs
- `docs/schema.md`: `work_session_pauses`, functions, actual minutes v2.
- ADR 0011: pause intervals and the v2 actual-minutes definition.
- `docs/progress.md`: an "Improvement A — focus flow" checklist.

## Out of scope
Editing pauses, multiple paused sessions, starting from a calendar block (bundle B), Today NOW/NEXT layout (bundle C).
