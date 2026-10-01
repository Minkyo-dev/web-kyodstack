# Direction layer architecture (umbrella, G)

- Date: 2026-09-30
- Source: `docs/improve-requirements-3.md` (Purpose · Identity · Goal · Strategy · Tactics · Quest)
- Builds on: `2026-09-30-growth-system-architecture.md` (A–F), ADR 0016–0019
- Status: umbrella design. Each sub-project (G1–G4) gets its own spec → plan → implementation.

## Goal
Keep the SYSTEM UI and the gamification as they are, and add a direction layer above quests, so that every
growth quest can answer "why am I doing this?":

```
PURPOSE → IDENTITY → MISSION (goal) → PATH (strategy) → PROTOCOL (tactic) → HABIT → QUEST → ACTION → EVIDENCE → REVIEW
```

Principles from the requirement doc that every sub-project must respect:
- Direction before action, strategy before effort, systems before motivation, evidence before judgment.
- The daily screen shows quests only. The hierarchy appears as a breadcrumb in quest detail and on its own page.
- Not every quest belongs to a mission: maintenance quests are first-class.
- The SYSTEM is an advisor. Every recommendation carries a choice ([Accept] / [Keep]). Nothing changes automatically.
- Level and stats describe recorded behavior, not a person's worth. No judgmental wording.

## Decisions made with the user
| # | Decision |
|---|---|
| 1 | **Mission ↔ project:** a project belongs to a mission (`projects.mission_id`, nullable). Chain: mission → project → milestone → task. Existing projects and their UI stay. |
| 2 | **Habits vs existing daily quests:** both live on the today screen. Habits are the check items under `DAILY QUESTS`; the existing rule-generated metric quests (E2) are relabeled `SYSTEM QUEST`. Habit completions are evidence. |
| 3 | **Strictness:** strict at the top, loose at the bottom. One active purpose; many identities; mission ↔ identity N:M; one active path per mission with retired paths kept as history; protocols belong to a path; habits optionally belong to a protocol; a task may link to a protocol, a mission or a project. |
| 4 | **Growth / Maintenance** is derived: a task with an effective mission is Growth, otherwise Maintenance. Alignment = growth focused time vs all focused time, shown as hours first. XP is the same for both. |
| 5 | **Mission progress:** success-criteria checklist first, linked-project progress as fallback, accumulated mission time when neither exists. Deterministic. |
| 6 | **Authoring:** a dedicated `/scheduler/directive` page plus mission/protocol pickers on tasks and projects. No wizard. AI drafting is deferred. |
| 7 | **Strategy review:** a deterministic layer diagnosis (goal, strategy, tactic, planning, execution, recovery) picks the suspected layer with evidence; AI only phrases it through the existing F2 analysis. |
| 8 | **Order:** G1 → G2 → G3 → G4. |

## Sub-projects
| id | name | scope | spec |
|---|---|---|---|
| G1 | Direction layer | tables for purpose, identities, missions (+ identities, criteria), paths, protocols; `tasks.mission_id/protocol_id`, `projects.mission_id`; `switch_path`; `/scheduler/directive`; pickers; breadcrumb; Growth/Maintenance label; terminology | `2026-09-30-direction-layer-g1-design.md` |
| G2 | Habits | `habits`, `habit_checks`, check or focus-minutes rule, `DAILY QUESTS` on the today screen, `SYSTEM QUEST` relabel, habit XP within the daily caps | to write |
| G3 | Evidence & status | mission progress, alignment, identity evidence, weekly STATUS (active mission, selected path, this week) on the progress page | to write |
| G4 | Strategy review | `diagnosis-v1`, SYSTEM QUESTION with choices, F2 input/prompt extension, template fallback | to write |

## 1. Domain model

```
purposes (one active)
identities ──N:M── missions ──1:N── mission_criteria
                      │ 1:N
                    paths (active | retired; one active per mission)
                      │ 1:N
                   protocols
                      │ 0..1:N
                    habits ──1:N── habit_checks            (G2)
projects.mission_id  → missions   (nullable)
tasks.mission_id, tasks.protocol_id                        (nullable)
```

- **Effective mission** of a task = `protocol.mission_id ?? task.mission_id ?? project.mission_id`. The composite FK
  `(protocol_id, mission_id)` makes the first two agree; the service rejects a task whose mission differs from its
  project's mission.
- **Growth** = the task has an effective mission. Derived, never stored. Exposed as `effective_mission_id` on
  `task_plan_actual`.
- Code and DB use the domain names (purpose, identity, mission, path, protocol, habit). `mission` and `path` are used
  instead of `goal`/`strategy` in code too, because `goal` is ambiguous next to quest objectives and the UI says
  MISSION/PATH; this is recorded in ADR 0020.
- Deletion is archival by default (`archived`, `dropped`, `retired`). A mission with tasks or projects cannot be
  hard-deleted (NO ACTION FKs, like projects).

## 2. UI vocabulary
Extends `termsFor()` / `useTerms()`. Quest terminology on → left column; off → right column.

| Domain | Quest terms | Plain terms |
|---|---|---|
| Purpose | SYSTEM DIRECTIVE | 목적 |
| Identity | CLASS / IDENTITY | 정체성 |
| Goal (mission) | MISSION | 목표 |
| Strategy (path) | PATH | 전략 |
| Tactic (protocol) | PROTOCOL | 실행 방식 |
| Habit | DAILY QUEST | 습관 |
| Existing metric quests (E2) | SYSTEM QUEST | 오늘의 목표 |
| Growth / Maintenance | GROWTH / MAINTENANCE | 성장 / 유지 |

The direction layer works with gamification off; only the labels change.

## 3. Screens
- **`/scheduler/directive` (G1):** directive and identities on top; mission list on the left; selected mission
  (`?mission=`) on the right with criteria, selected path, retired-path history, protocols, linked projects (and
  habits from G2).
- **Task drawer (G1):** mission/protocol picker; breadcrumb `Mission › Path › Protocol › task` or `MAINTENANCE`.
- **Projects (G1):** mission picker and breadcrumb.
- **Today (G2):** `DAILY QUESTS` (habits) and `SYSTEM QUEST`; no hierarchy shown daily.
- **Progress (G3/G4):** `ACTIVE MISSION`, `SELECTED PATH`, `THIS WEEK`, and the `SYSTEM ANALYSIS` diagnosis card.

## 4. Metrics and diagnosis (deterministic, versioned)

**Mission progress (`mission-progress-v1`, G3)**
- With criteria: mean over criteria of `check ? (met ? 1 : 0) : min(current / target, 1)`.
- Else, with linked projects: Σ estimated minutes of completed tasks ÷ Σ estimated minutes of non-cancelled tasks.
- Else: no bar; show accumulated mission time.
- Pace gap (deadline set) = elapsed share of [created, deadline] − progress.

**Alignment (`alignment-v1`, G3, local week in `profiles.timezone`)**
- Over focused minutes of sessions finished in the week (actual v2, ADR 0011).
- `aligned` = minutes on tasks with an effective mission. `on-path` = aligned minutes whose task has no protocol, or
  whose protocol's path is currently active. `off-path` = aligned − on-path.
- Shown as `Mission-aligned 11h 05m / Active 14h 20m`; the ratio only in a tooltip. Hidden below 3 h of activity.

**Identity evidence (`identity-evidence-v1`, G3)**
- Per identity, last 28 days: growth sessions of linked missions, and habit checks / scheduled habit days (after G2).
- Positive template sentence only at ≥ 0.6 completion; otherwise numbers only.

**Layer diagnosis (`diagnosis-v1`, G4, per active mission, last 28 days)**
| layer | signal (initial thresholds) |
|---|---|
| Goal | pace gap ≥ 0.25 and no lower-layer signal |
| Strategy | habit/protocol completion ≥ 70% but mission progress unchanged for 4 weeks |
| Tactic | median actual session < 0.6 × `intended_minutes`, or habit completion < 50% |
| Planning | missed + skipped ≥ 40% of mission blocks, or overloaded days (D3 capacity rule) |
| Execution | ≥ 30% of mission work logs with a confirmed blocker, or high stop-early ratio |
| Recovery | existing Recovery stat |

- Output: all signals with their evidence numbers, plus the **lowest** firing layer as the suspected layer
  ("check the lower layer before blaming the upper one").
- Each layer has a SYSTEM QUESTION and choices that only navigate or open an editor (e.g. Tactic →
  [Protocol 시간 줄이기] [유지]). Nothing is applied automatically.
- Fewer than 5 relevant sessions → "데이터 수집 중 n/5".
- The diagnosis is added to the F2 `system_insights` input; the AI phrases it; with AI off a template sentence is used.
  The F2 evidence check still applies.

**XP:** no XP for editing the hierarchy. Habit XP is defined in G2 within the existing daily caps. Achieving a
mission may unlock one achievement (G3).

## 5. Impact on existing features
| area | change | when |
|---|---|---|
| `tasks` | `mission_id`, `protocol_id` (nullable); existing tasks start as Maintenance | G1 |
| `projects` | `mission_id` (nullable) | G1 |
| `task_plan_actual` | `effective_mission_id`, `protocol_id` | G1 |
| E2 quests | unchanged tables; label `SYSTEM QUEST` | G2 |
| D2 stats | unchanged; alignment is a system metric, not a stat | — |
| F2 analysis | input builder gains the mission/path/diagnosis block; `prompt_version` bump | G4 |
| F1 classification | no mission proposals in this scope (later candidate) | — |
| E2E cleanup | `[e2e]`-prefixed direction rows | G1 |

## 6. Migration strategy
Additive only. New columns start null; there is no backfill and no contract step. Each sub-project has its own
migration and SQL tests (`begin … rollback`), applied through the Supabase MCP workflow in `AGENTS.md`.

## 7. Risks
- **Hierarchy fatigue:** nothing is required; empty states never block existing flows; the daily screen hides the
  hierarchy.
- **Path switch:** tasks keep pointing at protocols of retired paths. That is history, and it drives off-path time.
- **Dropped mission:** linked open tasks stay; the breadcrumb shows `(DROPPED)`; time stays aligned for the weeks it
  was spent.
- **Judgmental wording:** all SYSTEM sentences come from one template dictionary, and a unit test rejects a deny-list
  of words (부족, 실패, 게으, …).
- **IP:** generic words only (SYSTEM, MISSION, PATH, PROTOCOL); no names, art or fonts from Solo Leveling.

## 8. Test strategy
- Pure functions (`missionProgress`, `alignment`, `identityEvidence`, `diagnose`) tested with the requirement doc's
  examples (e.g. 60-minute protocol vs 22-minute actual → Tactic) and golden fixtures per version.
- SQL: RLS per table, cross-user FK rejection, one active purpose/path, `switch_path` atomicity.
- Services: mission mismatch, foreign IDs, edits to retired paths rejected.
- E2E: one main flow per sub-project; all existing suites keep passing.
