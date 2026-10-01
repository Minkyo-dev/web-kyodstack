# Implementation Progress

Tracks spec §68 (phases) and §71 (first implementation sequence).
Check a box only after the verification commands in `AGENTS.md` pass for that step.

## Phase 0 — Foundation
- [x] Step 1: dependencies (zod, date-fns, @date-fns/tz, vitest)
- [x] Step 2: route groups `(public)`, `(auth)`, `(private)`; features/; lib/supabase; supabase/tests
- [x] Step 3: Supabase SSR auth: `lib/supabase/{client,server,proxy}.ts`, `src/proxy.ts`, `/login`
- [x] `lib/env.ts` validation, `lib/errors.ts`, `lib/logger.ts`
- [x] Step 4: migrations (applied to remote 2026-09-29): profiles, scheduler_settings, task_templates, tasks, schedule_blocks,
      schedule_block_revisions, work_sessions, daily_reflections
- [x] Step 5: RLS on every table + `supabase/tests/rls/scheduler_core.sql` passing
- [x] Exit: anon is redirected and has no table privileges; the owner session loads /dashboard and /scheduler,
      and RLS returns only the owner's profile/settings (verified 2026-09-29)

## Phase 1 — Core Scheduler
- [x] Step 6: Today task list (create / edit / delete / complete / reopen / cancel)
- [x] Step 7: FullCalendar week view (luxon named-timezone plugin, profile timezone; mobile = day view + day tabs)
- [x] Step 8: task → calendar drop (base estimate → slot-rounded, clamped; ADR 0006)
- [x] Step 9: move / resize + revisions via `move_schedule_block` (atomic; ADR 0004)
- [x] Task detail drawer (edit, schedule by date/time as the keyboard/mobile path, block complete/skip/delete)
- [x] Click-drag empty range → name → task + block
- [x] Exit: E2E `tests/e2e/scheduler.spec.ts` passes. It checks create → drop → reload → move → reload → resize,
      and the revisions `created, moved, resized`. The SQL test `supabase/tests/rls/schedule_functions.sql` passes.

## Phase 2 — Actual Work Tracking
- [x] Step 10: work-session timer via atomic `start_work_session` (starting from a block links both ids; task → in_progress);
      one active timer (unique index → ACTIVE_TIMER_EXISTS); stop dialog with editable end time + focus/mood/energy/note
- [x] Manual sessions (overlap with existing or running sessions rejected; ≤16h; no future times); delete a session
- [x] Daily reflection dialog (auto summary + mood/focus/energy/note, upsert per local day)
- [x] Step 11: planned vs actual. The metrics bar shows planned / actual (+ running) / focus / completed.
      The drawer shows per-task estimate / planned / actual / % / focus / move count from the `task_plan_actual` view.
      Sessions are drawn on the calendar as hatched "실제" events next to the plan blocks.
- [x] Exit: E2E `tests/e2e/work-tracking.spec.ts` passes, and so does SQL `supabase/tests/rls/work_sessions.sql`

## Phase 3 — Adaptive Duration
- [x] Step 12: `task_duration_profiles` (derived cache, RLS, composite FK) + pure estimator `utils/estimator.ts`
      (eligibility §26.3, ratio clamp [0.5, 3], cold start < 3, median of ≤ 20 recent samples, factor clamp [0.75, 2],
      p75, EWMA; template+complexity → template → base fallback §26.6; 5-minute rounding, ADR 0008)
- [x] Refresh the affected template on complete / reopen / edit of a completed task / session add, delete or stop on a completed task.
      Best-effort: a cache failure never fails the primary write.
- [x] The same `estimateDuration` drives the server block size, the drag preview and the drawer explanation (§62)
- [x] Exit: E2E `tests/e2e/duration-learning.spec.ts` passes. Three 60→80 min samples give ×1.3333, the drop creates
      10:00–11:20, `recommended_minutes = 80`, and reopening returns to cold start.

## Phase 4 — Projects
- [x] Step 13: `projects`, `milestones` (RLS, composite ownership FKs), `tasks.project_id/milestone_id`.
      The DB enforces §44: the milestone must belong to the task's project, and a milestone requires a project.
      Projects and milestones are closed by status, not deleted (task FKs are NO ACTION; account deletion still cascades).
- [x] `/scheduler/projects` list (status, due D-n / overdue with icon + text, progress, remaining estimate, next milestone)
      and `/scheduler/projects/[id]` detail (milestones with inline status/edit, per-milestone progress and quick-add, unlinked tasks, settings)
- [x] Progress = pure `computeProgress`. The remaining estimate uses the personal estimator net of time already spent.
- [x] The task drawer links a task to a project/milestone (a milestone implies its project); the Today list shows "Project › Milestone"
- [x] Exit: E2E `tests/e2e/projects.spec.ts` + SQL `supabase/tests/rls/projects.sql` pass

## Phase 5 — AI
- [x] Step 14: `weekly_reviews`, `ai_recommendations` (RLS, composite FKs, decided_at ⇔ status) + atomic
      `accept_ai_recommendation` + SQL test; `AiProvider` interface, `AnthropicProvider` (default claude-haiku-4-5-20251001, structured output;
      effort/server-side fallback only on newer models) and `FakeProvider`; versioned prompts (v1)
- [x] Deterministic `computeWeeklyMetrics` v1 (planned/actual/ratio, completed/created, skipped, reschedules with minutes and days shifted,
      focus/mood/energy, deep work, top/under/over task types, best/worst 3-hour focus windows) + `remainingCapacityMinutes`
- [x] Recommendation guardrails (`sanitizeRecommendations`), no LLM call when there is no capacity or no active project, expire-then-insert idempotency
- [x] UI: `/scheduler/review` (metrics + AI interpretation + regenerate), "AI 추천" in the Today panel and on the project detail page
      (rationale / edit then accept / reject)
- [x] Exit: E2E `tests/e2e/ai-recommendations.spec.ts` (no task before accept; edit + accept → linked task; reject → no task);
      invalid AI output is rejected by the schema and guardrail unit tests
- [ ] Real generation smoke run: blocked by the Anthropic account's credit balance (API 400 "credit balance is too low").
      The failure path was verified: 502 + a friendly toast, nothing persisted.

## Phase 6 — Automation
- [x] `job_runs` ledger (unique job/user/run_key; users read-only) + SQL test; pure `decideClaim` (insert/skip/retry ≤ 3) + tests
- [x] Jobs: daily_planner (local 05–10, per local date), weekly_review (first local day of week → previous week;
      skips existing/empty weeks), duration_profile_refresh (daily rebuild). Local-time windows are DST-safe (unit-tested).
- [x] `/api/internal/jobs/*` (GET/POST, Bearer secret, constant-time compare; 503 without a secret) + `vercel.ts` crons (ADR 0010)
- [x] Explicit `user_id` scoping for every query the jobs reach (week loader, duration profiles, recommendation inputs)
- [x] Verified: 503 without a secret, 401 with no/wrong token, 500 "SUPABASE_SERVICE_ROLE_KEY is not configured" with the right token
- [ ] End-to-end job run: needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (and the Anthropic credit for the AI jobs)

## Improvement A — focus flow (docs/superpowers/specs/2026-09-29-focus-flow-design.md)
- [x] Pauses, work logs, atomic stop/switch, actual minutes v2 (migration + SQL tests, ADR 0011)
- [x] FocusBar, WorkSummaryDialog (complete / continue later), SwitchTaskDialog, partial tasks sized to the remainder
- [x] Contract: session score/note columns dropped
- [x] E2E `focus-flow.spec.ts`; `work-tracking.spec.ts` updated (manual entry uses yesterday, so it is time-of-day independent)

## Improvement B — calendar planning (docs/superpowers/specs/2026-09-30-calendar-planning-design.md)
- [x] `missed` status, `mark_missed_blocks` (page load + nightly), `unschedule_block`, `show_actual_default` (SQL tests, ADR 0012)
- [x] `utils/block-state.ts`: not started / missed / running, next free slot, same time tomorrow (DST-safe)
- [x] Block card ▶ / ⋯ (complete, reschedule today/tomorrow/pick, skip, unschedule); start from a block via the switch dialog
- [x] "실제 작업 보기" toggle + ⚙ default setting; drop preview recommendation + "keep my estimate" toast
- [x] E2E `calendar-planning.spec.ts`; `duration-learning.spec.ts` covers keep-my-estimate

## Improvement H — help, project archive, month view (ADR 0024)
- [x] (?) help popover with concept + how-to on scheduler, directive, projects, review, progress (E2E `page-help.spec.ts`)
- [x] Project archive folder (`projects.archived_at`), archive/restore, archived projects leave pickers (SQL + E2E `project-archive.spec.ts`)
- [x] Scheduler month view (`?view=month`), week/month toggle, month navigation, drag to another day (E2E `month-view.spec.ts`)

## Improvement G4 — strategy review (docs/superpowers/specs/2026-10-01-strategy-review-g4-design.md)
- [x] Pure `diagnosis-v1` (lowest firing layer, collecting below 5 sessions) and neutral SYSTEM QUESTION texts (ADR 0023)
- [x] SYSTEM QUESTION on mission cards with navigate-only choices and a per-week [유지]
- [x] F2 analysis input gains the direction block; `analysis-v2` `directionNote` behind the evidence check
- [ ] No dedicated E2E (needs ≥ 5 sessions over days); unit tests cover the rules, G3/F2 E2E cover the screens

## Improvement G3 — evidence & status (docs/superpowers/specs/2026-10-01-evidence-status-g3-design.md)
- [x] Pure mission progress, pace, alignment, habit consistency, identity evidence; deny-listed sentences (ADR 0022)
- [x] `loadDirectionStatus` and the ACTIVE MISSION / PATH / 이번 주 / identity evidence section on the progress page
- [x] E2E `direction-status.spec.ts`

## Improvement G2 — habits (docs/superpowers/specs/2026-10-01-habits-g2-design.md)
- [x] `habits`, `habit_checks`, xp rule `habit` (SQL tests, ADR 0021)
- [x] Pure habit rules (weekday, due, focus minutes); terms for habits / SYSTEM QUEST
- [x] Habit XP (+10, 30/day); unticking removes its XP
- [x] Habits on the directive page; DAILY QUESTS panel on the today screen; focus checks on page load + nightly
- [x] E2E `habits.spec.ts`

## Improvement G1 — direction layer (docs/superpowers/specs/2026-09-30-direction-layer-g1-design.md)
- [x] Purposes, identities, missions (+ identities, criteria), paths, protocols; task/project links; `switch_path`; retired guards (SQL tests, ADR 0020)
- [x] Pure breadcrumb and link rules; terms for directive/mission/path/protocol
- [x] `/scheduler/directive` (directive, identities, missions, criteria, path + history, protocols)
- [x] Task drawer picker + breadcrumb, Growth chip in the list, mission on projects
- [x] E2E `directive.spec.ts`; cleanup restores the owner's purpose

## Improvement F2 — SYSTEM analysis + AI quest candidates (docs/superpowers/specs/2026-09-30-system-analysis-ai-quests-design.md)
- [x] `system_insights`, analysis schedule settings (default off), `quests.generated_by = 'ai'` + `reason` (SQL tests, ADR 0019)
- [x] Analysis slot / due check / input builder / evidence check (pure)
- [x] Weekly SYSTEM ANALYSIS card on the progress page (lazy + nightly, re-analyze once a day, schedule setting)
- [x] AI-picked daily quests from the rule pool in the nightly job, rule fallback, "SYSTEM 추천" line
- [x] E2E `system-analysis.spec.ts`

## Improvement F1 — AI classification + work-log interpretation (docs/superpowers/specs/2026-09-30-ai-classification-worklog-design.md)
- [x] `task_features`, `ai_calls`, work-log interpretation columns (SQL tests, ADR 0018); 30/day AI budget for every AI call
- [x] Classification prompt/validator/proposal rules; "SYSTEM 제안" in the task drawer (apply / edit / ignore)
- [x] Work-log interpretation via `after()`; blocker confirmation; Calibration weight 0.3 (`stats-v2`)
- [x] Nightly classification batch and interpretation catch-up
- [x] E2E `ai-classification.spec.ts`

## Improvement E2 — quests, achievements, titles, terminology (docs/superpowers/specs/2026-09-30-quests-achievements-design.md)
- [x] `quests`, `quest_objectives`, `user_achievements`, `user_titles`, `equipped_title`; `create_quest` / `swap_quest_objective`; quest XP ≤ 300 (SQL tests, ADR 0017)
- [x] Pure quest rules `quest-v1` (daily/weekly/recovery, swap, 11 metrics) and achievement catalog `ach-v1`; terms + `josa`
- [x] `ensureQuests` (page load + nightly), quest/achievement evaluation in `evaluateProgress`, swap/equip actions
- [x] Quest panel in the scheduler, quest/achievement toasts, achievements and titles on the progress page, title under the level line
- [x] Quest terminology across the private UI
- [x] E2E `quests.spec.ts`

## Improvement E1 — XP, level, notifications (docs/superpowers/specs/2026-09-30-xp-level-design.md)
- [x] `player_profiles`, `xp_events`, `award_xp` (invoker) with the cache trigger (SQL tests, ADR 0016)
- [x] Pure XP rules `xp-v1`, level curve, practice level, day facts from sessions/completions/commitments
- [x] Progress on core actions (`ActionResult.progress`), nightly reconcile, opt-in backfill and settings actions
- [x] Level line, +XP chip, level-up event; progress page player section, settings, practice levels
- [x] E2E `gamification.spec.ts`; E2E cleanup removes XP from test sources

## Improvement D3 — Today view + capacity (docs/superpowers/specs/2026-09-30-today-summary-capacity-design.md)
- [x] Pure `todaySections`, overload rule, overflow selection; shared `dailyCapacity` used by the stat engine (ADR 0015)
- [x] Page loads capacity, week completed count and today/tomorrow blocks
- [x] Today panel sections (지금/다음/이후/미배정/오늘 완료), week summary line, capacity notice with the 계획 조정 dialog
- [x] E2E `today.spec.ts`

## Improvement D2 — stat engine + progress (docs/superpowers/specs/2026-09-30-stat-engine-progress-design.md)
- [x] Work-standard settings and `stat_snapshots` (SQL tests, ADR 0014)
- [x] Pure `computeStats` (Calibration, Reliability, Consistency, Recovery, patterns, domains) with requirement examples as tests
- [x] `loadStatInput`, nightly snapshot in the existing job, work-standards action
- [x] `/scheduler/progress` (cards with 8-week trends, per-type Calibration, patterns, practice domains) and the 작업 기준 dialog
- [x] E2E `progress.spec.ts`

## Improvement D1 — classification + recommendation v2 (docs/superpowers/specs/2026-09-30-classification-recommendation-design.md)
- [x] Task types, practice domains, tags (+ joins), duration groups; template names backfilled as tags (SQL tests, ADR 0013)
- [x] Estimator v2 (type×domain → type → tag; range, confidence, reason); `task_duration_profiles` dropped
- [x] Quick add `#tag @domain` with autocomplete; type/domain/tags in list and drawer; tag filter (`?tags=`)
- [x] Classification management dialog (tags, domains, templates) and the untyped-template banner
- [x] E2E `classification.spec.ts`; `duration-learning.spec.ts` runs through the tag fallback

## UI updates
- [x] `/scheduler/projects` is one page: project list + create on the left, the selected project (`?project=`) with
      milestones and tasks on the right; `/scheduler/projects/[id]` redirects there
- [x] Every date field uses the shared calendar `DatePicker` (`src/components/ui/date-picker.tsx`, no new dependency)

## Household finance (docs/household-finance-design.md, ADR 0025)
- [x] Household / members (invite code, one household per user), accounts, categories, transactions with membership
      RLS, composite household FKs, category-tree and stamp triggers (SQL tests `supabase/tests/rls/finance.sql`)
- [x] One cash-flow rule in SQL (`finance_cash_flow` → daily / monthly / category totals); transfers excluded,
      refunds offset expense
- [x] Transaction CRUD (expense / income / transfer) with service-side household checks
- [x] Calendar (month grid, URL `?month=&date=`) and Day Drawer (right drawer / mobile bottom sheet: totals, list,
      detail, edit, delete, add)
- [x] Dashboard monthly / yearly: summary + previous-period change, cash-flow chart with table view, category
      breakdown with previous-period delta, recent transactions, empty state, per-section skeletons
- [x] Transactions page: date range, type, category (incl. children), account (either side of a transfer), payer,
      amount range, search
- [x] Settings: accounts (create, edit type/owner/institution, reorder, archive), categories (create, sub, rename,
      icon, move, drag & drop / arrow reorder, archive), household (name, display name, invite code)
- [x] Unit tests `tests/unit/finance.test.ts`; E2E `finance.spec.ts` (cleanup removes `[e2e]` finance rows)
- [x] ADR 0027: logical category delete (`deleted_at`, confirm dialog, parent takes its children) and the bulk entry
      grid `/finance/transactions/bulk` (keyboard navigation, picker cells, spreadsheet paste, all-or-nothing save).
      Tests `tests/unit/finance-bulk.test.ts`, E2E `finance-bulk.spec.ts`, RLS assertions in `finance.sql`
- [x] ADR 0028: calendar day panel (xl two columns: the day's totals, every income/expense/transfer with detail on
      click, and the entry grid for that day); bulk entry takes transfers and starts with no rows
- [x] ADR 0029: recurring payments `/finance/recurring` (`finance_subscriptions`, idempotent charging into ordinary
      EXPENSE transactions on page load, after a save and from the daily job). Tests
      `tests/unit/finance-subscription.test.ts`, RLS assertions in `finance.sql`, E2E `finance-recurring.spec.ts`
- [x] ADR 0030: Pretendard (variable dynamic subset, self-hosted from npm) for Hangul; Geist stays for Latin
- [x] ADR 0031: E2E runs as the dedicated user `e2e@kyodstack.test` (`.env.local`); helpers refuse a non-`.test` account

## Open questions
- Legacy tables (blog_posts, user_roles, invite_tokens, …) still have advisor warnings: `is_admin()` is
  executable by anon, and the policies use `auth.uid()` without `(select …)`. Fix these when the portfolio/blog is rebuilt.
  Don't just revoke `is_admin` from anon: the legacy `*_admin_write` policies apply to every role.
- E2E can target a running dev server with `E2E_BASE_URL=http://localhost:3000` (Next allows one dev server per project).
- AI provider/model (decide at Phase 5). Note: AI SDK 7 requires Node ≥ 22; local Node is 20.19.
