# 0022 — Direction status: mission progress, alignment, identity evidence

- Status: accepted
- Date: 2026-10-01
- Spec: docs/superpowers/specs/2026-10-01-evidence-status-g3-design.md

## Context
improve-requirements-3 §28–30 and §32: the weekly status shows the active mission, the selected path and this week's
work, and judges by evidence. Alignment is a system metric, not a stat.

## Decisions
1. **`mission-progress-v1`:** criteria mean (`check` met = 1, numeric = min(current/target, 1)); else the mission
   projects' completed / non-cancelled task count — the same ratio the projects page shows (the umbrella proposed
   estimated minutes; task count keeps the two bars consistent); else no bar, only the last 28 days' focus time.
2. **Pace:** elapsed share of [created day, deadline] − progress; a neutral sentence at ≥ 0.25.
3. **`alignment-v1`:** focused minutes (pauses excluded) of sessions that ended this local week (Mon–Sun);
   aligned = effective mission set; off-path = aligned on a protocol whose path is retired. Hours first, ratio only
   as a tooltip; hidden below 3 h.
4. **Weekly completion:** tasks with a non-cancelled block this week, completed / all. **Habit consistency:**
   checks / scheduled habit-days from Monday to today, never before a habit's creation day.
5. **`identity-evidence-v1`:** last 28 days, per active identity: sessions on its missions and its missions' habit
   checks / scheduled days; a positive sentence only at ≥ 60% with ≥ 5 scheduled days.
6. **Wording:** all sentences in `domain/status-text.ts`; a unit test rejects a deny-list of judgmental words.
7. **Deferred:** a mission-achieved achievement (changes the `ach-v1` catalog).

## Consequences
- No tables, no snapshots: the numbers are computed on page load from existing rows.
- Changing a formula needs a new version constant in `domain/status.ts`.
