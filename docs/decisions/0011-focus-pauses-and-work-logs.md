# 0011. Focus pauses and work logs
- Status: accepted
- Date: 2026-09-30

## Context
Requirements (improve-requirements §11–§16) separate elapsed, paused and focused time, and treat the work log
as its own concept. Before this, a session was one interval and carried its own scores and note.

## Decision
- Pauses are intervals in `work_session_pauses`. Session state is derived (open pause = paused). At most one
  open pause per session and one open session per user.
- `pause/resume/stop/switch_work_session` each make one change in one transaction. Stop can also complete the task
  (`p_complete_task`). Switch holds the current session without a summary and starts the next one.
- Work results live in `work_logs` (0..1 per session, or task-level with `session_id` null). The session score
  and note columns were moved there, then dropped (expand → backfill → contract).
- **Actual minutes v2** = wall time − pauses. `task_plan_actual.actual_minutes`, day metrics and weekly metrics
  (`METRICS_VERSION = "v2"`) all use it. The view also exposes `paused_minutes`.

## Consequences
- Duration learning uses focused time automatically (it reads the view).
- Pre-A sessions have no pauses and count as fully focused.
- Editing pauses is not supported yet.
