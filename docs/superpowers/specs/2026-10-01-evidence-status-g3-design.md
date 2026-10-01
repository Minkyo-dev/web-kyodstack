# Evidence & status (sub-project G3) — design

- Date: 2026-10-01
- Sources: `docs/improve-requirements-3.md` §11, §17, §28–30, §32 ("Evidence before Judgment"); umbrella
  `2026-09-30-direction-layer-architecture.md` decisions 4–5, §3–4, §7; ADR 0020, 0021
- Builds on G1 (missions, paths) and G2 (habit checks). G4 reads the same numbers for diagnosis.

## Goal
The progress page answers "did I work on what matters?" with deterministic numbers: each active mission's progress
and pace, the selected path, this week's deep work vs mission-aligned work, task and habit completion, and identity
evidence. No new tables. Wording is never judgmental.

Decisions taken for the user (ADR 0022):
1. **Mission progress `mission-progress-v1`:** criteria first — mean of `check ? (met ? 1 : 0) : min(current/target, 1)`;
   else linked projects — completed / non-cancelled tasks of the mission's projects (task count, the same ratio the
   projects page shows, instead of the umbrella's estimate-minutes formula, so the two bars never disagree); else no
   bar, accumulated mission focus minutes only.
2. **Pace:** with a deadline, `paceGap = elapsed share of [created_at local day, deadline] − progress` (clamped to
   [0,1] for elapsed). Shown as text only when ≥ 0.25: "기한 대비 진행이 느립니다" (neutral), never a color alone.
3. **Alignment `alignment-v1`:** over focused minutes (pauses excluded) of timer and manual sessions that *ended* in
   the current local week (Mon–Sun, `profiles.timezone`). `aligned` = sessions whose task has an effective mission
   (`task.mission_id ?? project.mission_id`); `onPath` = aligned and (no protocol, or the protocol's path is active);
   `offPath = aligned − onPath`. Shown as hours (`Mission-aligned 11h 05m / Active 14h 20m`), ratio only in a
   `title` tooltip. Hidden below 3 h of active time ("데이터 수집 중").
4. **Task completion this week:** tasks with a non-cancelled block starting this week: completed / total.
5. **Habit consistency this week:** checks / scheduled habit-days from Monday through today (active habits; days
   before a habit's `created_at` local date are not scheduled). Hidden when there are no scheduled days.
6. **Identity evidence `identity-evidence-v1`:** per active identity over the last 28 local days: growth sessions
   (finished sessions whose task's effective mission links to the identity) and habit checks / scheduled days of
   habits whose mission links to it. A positive template sentence ("최근 행동이 'X' 정체성을 뒷받침하고 있습니다.")
   only when completion ≥ 0.6 with ≥ 5 scheduled days; otherwise numbers only.
7. **Sentences** live in one dictionary (`domain/status-text.ts`) and a unit test rejects a deny-list (부족, 실패,
   게으, 못했, 나쁜, 낮은, only, fail, lazy).
8. **Mission achievement** (umbrella "may unlock one achievement") is deferred: it would change the `ach-v1` catalog.

## 1. Pure domain (`src/features/direction/domain/status.ts`)
- `missionProgress({ criteria, projectTasks, focusMinutes }) → { kind: "criteria"|"projects"|"time", ratio: number|null, focusMinutes }`.
- `paceGap({ createdDate, deadline, today, ratio }) → number | null`.
- `alignment(sessions) → { activeMinutes, alignedMinutes, onPathMinutes, offPathMinutes }` where each session carries
  `focusedMinutes, missionId (effective), protocolId, pathActive`.
- `habitConsistency(habits, checks, from, to) → { done, scheduled }`.
- `identityEvidence(identity, ...) → { sessions, done, scheduled, sentence: string | null }`.
Each exported with a `*_VERSION` constant.

## 2. Query (`src/features/direction/queries/status.queries.ts`)
`loadDirectionStatus(supabase, userId, now) → DirectionStatus`: one function that loads, in parallel, active
missions (+ criteria, identity links, path), the mission projects' tasks (status), week + 28-day finished sessions
with `task(mission_id, protocol_id, protocol(path(status)), project(mission_id))` and pauses, this week's blocks with
task status, active habits + checks for 28 days, identities; then calls the pure functions. Missions sorted by
deadline (nulls last), then created.

## 3. UI (progress page, after the player section, before stats)
`DirectionStatus` server component in `features/direction/components/direction-status.tsx`, three sections:
- **`ACTIVE MISSION`** (terms.mission): up to 3 active missions: title link to the directive page, progress bar +
  `68%` text (or `집중 12h 30m`), basis text (`기준 2/3`, `프로젝트 작업 12/30`), deadline badge, pace sentence.
  Empty: "진행 중인 목표가 없습니다." with a link to the directive page.
- **`SELECTED PATH`** (terms.path): the first mission's active path title and approach (one line), or nothing.
- **`THIS WEEK`**: `집중 시간` (active), `목표 연결 시간` (aligned; `off-path` minutes as a sub-line "교체된 전략
  작업 1h 10m" when > 0), `완료한 작업` n/m, `습관` n/m (%).
- **Identity evidence** list under THIS WEEK: identity name, `세션 n · 습관 n/m`, optional sentence.
Uses existing `ProgressBar` (`features/projects/components/progress-bar`) and `DueBadge`.

## 4. Tests
- Unit (`tests/unit/direction-status.test.ts`): mission progress (criteria mix incl. over-target numeric, projects
  ratio, time fallback), pace gap (before/after deadline, no deadline), alignment (manual session counted, pauses
  excluded, retired path → off-path, project-derived mission), habit consistency (created mid-week, unscheduled
  weekday), identity evidence threshold, deny-list on every sentence.
- E2E (`tests/e2e/direction-status.spec.ts`): an `[e2e]` mission with two check criteria, one met → progress page
  `ACTIVE MISSION` region shows the title and `50%`; cleanup via the existing G1 cleanup.
- No SQL changes (no migration).

## 5. Docs
ADR 0022; `docs/schema.md` metric definitions (`mission-progress-v1`, `alignment-v1`, `identity-evidence-v1`);
`docs/progress.md` "Improvement G3" checklist; architecture line for `status.ts` / `status.queries.ts`.
