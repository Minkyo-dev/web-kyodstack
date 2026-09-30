# Schema notes

The full logical model is in spec §15–§18. Migrations in `supabase/migrations/` are authoritative.
This file lists only the **differences and additions** relative to the spec, plus metric definitions.

## Applied beyond the spec
- **Composite ownership FKs.** `tasks`, `task_templates` and `schedule_blocks` have `unique (id, user_id)`.
  Children reference `(parent_id, user_id)`, so a row can never point at another user's parent.
  Nullable references use `on delete set null (col)` so `user_id` is preserved.
- `tasks`: check `(status = 'completed') = (completed_at is not null)`.
- `work_sessions`: check `source = 'timer' or ended_at is not null` (manual sessions must be closed).
- `scheduler_settings.auto_schedule_mode` defaults to `auto_duration` (the spec says to use it for the MVP).
- `scheduler_settings`: check `workday_end > workday_start`.
- `schedule_block_revisions`: RLS allows select and insert only (append-only audit log).
- `profiles`: users can select and update their own row only. The `on_auth_user_created`
  trigger creates `profiles` + `scheduler_settings` rows.
- `profiles.display_name` was renamed from the legacy `full_name`. The legacy `email` and `avatar_url` columns remain.
- `anon` has **no** table privileges on scheduler tables or `profiles` (the `scheduler_hardening` migration).
  Scheduler access requires login, and the RLS test asserts `insufficient_privilege` for anon.
- Portfolio table renamed to `portfolio_projects` (ADR 0001).

## Deferred to later phases (spec §71)
- `projects`, `milestones`, `tasks.project_id`, `tasks.milestone_id` → Phase 4
- `task_duration_profiles` → Phase 3
- `weekly_reviews`, `ai_recommendations` → Phase 5

## Metric definitions (spec §36, §59, §60). Version them if they change.
| Metric | Definition (v1) |
|---|---|
| planned_minutes | Σ(ends_at − starts_at) of blocks in the window with status ≠ cancelled (skipped included) |
| skipped_minutes | the same, restricted to status = skipped |
| actual_minutes | Σ(ended_at − started_at) of sessions with ended_at not null |
| plan_completion_ratio | actual_minutes / planned_minutes |
| running_minutes | live elapsed of the running session (UI only, never in finalized metrics) |
| average_focus (day) | mean `focus_score` of finished sessions that **started** in the window |
| Window | Local day or week in `profiles.timezone`; weeks start on `scheduler_settings.week_starts_on`. Blocks and sessions that cross the window edge are clipped to it. |

Implemented in `src/features/scheduler/utils/metrics.ts` (`computeDaySummary`, unit-tested).

## Views
- `task_plan_actual` (`security_invoker = true`, anon revoked): per-task `planned_minutes` (non-cancelled blocks,
  skipped included), `skipped_minutes`, `actual_minutes` (finished sessions), `session_count`, `average_focus`,
  and `reschedule_count` (moved + resized revisions). This is the input for Phase 3 duration learning.

## Work session rules (service layer)
- Only one running timer (partial unique index; service maps 23505 → `ACTIVE_TIMER_EXISTS`).
- `start_work_session(task, block)` is atomic: it inserts the session and moves the task from inbox/planned to in_progress.
  Closed tasks are rejected.
- A session is > 0 and ≤ 16h, and never ends in the future (1-minute skew allowed).
- Manual sessions may not overlap any other session of the user, including the running one.
- Stopping never completes the task (spec §22). Completion stays an explicit action.
