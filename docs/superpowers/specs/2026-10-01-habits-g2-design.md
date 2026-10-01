# Habits (sub-project G2) — design

- Date: 2026-10-01
- Sources: `docs/improve-requirements-3.md` §17–18, §21; umbrella
  `docs/superpowers/specs/2026-09-30-direction-layer-architecture.md` (decision 2, §1–3); ADR 0016, 0017, 0020
- Builds on G1 (protocols). G3 reads `habit_checks` as identity evidence.

## Goal
A habit is the execution rule that repeats a protocol ("20-minute listening, Mon–Fri"). Habits scheduled for today
appear on the today screen as `DAILY QUESTS` check items. Checking one (or reaching its focus minutes) is recorded as
evidence and, with gamification on, earns a little XP inside a daily cap. The existing rule-generated quests (E2)
are relabeled `SYSTEM QUEST`. Habits work with gamification off; only labels and XP depend on it.

Decisions taken for the user (recorded in ADR 0021):
1. **Two rules.** `check` (tick it) or `focus` (met automatically when today's focused timer minutes on tasks linked
   to the habit's protocol reach `target_minutes`). `focus` requires a protocol; `check` does not.
2. **Optional protocol.** A habit with a protocol inherits its mission (Growth); without one it is a maintenance
   habit (e.g. Workout). Archiving a protocol or switching a path never touches habits.
3. **Schedule = ISO weekdays** (`1` Mon … `7` Sun, at least one). No times; planning stays in the calendar.
4. **Checks are rows.** `habit_checks` (one per habit per local day) is the evidence record. Manual checks are
   written by the user for *today only*; focus checks are written by the server when the threshold is reached
   (lazily on scheduler page load for today, nightly for yesterday and today). Unchecking deletes the manual row and
   its XP event, so toggling never farms XP.
5. **XP rule `habit`** (`xp-v1` extended, no version bump for existing rules): +10 per check, 30 per local day.
6. **Labels.** Terms gain `habit` (DAILY QUEST / 습관), `habits` (DAILY QUESTS / 습관), `systemQuest`
   (SYSTEM QUEST / 오늘의 목표), `systemQuests` (SYSTEM QUESTS / 오늘의 목표). `QuestPanel` uses them; the E2 daily
   quest label becomes `systemQuest`. Weekly/recovery labels stay.

Out of scope: streaks, reminders/notifications, habit times, past-day editing, AI suggestions, achievements.

## 1. Data model (migration `<ts>_habits.sql`)
| table | columns | constraints |
|---|---|---|
| `habits` | `title text` (1–80), `rule text` (`check`\|`focus`), `target_minutes smallint null` (5–600), `weekdays smallint[]` (non-empty ⊆ 1..7), `protocol_id uuid null`, `mission_id uuid null`, `status` (`active`\|`archived`), `sort_order int` | `unique (id, user_id)`; FK `(protocol_id, mission_id) → protocols(id, mission_id)`; FK `(mission_id, user_id) → missions(id, user_id)`; check `protocol_id is null = mission_id is null`; check `(rule = 'check' and target_minutes is null) or (rule = 'focus' and protocol_id is not null and target_minutes is not null)` |
| `habit_checks` | `habit_id`, `local_date date`, `source text` (`manual`\|`focus`), `minutes numeric null`, `created_at` | `unique (habit_id, local_date)`; `unique (id, user_id)`; FK `(habit_id, user_id) → habits(id, user_id) on delete cascade` |

- Both: `user_id → profiles(id) on delete cascade`, RLS select/insert/update/delete on `user_id = (select auth.uid())`,
  `anon` revoked, `set_updated_at` on `habits`, indexes on FK columns.
- `xp_events.rule` check gains `'habit'` (same 1–120 xp bound as the non-quest rules).

## 2. Pure domain (`src/features/direction/domain/habits.ts`)
- `isoWeekday(localDate: string): 1..7` (date-only arithmetic, no zone needed).
- `isDueOn(habit, localDate)`: active and weekday included.
- `focusMinutesFor(protocolId, sessions)`: Σ focused minutes (`focusStats`, pauses excluded) of finished **timer**
  sessions whose task's `protocol_id` equals the habit's protocol. Callers pass the sessions that ended on the local
  day.
- `habitDayView(habit, check, focusMinutes)` → `{ done, source, progress: "12/20분" | null }`.

## 3. Service / queries / actions (in `features/direction`)
- `createHabit`, `updateHabit` (title, rule, target, weekdays, protocolId, status, sortOrder). A protocol id is
  resolved with ownership; a **new** link needs an `active` protocol on an `active` path (same `isNewLink` rule as
  G1); its `mission_id` is copied from the protocol.
- `setHabitCheck(ctx, { habitId, done })`: today's local date only; habit must be owned, active and due today and
  use the `check` rule. `done` → insert `manual` row (duplicate = no-op); `!done` → delete today's manual row and the
  `xp_events` row with `rule = 'habit' and source_id = <check id>`.
- `syncFocusChecks(ctx, dates)`: for `focus` habits due on each date, compute minutes from that day's sessions and
  insert a `focus` check when `minutes ≥ target` (existing rows untouched). Called from the scheduler page for today
  (failure only logs) and from the nightly job for yesterday and today.
- `listHabits(supabase, userId)` (directive page) and `listTodayHabits(supabase, userId, today)` →
  `HabitToday[] = { id, title, rule, targetMinutes, protocolTitle, missionTitle, done, source, focusMinutes }`.
- Actions: `createHabitAction`, `updateHabitAction`, `setHabitCheckAction`. The check action calls
  `evaluateProgress` and returns the `ProgressDelta` like other core actions (the gamification import stays in the
  action layer, as ADR 0017 allows).

## 4. XP
- `DayFacts.habitChecks: { id, createdAt }[]` from `habit_checks` by `local_date`; `evaluateDay` emits
  `rule: "habit", sourceType: "habit_check", xp: 10` with `DAY_CAP.habit = 30`. `XP_RULE_LABEL.habit = "습관"`.
- Enabling gamification backfills habit XP like the other rules (checks before enabling count).

## 5. UI
- **Today screen:** the scheduler page composes `<HabitPanel habits={…} />` and passes it as a `habitPanel` slot
  (scheduler code never imports `features/direction` components). Rendered above the quest panel, only when at least
  one habit is due today. Region `aria-label = terms.habits`. Each row: `●`/`○` symbol + text `완료`/`미완료` for
  screen readers, title, a small mission chip when it has one, and either a checkbox (`check`) or `12/20분 · 자동`
  (`focus`). Header shows `done/total`.
- **Directive page:** a `terms.habits` section under identities: list (title, weekdays like `월 화 수 목 금`, rule
  text, protocol › mission, archive/restore) and a `새 습관` form (title, rule select, target minutes, protocol select
  grouped by mission (active protocols on active paths), weekday checkboxes defaulting to Mon–Fri).
- **Mission detail:** each protocol item lists its active habits by title.
- **Quest panel:** header `terms.systemQuests`, daily quest label `terms.systemQuest`.

## 6. Errors
`23505` on `habit_checks` is treated as already-checked (no error). `23514` (rule/protocol checks) → `VALIDATION_ERROR`.
Checking a habit not due today or with the `focus` rule → `VALIDATION_ERROR` "오늘 체크할 수 없는 습관입니다."

## 7. Tests
- **SQL** `supabase/tests/rls/habits.sql`: RLS on both tables; cross-user habit → protocol/mission FKs rejected;
  protocol/mission mismatch rejected; `focus` without protocol rejected; empty or out-of-range weekdays rejected;
  second check for the same day rejected; `xp_events` accepts `habit`.
- **Unit:** `isoWeekday`, `isDueOn`, `focusMinutesFor` (manual sessions ignored, pauses excluded, other protocols
  ignored), `habitDayView`; `evaluateDay` habit XP and cap; habit schemas; terms.
- **E2E** `tests/e2e/habits.spec.ts`: create a `[e2e]` check habit due every day on the directive page → it appears
  under the habits region on `/scheduler` → check it (shows `완료`, row in DB) → uncheck (row gone) → archive it on
  the directive page → gone from today. Cleanup deletes `[e2e]` habits (checks cascade) and their `habit` XP events.
- Existing suites keep passing (quest label assertions move to `SYSTEM QUEST`).

## 8. Docs
ADR 0021; `docs/schema.md` "Habits G2" section; `docs/architecture.md` (habit parts of `features/direction`, the
`habitPanel` slot); `docs/progress.md` "Improvement G2" checklist.
