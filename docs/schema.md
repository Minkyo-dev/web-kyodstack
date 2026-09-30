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

## Classification + duration groups (Improvement D1, ADR 0013)
- `tasks.task_type` / `task_templates.task_type`: a fixed list (reading, study, coding, debugging, documentation,
  writing, meeting, planning, design, research, exercise, other), nullable.
- `practice_domains(user_id, name, parent_id)`: a user-owned tree. The name is unique per user case-insensitively and
  has no `@`. `tasks.practice_domain_id` / `task_templates.practice_domain_id` are set null when the domain is
  deleted. Cycles are rejected in the service (`wouldCycle`).
- `tags(user_id, name, color)`: the name is 1–100 characters without `#` or `,`, unique per user case-insensitively.
  `task_tags` and `template_tags` are joins with composite ownership FKs (cascade). Deleting a tag removes only links.
- Migration backfill: every template name became a tag attached to the template and to its tasks
  (`backfill_template_tags`, owner-only).
- `duration_groups(user_id, group_key, samples, sample_count)`: a derived cache (replaced `task_duration_profiles`).
  - `group_key` is `type:<t>|domain:<id>`, `type:<t>` or `tag:<id>`.
  - `samples` holds the 20 most recent `{base, actual, completed_at}`. `actual` is focused minutes; `base` is the
    user/template estimate or null.
  - A full rebuild (the 500 most recent completed tasks) runs after completion/reopen/learning-input edits and nightly.
- **Estimator v2:**
  - Group order: type×domain → type → the task's tag with the most samples (≥ 3 usable samples each).
  - Quantity: with a task estimate, `estimate × clamp(actual/base, .5, 3)`; without one, `actual`.
  - Point: median, rounded up to 5 and clamped to the block limits. Range: p25–p75.
  - Confidence: high (n ≥ 5, IQR/median ≤ .25), medium (n ≥ 3, ≤ .5), low (shown as a range only; a drop uses the
    estimate if any).

## projects / milestones (Phase 4)
- Both have `unique (id, user_id)`, and milestones also have `unique (id, project_id)`.
- `tasks` has three FKs: `(project_id, user_id)`, `(milestone_id, user_id)` and `(milestone_id, project_id)`.
  There is also the check `milestone_id is null or project_id is not null`, so a task can never point at another
  user's project, or at a milestone of a different project (spec §44).
- The task FKs are NO ACTION: a project or milestone with tasks can't be hard-deleted. Close it with `status`.
  NO ACTION is checked at statement end, so an account deletion still cascades.
- `task_plan_actual` now also exposes `project_id` and `milestone_id`.
- Remaining estimate (v1) = Σ over open tasks of max(personal estimate − actual minutes so far, 0).

## weekly_reviews / ai_recommendations (Phase 5)
- `weekly_reviews` is unique on `(user_id, week_start)`, so generation is an upsert. `metrics` stores the exact
  input the LLM saw, together with provider, model and prompt_version.
- `ai_recommendations` has composite FKs like `tasks` (project/milestone same user, milestone ∈ project) plus
  `(task_id, user_id)` → the accepted task. The check `(status = 'pending') = (decided_at is null)` holds.
- Only `accept_ai_recommendation(id, title?, estimate?, target_date?)` turns a recommendation into a task.
  It raises `P0002` when the id is not found and `23514` when the recommendation was already decided.

### Weekly metrics v1 (`computeWeeklyMetrics`)
| Metric | Definition |
|---|---|
| planned / skipped / actual | as in the daily definitions, clipped to the local week |
| planCompletionRatio | actual / planned (null if planned = 0) |
| deepWorkMinutes | Σ finished sessions of ≥ 50 min |
| averageFocus / Mood / Energy | mean over finished-session ratings **and** daily-reflection ratings in the week |
| best/worstFocusWindow | 3-hour local windows, focus weighted by session minutes, window needs ≥ 60 min |
| under/overestimatedTaskTypes | tasks completed in the week with a template: Σ actual / Σ base ≥ 1.2 or ≤ 0.8 |
| reschedule / move / resize, minutesShifted, daysShifted | revisions created in the week (moved + resized) |

## job_runs (Phase 6)
- Unique `(job_name, user_id, run_key)`. Statuses: running / succeeded / skipped / failed, with `attempts`.
- Only the service role writes. `authenticated` has SELECT on its own rows only (insert/update/delete revoked).
- `run_key`: the local date (daily_planner, duration_profile_refresh) or the reviewed week's start (weekly_review).

## work_session_pauses / work_logs (Improvement A, ADR 0011)
Concept map: TimeBlock = `schedule_blocks`, FocusSession = `work_sessions`, WorkLog = `work_logs`,
DailyReview = `daily_reflections`.
- `work_session_pauses(session_id, paused_at, resumed_at null, reason)`: an open pause (`resumed_at is null`) means
  the session is paused. There is at most one open pause per session (partial unique index). Reasons are
  coffee/phone/meeting/break/other and are optional.
- `work_logs(task_id, session_id unique null, focus/mood/energy, note ≤ 5000)`: at most one per session.
  Deleting a session keeps its log as a task-level log (`session_id` set null).
- `work_sessions` gains `unique (id, user_id)`. Its score/note columns were dropped after the backfill.
- Functions (security invoker):
  - `pause_work_session(session, reason?)`, `resume_work_session(session)`.
  - `stop_work_session(session, ended_at?, focus?, mood?, energy?, note?, complete_task?)`: closes an open pause at
    the end, upserts the work log, and optionally completes the task. All in one transaction.
  - `switch_work_session(task?, block?)`: ends the open session (no log) and starts the next.
  - Errors: `P0002` not found; `23514` `session finished` / `already paused` / `not paused` / `end before start` /
    `end before pause`; `23505` second open session.
- `task_plan_actual`: `actual_minutes` = focused minutes. Adds `paused_minutes`. `average_focus` comes from `work_logs`.

## Calendar planning (Improvement B, ADR 0012)
- `schedule_blocks.status`: `planned | completed | skipped | cancelled | missed`. Only `mark_missed_blocks` sets
  `missed`. From `missed`, only `cancelled` is allowed (via `set_schedule_block_status` or `unschedule_block`), and
  a missed block can't be moved.
- `mark_missed_blocks(p_user_id) returns int`: planned blocks that ended with no linked session and no same-task
  session starting in [start − 30 min, end) become missed. The function is idempotent. A signed-in caller may only
  pass their own id (else `42501`); the service role may pass any id. It is called on scheduler page load and by
  the nightly `duration_profile_refresh` job.
- `unschedule_block(p_block_id)`: cancels a planned/missed block, writes the cancel revision, and returns a
  `planned` task to `inbox` when no other planned block remains. Errors: `P0002`, and `23514` when the block is
  already closed.
- "Not started" (start + 15 min, before the end, no session) is derived in `utils/block-state.ts`, never stored.
- `scheduler_settings.show_actual_default boolean default false`: the initial state of the calendar's
  "실제 작업 보기" toggle. Running sessions are always shown.
- Rescheduling moves the block while it hasn't ended; after it ends, a new block is created (same length).

## Deferred to later phases (spec §71)

## Metric definitions (spec §36, §59, §60). Version them if they change.
| Metric | Definition (v1) |
|---|---|
| planned_minutes | Σ(ends_at − starts_at) of blocks in the window with status ≠ cancelled (skipped included) |
| skipped_minutes | the same, restricted to status = skipped |
| actual_minutes | Σ focused minutes (ended_at − started_at − pauses) of sessions with ended_at not null (v2, ADR 0011) |
| plan_completion_ratio | actual_minutes / planned_minutes |
| running_minutes | live elapsed of the running session (UI only, never in finalized metrics) |
| average_focus (day) | mean work-log `focus_score` of finished sessions that **started** in the window |
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
