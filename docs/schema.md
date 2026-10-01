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
- `projects.archived_at` (ADR 0024): archive folder, independent of `status`; archived projects leave the pickers.
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

## Stat engine (Improvement D2, ADR 0014)
- `scheduler_settings`:
  - `planned_work_days smallint[]` (default Mon–Fri; non-empty, values 0–6)
  - `min_meaningful_minutes` (30, 5–480)
  - `commit_lead_minutes` (120, 0–1440)
- `stat_snapshots(user_id, computed_on, stat_type, scope, value, bias, typical_error, sample_count, window_start,
  window_end, formula_version)`: unique per (user, day, stat, scope). Users only read; the nightly job writes.
- Stat definitions `stats-v1`:

| stat | window | min | definition |
|---|---|---|---|
| Calibration | 28 days (completed) | 8 (5 per type) | mean `100·min(A/P, P/A)`; P = blocks created before the first session, else the estimate; bias/error = median(A/P−1) / median(\|A/P−1\|) |
| Reliability | 28 days (resolved) | 10 | mean commitment score × 100 (ADR 0014) |
| Consistency | 42 days, work days from first activity to yesterday | 15 | share of work days with focused ≥ min meaningful |
| Recovery | 42 days of misses | 5 | 100/75/50/25 by work days to the first meaningful day on the same task; 0 if none in 14 days or cancelled |

## Gamification E1 (ADR 0016)
- `player_profiles(user_id pk, level, total_xp, gamification_enabled, quest_terminology, animations_enabled,
  achievement_toasts, backfilled_at)`: `level`/`total_xp` are a cache of the ledger, written only by the
  `xp_events` trigger; users update settings columns and `backfilled_at` only.
- `xp_events(user_id, rule focus|completion|commitment, source_type, source_id, local_date, xp 1–120, metadata)`:
  unique per (user, rule, source). Users select/insert/delete own rows, never update.
- `award_xp(p_events jsonb, p_user_id uuid default null)`: idempotent insert; returns `(total_xp, level,
  previous_level)`. `xp_level(total)`: L → L+1 costs `100 + 50·L`.
- Rules `xp-v1` live in `features/gamification/utils/xp-rules.ts` (ADR 0016).

## SYSTEM analysis F2 (ADR 0019)
- `system_insights(user_id, kind 'weekly_analysis', period_start, period_end, input jsonb, content jsonb, model,
  prompt_version, created_at)`: users select/insert/delete own (delete only for E2E cleanup).
- `scheduler_settings.insight_weekday` (0–6, null = off) and `insight_hour` (0–23, default 8), local time.
- `quests.generated_by` ∈ system|ai; `quests.reason` (≤ 80) for AI-picked daily quests.

## Direction layer G1 (ADR 0020)
- `purposes(statement, status active|archived)`: one active per user (partial unique).
- `identities(name, description, status, sort_order)`; `mission_identities(mission_id, identity_id)` N:M, composite FKs.
- `missions(title, outcome, deadline date, status active|achieved|dropped, closed_at, purpose_id)`;
  `(status = 'active') = (closed_at is null)`.
- `mission_criteria(label, kind check|numeric, target_value, current_value, unit, met_at, position)`; numeric needs
  `target_value > 0` (not null; fix migration `mission_criteria_target_check`).
- `paths(mission_id, title, approach, trade_offs, status active|retired, started_at, retired_at)`: one active per
  mission; retired rows read-only (trigger, 23514). `switch_path(mission, title, approach, trade_offs)` (invoker).
- `protocols(path_id, mission_id, title, steps text[] ≤ 12, intended_minutes 5–600, status, sort_order)`;
  FK `(path_id, mission_id) → paths`; only archiving is allowed on a retired path.
- `tasks.mission_id/protocol_id` (FK `(protocol_id, mission_id) → protocols`, protocol ⇒ mission),
  `projects.mission_id`. `task_plan_actual` appends `mission_id, protocol_id, effective_mission_id`.
- Growth = effective mission set; maintenance otherwise (derived, not stored).
- `set_purpose(statement)` and `save_mission(id|null, title, outcome, deadline, status, identity_ids[])` (invoker): the
  purpose switch and the mission row + identity links are each one transaction; a foreign identity rolls the save back.

## Habits G2 (ADR 0021)
- `habits(title, rule check|focus, target_minutes 5–600, weekdays smallint[] ⊆ 1..7, protocol_id, mission_id, status,
  sort_order)`: `focus` needs a protocol and a target; protocol and mission are set together (FK
  `(protocol_id, mission_id) → protocols`).
- `habit_checks(habit_id, local_date, source manual|focus, minutes)`: one per habit per local day; cascades with the habit.
- `xp_events.rule` adds `habit` (+10 per check, 30/day in code).

## AI features F1 (ADR 0018)
- `task_features(user_id, task_id, feature_type task_type|domain|complexity|skills, feature_value jsonb, source
  ai|user|system, status proposed|accepted|rejected, confidence, model, prompt_version, decided_at)`: composite FK to
  `tasks(id, user_id)`; one open proposal per (task, feature type).
- `ai_calls(user_id, kind, model, ok, created_at)`: the AI budget ledger (30 per local day); no prompt/response text.
- `work_logs` + `ai_interpretation jsonb`, `interpretation_model`, `interpretation_version`, `confirmed_blocker`
  (null = unanswered). Only `confirmed_blocker = true` affects stats (Calibration weight 0.3, `stats-v2`).

## Gamification E2 (ADR 0017)
- `quests(user_id, type daily|weekly|recovery, status active|cleared|expired, title, period_start, period_end,
  reward_xp, swap_used, spare jsonb, rules_version, cleared_at)`: unique per (user, type, period_start); at most one
  active recovery quest (partial unique index).
- `quest_objectives(quest_id, user_id, position, metric, params, target_value, current_value, completed_at)`: composite
  FK to `quests(id, user_id)`; 11 metrics (E2 spec §2).
- `user_achievements(user_id, key)`, `user_titles(user_id, key)`; `player_profiles.equipped_title` must be unlocked.
- `create_quest(p_quest, p_objectives, p_user_id default null)` and `swap_quest_objective(p_objective_id, p_objective,
  p_spare)` are security invoker. `xp_events.rule` adds `quest` (≤ 300 XP).

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

## Household finance (ADR 0025, docs/household-finance-design.md)
- Tenant key is `household_id`. `finance_households` (name, base_currency, timezone, `invite_code`),
  `finance_household_members` (role OWNER/MEMBER, `display_name`, `unique (user_id)`), `finance_accounts`,
  `finance_categories` (two levels, trigger-checked), `finance_transactions` (source of truth).
- RLS: membership via `private.finance_is_member` / `finance_is_owner`. Households and members are created only by
  `finance_create_household` / `finance_join_household`; members may update only `display_name`, the owner only the
  household `name`. Unused accounts/categories may be deleted (FKs protect referenced ones); the owner may delete the
  household (cascade).
- Composite FKs keep account, transfer account, category, payer and account owner inside the household.
- Transaction checks: `amount > 0` (ADJUSTMENT may be negative and non-zero); TRANSFER has `transfer_account_id`
  (≠ `account_id`), `transfer_group_id` and no category; INCOME/EXPENSE need a category of the matching type.
  `created_by_user_id` must be the caller on insert and never changes; `updated_by_user_id` is stamped on update.
- Cash-flow metric (`finance_cash_flow`): income = Σ INCOME; expense = Σ EXPENSE − Σ REFUND; TRANSFER and ADJUSTMENT
  excluded. Net = income − expense; savings rate = net / income (none when income is 0); change = (cur − prev) / |prev|
  (none when prev is 0). Category breakdown rolls subcategories into the top-level parent.

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

## Direction status metrics (G3, ADR 0022). Computed on page load, no tables.
- `mission-progress-v1`: criteria mean (check met = 1, numeric = min(current/target, 1)); else completed /
  non-cancelled tasks of the mission's projects; else no ratio (last 28 days' focus time only).
- Pace gap = elapsed share of [created local day, deadline] − progress; sentence at ≥ 0.25.
- `alignment-v1`: focused minutes of sessions ended this local week; aligned = effective mission set; off-path =
  aligned on a protocol whose path is retired. Hidden below 180 active minutes.
- Habit consistency = checks / scheduled habit-days (Mon..today, not before the habit's creation day).
- `identity-evidence-v1`: 28 days; sessions on the identity's missions; its missions' habit checks / scheduled days;
  sentence at ≥ 0.6 with ≥ 5 scheduled days.

## Layer diagnosis `diagnosis-v1` (G4, ADR 0023). Pure, 28 local days, per active mission.
- goal: pace gap ≥ 0.25 · strategy: habit completion ≥ 0.7 and progress now − progress 28 days ago ≤ 0 · tactic:
  median protocol session < 0.6 × intended (≥ 3) or habit completion < 0.5 · planning: ≥ 5 blocks and missed+skipped
  ≥ 0.4 · execution: ≥ 5 work logs and confirmed blockers ≥ 0.3 · recovery: Recovery stat < 50.
- Habit rules need ≥ 5 scheduled days; < 5 mission sessions → collecting. Suspected = lowest firing layer.
- `system_insights` input gains `direction` (numbers only); content may carry `directionNote` (`analysis-v2`).

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
