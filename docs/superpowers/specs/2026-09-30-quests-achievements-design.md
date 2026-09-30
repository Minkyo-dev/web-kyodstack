# Quests, achievements, titles, quest terminology (sub-project E2) — design

- Date: 2026-09-30
- Sources:
  - `docs/improve-requirements-2.md` §4, §51, §53–57, §60
  - Umbrella `docs/superpowers/specs/2026-09-30-growth-system-architecture.md` §4 (E), §6, §7, §10, §13
  - E1 `docs/superpowers/specs/2026-09-30-xp-level-design.md` (ledger, `evaluateProgress`, notifier, settings)
  - D2/D3 (`commitments()`, `dailyCapacity`, overload rule, practice domains)
- Second and last part of E. AI quest candidates wait for F.

## Goal
Give each day and week a small meta objective built from the user's own data, recognize meaningful milestones with
achievements and titles, and let the user switch the whole private UI to quest terminology. Everything stays
optional, penalty-free and calm; the scheduler remains the center.

## Decisions made with the user
1. Daily quests are **generated automatically**, and one objective can be **swapped once** per day.
2. Quest terminology applies to **the whole private UI** (all visible labels), not only a few headings.

## 1. Data

### `quests`
`id, user_id, type daily|weekly|recovery, status active|cleared|expired, period_start date, period_end date,
reward_xp int, swap_used bool default false, generated_by text default 'system', created_at, cleared_at`.
- Unique `(user_id, type, period_start)` for every type. A partial unique index allows only one `active` recovery
  quest per user.
- `period_end` is inclusive (daily: same day; weekly: last day of the week; recovery: the day after creation).
- RLS: select own. Insert/update own (the service generates and updates with the user's client; the nightly job
  uses the service role). Delete own exists only for E2E cleanup (same stance as `xp_events`, ADR 0016).

### `quest_objectives`
`id, quest_id, user_id, position smallint, metric text, params jsonb default '{}', target_value numeric,
current_value numeric default 0, completed_at timestamptz`.
- FK `(quest_id, user_id)` → `quests(id, user_id)` (composite ownership, like the rest of the schema).
- Unique `(quest_id, position)`. RLS: select/insert/update own.

### `user_achievements`, `user_titles`
`(user_id, key, unlocked_at)`, primary key `(user_id, key)`. RLS: select/insert/delete own; no update. The app never
re-locks; own delete exists only for E2E cleanup.

### `player_profiles.equipped_title text null`
- A trigger rejects a value that is not in the user's `user_titles` (null always allowed). Column privilege: users
  may update it.

### `xp_events`
- Rule set gains `quest` (source = quest id, source_type `quest`).
- XP check becomes per rule: `quest` 1–300, every other rule 1–120.

## 2. Quest rules (pure, `features/gamification/utils/quest-rules.ts`, `QUEST_RULES_VERSION = "quest-v1"`)

### Metrics
| metric | params | current value |
|---|---|---|
| `focus_minutes` | — | focused minutes (timer and manual) in the period |
| `complete_planned_tasks` | `taskIds` | how many of the listed tasks (planned for the period at generation) are completed |
| `complete_tasks` | — | tasks completed in the period |
| `domain_minutes` | `domainId` | focused minutes on tasks in the domain (children included) |
| `domain_sessions` | `domainId` | sessions ≥ 10 focused min in the domain |
| `kept_commitments` | — | kept final commitments (score ≥ 0.75, not skipped/cancelled) resolved in the period |
| `kept_commitment_rate` | `min` | kept / all final commitments × 100, 0 until `min` commitments resolved |
| `days_within_capacity` | — | elapsed planned work days in the period without overload (D3 rule) |
| `early_session` | `before` (HH:mm) | 1 if a timer session started before the time on that day |
| `booked_block` | `minMinutes` | 1 if a block ≥ min minutes was created after the quest and starts in the future at creation |
| `started_session` | — | 1 if a timer session started after the quest was created |

An objective is complete when `current ≥ target`; `completed_at` is set once and kept.

### Daily quest — "모멘텀 쌓기", +50 XP
Candidates in order; the first three become objectives, the rest feed the swap:
1. `focus_minutes` ≥ `max(30, round5(min(0.6 × capacity, planned minutes today)))`; capacity null or nothing
   planned → 60.
2. `complete_planned_tasks` with `N = min(2, planned tasks today)` (planned = has a block today or target date
   today, not completed); none planned → `complete_tasks` ≥ 1.
3. `domain_minutes` ≥ 30 in the domain with the most focused minutes in the last 28 days; no domain →
   `kept_commitments` ≥ 1.
4. `early_session` before 12:00.
5. `kept_commitments` ≥ 1 (skipped if already used above).

Swap: replace one objective with the next unused candidate; allowed once (`swap_used`), never with a duplicate
metric. A completed objective cannot be swapped.

### Weekly quest — "모멘텀 유지", +300 XP
1. `focus_minutes` ≥ `round30(0.6 × capacity × planned work days in the week)`; capacity null → 300.
2. `kept_commitment_rate` ≥ 75 with `min` 4; the target resolves only once 4 commitments exist.
3. `domain_sessions` ≥ 3 in the top domain; no domain → `complete_tasks` ≥ 5.
4. `days_within_capacity` ≥ `planned work days − 1` (at least 1); capacity null → objective omitted.

### Recovery quest — "다시 시작", +40 XP
- Trigger (checked when quests are ensured): the last two planned work days before today both had focused minutes
  < `min_meaningful_minutes`, the user has activity before them, and no recovery quest was created in the last
  7 days.
- Objectives: `booked_block` (30 min), `started_session`. Expires at the end of the next day.

### Lifecycle
- **Ensure** (`ensureQuests`): on scheduler page load (server) and in the nightly job. Creates today's daily quest,
  this week's weekly quest and a recovery quest when triggered. Idempotent through the unique keys. Nothing is
  created while gamification is off, and no past quests are backfilled.
- **Evaluate:** `evaluateProgress` (E1) also recomputes the active quests' objectives, then clears a quest whose
  objectives are all complete (status, `cleared_at`, `quest` XP event). The delta gains
  `questsCleared: { type, title, xp }[]`.
- **Expire:** the nightly job and `ensureQuests` mark active quests whose `period_end` has passed as `expired`.
  No penalty.

## 3. Achievements and titles (pure, `features/gamification/utils/achievements.ts`, `ACHIEVEMENTS_VERSION = "ach-v1"`)

| key | name | condition | title |
|---|---|---|---|
| `first_step` | FIRST STEP | a timer session with ≥ 10 focused minutes | BUILDER |
| `deep_session` | DEEP SESSION | 10 sessions with ≥ 60 focused minutes | DEEP WORKER |
| `reliable_planner` | RELIABLE PLANNER | 10 completed tasks with an estimate and \|actual/estimate − 1\| ≤ 0.10 | RELIABLE PLANNER |
| `early_starter` | EARLY STARTER | 10 final commitments with score 1 | EARLY STARTER |
| `consistent_builder` | CONSISTENT BUILDER | 4 weekly quests cleared | CONSISTENT OPERATOR |
| `comeback` | COMEBACK | 1 recovery quest cleared | — |
| `system_thinker` | SYSTEM THINKER | 5 other achievements unlocked | SYSTEM THINKER |

- Each has a Korean description and a progress function (`6 / 10`) for the locked card.
- Achievements give no XP. Once unlocked, never re-locked. Titles unlock with their achievement.
- Evaluated with XP after actions, nightly, and in the enable backfill. Facts: lifetime session focus, completed
  tasks' estimate vs actual (`task_plan_actual`), commitment scores, quest clear counts. The loader runs only when
  some achievement is still locked.
- Delta gains `achievements: { key, name }[]`. Toast "ACHIEVEMENT · NAME" when `achievement_toasts` is on; the
  backfill shows one summary toast ("업적 N개 달성") instead.
- Names are original (umbrella §13).

## 4. Terminology (`src/lib/terms.ts`)
- Two dictionaries (`plain`, `quest`) with the visible nouns: task(s) → 할 일 / 퀘스트, project(s) → 프로젝트 /
  메인 퀘스트, plus composed labels where word order matters.
- `josa(word, pair)` picks the particle by the last syllable's final consonant (을/를, 이/가, 은/는, 과/와, 으로/로).
- Server: `getTerms(profile)`; client: `TermsProvider` + `useTerms()` in the private layout (same profile load as
  the level line).
- Quest terminology counts only when gamification is also on.
- Covered: every visible label in the private area (nav, headings, placeholders, buttons, empty states, dialogs,
  toasts, progress-page copy). Not covered: public pages, AI prompts, server `AppError` messages, code/DB names,
  quest objects ("일일/주간/회복 퀘스트" keep their names).

## 5. UI
### Quest panel (scheduler left panel, above the Today sections)
- Shown when gamification is on and a quest is active or cleared in its period. Collapsible; the state is
  remembered in localStorage (try/catch).
- `DAILY QUEST · 모멘텀 쌓기 · +50 XP`, then one row per objective: `☐ 집중 45m / 90m` or `☑ …` (symbol + text,
  never color alone). [교체] per incomplete objective until the swap is used; afterwards a note "교체 사용함".
- Weekly and recovery quests: one summary row each (`WEEKLY QUEST · 2/4`), expandable.
- A cleared quest shows `CLEARED` until its period ends.

### Notifications
- Quest cleared → toast `QUEST CLEARED · 일일 퀘스트 +50 XP` (always, while gamification is on).
- Achievement → toast `ACHIEVEMENT · RELIABLE PLANNER` (when `achievement_toasts`).
- Level-up event unchanged.

### Progress page
- Player section: level, equipped title, active quests (read-only summary).
- Achievements: cards; locked shows condition and progress, unlocked shows the date.
- Titles: unlocked titles with [장착] / [해제]; the equipped one also appears under the level line on desktop.
- Settings: "퀘스트 용어" becomes active.

## 6. Errors
- Quest ensure/evaluate failures are logged; the page renders without the panel and core actions succeed.
- Swap, equip and settings actions: Zod → user → service → `ActionResult`; the service checks that the quest,
  objective or title belongs to the user; raw errors map to `AppError`.

## 7. Testing
- **Unit:** daily/weekly candidates incl. fallbacks (no capacity, nothing planned, no domain); every metric's
  evaluator; swap rules (once, no duplicate metric, not a completed objective); recovery trigger (two work days,
  earlier activity, 7-day gap); each achievement predicate at its boundary and monotonic unlocks; `josa` with and
  without a final consonant; both term dictionaries.
- **SQL:** RLS on the four tables; unique daily/weekly per period; one active recovery; `quest` XP 1–300 while other
  rules stay ≤ 120; `equipped_title` accepts only an unlocked title.
- **E2E (`tests/e2e/quests.spec.ts`):** enable → daily quest panel; swap once (then disabled); complete the
  objectives with seeded data → QUEST CLEARED toast; FIRST STEP unlocked → equip BUILDER; terminology on → labels
  change (nav "메인 퀘스트", add-task placeholder); restore everything in `finally`. Existing suites keep passing.

## 8. Deviations (ADR 0017)
- Achievements give no XP.
- Quests are generated lazily (page load) and nightly; none are backfilled.
- Objective catalog, fallbacks and achievement catalog are code constants.
- Per-rule XP limit (`quest` up to 300).
- Quest terminology requires gamification on.
- AI quest candidates are deferred to F.

## Out of scope
AI-generated quests, challenge/user-made quests, sound effects, streak mechanics.
