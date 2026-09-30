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
- [ ] Step 12: duration analytics, task_duration_profiles, correction factor, explanation UI

## Phase 4 — Projects
- [ ] Step 13: projects, milestones, project detail, progress metrics

## Phase 5 — AI
- [ ] Step 14: provider abstraction, weekly review, recommendations, accept/reject

## Phase 6 — Automation
- [ ] Cron jobs (daily-planner, weekly-review, duration-profile-refresh), idempotent

## Open questions
- Legacy tables (blog_posts, user_roles, invite_tokens, …) still have advisor warnings: `is_admin()` is
  executable by anon, and the policies use `auth.uid()` without `(select …)`. Fix these when the portfolio/blog is rebuilt.
  Don't just revoke `is_admin` from anon: the legacy `*_admin_write` policies apply to every role.
- E2E runs against the owner account with `[e2e]`-prefixed data that is cleaned up. Consider a dedicated test user.
- Korean webfont: Geist has no Hangul glyphs, so the OS fallback font is used. Decide whether to add a Korean font (e.g. Pretendard).
- AI provider/model (decide at Phase 5). Note: AI SDK 7 requires Node ≥ 22; local Node is 20.19.
