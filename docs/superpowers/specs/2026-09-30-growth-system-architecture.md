# Growth system architecture (umbrella)

- Date: 2026-09-30
- Sources: `docs/improve-requirements.md` (UX loop), `docs/improve-requirements-2.md` (analytics, gamification, GenAI)
- Status: umbrella design. Each sub-project gets its own detailed spec → plan → implementation.
- Structure follows `improve-requirements-2.md` §85.25 (14 sections).

## Decisions made with the user
| # | Decision |
|---|---|
| 1 | Split into sub-projects in the order **A → B → D (absorbs C) → E → F**. |
| 2 | Work Log is its own table (`work_logs`), not columns on `work_sessions`. |
| 3 | Classification has two axes: a fixed system `task_type` list plus user-owned hierarchical `practice_domains`. Templates become presets. |
| 4 | Progress (XP, quests, achievements) is updated by **idempotent rule evaluation**: called after core actions for instant feedback, and re-run nightly to reconcile. No outbox, no triggers. |

## Sub-projects
| id | name | scope | spec |
|---|---|---|---|
| A | Focus flow | pause/resume, switch, work summary, continue later, `work_logs` | `2026-09-29-focus-flow-design.md` |
| B | Calendar planning | start from block, missed blocks + reschedule, drop preview with recommendation confirm | to write |
| D | Analytics & stat engine | classification columns, recommendation v2, four stats + snapshots, Today/week summary/capacity notice (ex-C), progress page (stats part) | to write |
| E | Gamification | XP ledger, level, notifications, quests, achievements, titles, practice levels, settings | to write |
| F | GenAI features | task features with provenance, classification proposals, work-log interpretation, explanations, quest candidates | to write |

---

## 1. Current architecture problems
- Work results (scores, note) live on `work_sessions`; there is no place for session-less notes or AI interpretation.
- No pause: actual minutes = wall time.
- Weak block ↔ session link: no start-from-block and no `missed` status, so Reliability and Recovery can't be computed.
- Classification is only user templates: no AI classification, no cross-type comparison, no practice domains.
- Duration recommendation returns one number, with no range, confidence or reason.
- No stat engine and no gamification domain. AI outputs carry no per-feature provenance.

## 2. Proposed architecture
Five feature areas with one-way dependencies:

```
scheduler (raw behavior) ← classification ← analytics ← gamification
                                 ↑               ↑
                                 └──── ai ───────┘   (proposes features, explains stats)
```

| area | owns | depends on |
|---|---|---|
| `features/scheduler` | tasks, blocks, sessions, pauses, work logs, daily reflections | — |
| `features/classification` | task types, practice domains, task features, templates as presets | scheduler |
| `features/analytics` | pure deterministic functions: stats, recommendation v2, capacity, focus patterns; stat snapshots | scheduler, classification |
| `features/gamification` | XP ledger, level, quests, achievements, titles, practice levels, settings | analytics (read-only) |
| `features/ai` | provider (unchanged), classification proposals, work-log interpretation, explanations, quest candidates | classification, analytics |

- Nothing imports `features/gamification`. The only coupling is one call in the action layer,
  `evaluateProgress(ctx, hint)`, made after a core mutation succeeds, plus the nightly reconcile job.
  With gamification off, `evaluateProgress` is a no-op.
- `features/projects` stays as is; a project is shown as a Main Quest when quest terminology is on.

## 3. Domain model changes
- **Table names stay.** `schedule_blocks` = TimeBlock, `work_sessions` = FocusSession, `daily_reflections` = DailyReview.
  `docs/schema.md` gets a concept ↔ table map. Renaming tables costs more than it gives.
- **New concepts:** `work_session_pauses` (A), `work_logs` (A), `practice_domains` (D), `tasks.task_type` (D),
  `task_features` (F), `stat_snapshots` (D), gamification tables (E), `system_insights` (F).
- **Relations:** Task 1:N blocks, 1:N sessions, 1:N work logs. Work log 0..1 ↔ session.
- **State models**
  - Task: unchanged (`inbox`, `planned`, `in_progress`, `completed`, `cancelled`). UI labels: inbox = 미배정, planned = 예정.
  - Block: add `missed` (B). "Started" is derived from a linked session, not stored.
  - Session: derived from `ended_at` and open pauses (A).
- **Quest terminology** is a UI label layer only (`useTerms()`). Code and DB always say Task.

## 4. Database schema changes
All changes are new migrations: additive first, backfill, then contract (drop old columns) after the code switch.
Every new table: RLS on own rows via `(select auth.uid())`, composite `(id, user_id)` ownership FKs, `anon` revoked.

**A — focus flow**
- `work_session_pauses` and the pause/resume/stop/switch functions (see A spec). `work_sessions` gains `unique (id, user_id)`.
- `work_logs(id, user_id, task_id, session_id null, focus_score, mood_score, energy_score, note, created_at, updated_at)`.
  Partial unique on `session_id` (one log per session). Backfill from session scores/notes, then drop those session columns.

**B — calendar planning**
- `schedule_blocks.status` adds `missed`.
- "Committed" is derived: the time at which the block's current `starts_at` was set (creation or last move revision)
  is at least `commit_lead_minutes` before `starts_at`.

**D — analytics**
- `tasks.task_type`, `task_templates.task_type` (check against the fixed list), `practice_domain_id` on both.
- `practice_domains(id, user_id, name, parent_id, created_at)`; user-owned tree.
- `scheduler_settings`: `planned_work_days smallint[]` (default Mon–Fri), `min_meaningful_minutes` (30),
  `commit_lead_minutes` (120).
- `stat_snapshots(id, user_id, stat_type, scope, value null, bias, typical_error, sample_count, window_start,
  window_end, formula_version, computed_on)`. `scope` is `overall` or a task type. The latest row is the current value;
  this replaces the requirement doc's `player_stats` + `player_stat_history`.
- `task_duration_profiles` is re-keyed from template to `task_type × practice_domain` and rebuilt (derived data).

**E — gamification**
- `player_profiles(user_id pk, level, total_xp, equipped_title, gamification_enabled, quest_terminology,
  animations_enabled, achievement_toasts, created_at, updated_at)`. `level`/`total_xp` are a cache rebuildable from the ledger.
- `xp_events(id, user_id, rule, source_type, source_id, xp > 0, metadata, created_at)`, unique `(user_id, rule, source_id)`.
  Append-only (select/insert policies only).
- `quests(id, user_id, type daily|weekly|recovery|challenge, title, description, status active|cleared|expired,
  start_at, end_at, reward_xp, generated_by system|ai|user, created_at)`.
- `quest_objectives(id, quest_id, user_id, metric, operator, target_value, current_value, completed_at)`.
- `user_achievements(user_id, achievement_key, unlocked_at)`, `user_titles(user_id, title_key, unlocked_at)`.
- **Deviation from the requirement doc:** achievement and title catalogs are code constants (versioned with their
  predicates), not tables. Practice levels are computed, not stored. Main Quest reuses `projects`.

**F — GenAI**
- `task_features(id, user_id, task_id, feature_type, feature_value jsonb, source ai|user|system, status
  proposed|accepted|rejected, confidence, model, model_version, prompt_version, created_at)`.
- `work_logs` gains `ai_interpretation jsonb`, `interpretation_model`, `confirmed_blocker boolean`.
- `system_insights(id, user_id, kind, period_start, period_end, input jsonb, content jsonb, provider, model,
  prompt_version, created_at)`. Existing `weekly_reviews` and `ai_recommendations` stay.

## 5. API changes
- Mutations remain server actions (Zod → user → service → `ActionResult`).
- `ActionResult` success may carry `progress?: ProgressDelta` (`xp[]`, `levelUp`, `questsCleared[]`, `achievements[]`).
  It is empty when gamification is off.
- Route handlers only for AI (`/api/ai/*`) and jobs (`/api/internal/jobs/*`).
- New nightly jobs, reusing the `job_runs` ledger and local-time windows: `stats-snapshot`, `progress-reconcile`
  (re-evaluate rules, create/expire quests), and in F `feature-classification`.

## 6. Frontend component changes
- **A:** `FocusBar`, `SwitchTaskDialog`, `WorkSummaryDialog`.
- **B:** block hover actions (start / complete / more), missed-block prompt (start now / reschedule / skip),
  drop preview with [use recommended] / [keep mine].
- **D:** recommendation shown as range + confidence + reason; capacity notice; Today view (now / next / later /
  unscheduled); week summary line; `/scheduler/progress` with stats, patterns and practice domains.
- **E:** thin level/XP line in the header; collapsible quest panel above the task list; notifications in three tiers
  (tiny, toast, rare full-screen event); player section on the progress page; gamification settings.
- **F:** classification proposal chips (accept / edit), work-log interpretation confirm, stat explanation cards.

## 7. State management
- Unchanged foundation: Server Components, server actions, `revalidatePath`. No global store.
- Client state: timer tick (local), optimistic calendar (existing), and a `ProgressNotifier` context that queues
  notifications from `ActionResult.progress`.
- Gamification settings and terminology come from the server via context; `useTerms()` returns 할 일 or 퀘스트.

## 8. Analytics and stat formulas (v1)
Common rules: rolling windows over raw data; nightly snapshots; no extra EWMA (the window smooths, and results stay
reproducible). Below the minimum sample count, show "collecting data n/min" and store `value = null`.
Every snapshot stores `formula_version`.

| stat | eligible samples | per-sample score | aggregate | min |
|---|---|---|---|---|
| Calibration | tasks completed in the last 28 days with P > 0 and A > 0 | `100·min(A/P, P/A)`; weight 0.3 if the user confirmed an external blocker (F), else 1 | weighted mean | 8 overall, 5 per type |
| Reliability | committed blocks ended in the last 28 days | on time/early 1.0; ≤15 min late 0.9; ≤30 min late 0.75; moved or skipped ≥ lead time before start 0.85; moved later than that 0.5; missed 0 | 100 × mean | 10 |
| Consistency | planned work days in the last 42 days | 1 if focused minutes ≥ `min_meaningful_minutes`, else 0; non-work days ignored | 100 × mean | 15 planned days |
| Recovery | missed committed blocks in the last 42 days, resolved | planned work days until the first day with ≥ min meaningful minutes on the same task: same/next day 100, ≤2 75, ≤3 50, later 25, none within 14 days or task cancelled 0 | mean | 5 events |

- **Calibration P and A.** P = Σ minutes of non-cancelled blocks created before the task's first session started
  (the initial plan); if none, the user estimate; if none, not eligible. A = Σ focused minutes (A spec, v2).
  Also report **bias** = median(A/P − 1) and **typical error** = median(|A/P − 1|).
- **Session ↔ block matching** (Reliability): the session's `schedule_block_id`; otherwise a session of the same task
  starting in [block start − 30 min, block end]. A moved block's new slot is eligible only if it is itself committed.
- **Not stats (analytics only):** focus patterns (median focused session, pause ratio, mean self-rated focus);
  daily capacity = median focused minutes over planned work days with ≥ min meaningful minutes in the last 28 days;
  capacity notice when a day's planned minutes > 1.3 × capacity and exceed it by ≥ 60 min;
  reliable / high-reschedule time windows (extends the existing 3-hour window metric).
- **Recommendation v2.** Group fallback: `task_type × domain` (≥ 3 samples) → `task_type` (≥ 3) → base estimate.
  Use the 20 most recent samples. With a user estimate, the quantity is estimate × actual/base ratio; without one,
  actual focused minutes. Point = median rounded up to 5 min; range = p25–p75. Confidence: high if n ≥ 5 and
  IQR/median ≤ 0.25; medium if n ≥ 3 and ≤ 0.5; otherwise low, shown as a range only. Reason names the group and n.

## 9. AI integration design (F)
- AI never computes stats, XP, objective completion or durations. It proposes features and explains numbers.
- **Classification:** title (+ description) → task_type, practice domain (only from the user's list), complexity,
  skills. Stored in `task_features` as `proposed`. It changes the task only when the user accepts (`source = user`
  after edit, `ai` when accepted as is).
- **Work-log interpretation:** delay reason, scope change, blocker type. The user is asked "외부 방해로 표시할까요?";
  only a confirmed flag changes the Calibration weight.
- **Explanations:** stat deltas and inputs → `system_insights`. The prompt receives computed numbers only.
- **Quest candidates:** AI proposes; a rule validator checks capacity and conflicts before anything is shown.
- **Cost:** default model Haiku 4.5; classification batched in the nightly job, plus an on-demand button;
  a per-user daily call cap. Embedding-based similarity is deferred (requirement doc Phase 5).

## 10. Gamification engine (E), rules v1
- **Focus XP** (timer sessions ≥ 10 focused minutes): 0.5 XP/min for 0–30, 0.2 for 30–90, 0.05 beyond;
  cap 30 per session and 120 per day. Manual sessions earn none.
- **Completion XP:** +20 for completing a task with ≥ 10 focused minutes; at most 5 per day.
- **Commitment XP:** +10 for a committed block with reliability score ≥ 0.75.
- **Quest XP:** daily +50, weekly +300, recovery +40.
- XP is never negative and never revoked; deleting a source keeps earned XP (daily caps bound abuse).
- **Level:** XP to go from level L to L+1 = `100 + 50·L`. Monotonic because XP only grows.
- **Quests (rule-generated):**
  - Daily, at local day start: three objectives, e.g. focus ≥ min(0.6 × capacity, today's planned minutes),
    complete N planned tasks, practice a domain ≥ 30 min.
  - Weekly, at week start.
  - Recovery, after two consecutive planned work days without meaningful work: schedule a 30-minute block, then start it.
  - Main Quest = project view.
  - Expiry has no penalty.
- **Achievements and titles:** code catalog with predicates over facts. Achievements unlock titles, and one title can be equipped.
- **Practice level** per domain = `floor(√focused hours) + 1`. Parents sum their children.
- **Notifications:** tiny (+XP), toast (quest cleared, achievement), event (level up) only for rare moments.
  Calm UI otherwise. No sound effects in this scope.

## 11. Migration strategy
- Remote-only production DB: expand → backfill (idempotent) → switch code → contract in a later migration.
  Each migration is exercised by SQL tests in `begin … rollback` before being applied.
- Backfills:
  - Session scores and notes → `work_logs` (A).
  - Templates keep `task_type = null` until the user sets it, and a UI hint explains why (D).
  - Duration profiles are rebuilt (D).
- Historical gaps:
  - Pre-A sessions have zero pauses.
  - Pre-B blocks have no session link, so the time-window match applies.
  - Revisions exist since Phase 1, so commitment can be derived retroactively.
- Gamification stays hidden until E ships. There is no retroactive XP, except a one-time backfill if the user asks.

## 12. Implementation priority
A → B → D → E → F. Each is spec → plan → implementation → full verification → commit.
- D internal order: classification columns and domains → recommendation v2 → four stats and snapshots →
  Today/week summary/capacity notice → progress page.
- E internal order: XP ledger and level → notifications → quests → achievements and titles → practice levels → settings.

## 13. Risks and edge cases
- **Time zones and DST:** every "day" or "work day" is local (`profiles.timezone`). Use the existing tz utils and
  test a DST-change week.
- **Formula changes:** the version is stored, and trend charts break the line across versions instead of joining them.
- **Stat and XP farming:**
  - The commitment lead time and the zero-XP rule for manual sessions guard against it.
  - Manual sessions still count in stats, because they are real corrections. This is acceptable for a personal tool.
- **Deletion vs XP:** XP stays; daily caps bound the effect.
- **AI failure or cost:** all AI features are optional, and core flows and stats never depend on them. There is a
  per-user daily call cap.
- **Performance:** stats read at most 42 days of raw data. There are nightly snapshots, and the progress page mixes
  snapshots with light on-demand computation.
- **IP:** no names, art, fonts or terms from Solo Leveling. Use generic words ("SYSTEM") and original title names.

## 14. Test strategy
- **Formula unit tests** built from the requirement doc's examples:
  - Calibration table (60/66 → 91, 60/90 → 67).
  - Consistency A (12 h Monday) vs B (2 h daily).
  - Recovery cases (next day / Friday / abandoned).
  - Reliability tier boundaries.
  - Recommendation confidence for both example data sets.
- **Golden fixtures** per `formula_version`, so a silent formula change fails a test.
- **XP idempotency:** evaluating twice yields the same ledger, and daily caps hold.
- **SQL:** an RLS test per new table; atomicity tests for new DB functions.
- **AI:** FakeProvider and schema validation. An unaccepted proposal never changes task values. No real API calls in CI.
- **E2E:** one or two core flows per sub-project; all existing suites keep passing.
