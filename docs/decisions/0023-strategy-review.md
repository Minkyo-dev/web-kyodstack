# 0023 — Strategy review: layer diagnosis and SYSTEM QUESTION

- Status: accepted
- Date: 2026-10-01
- Spec: docs/superpowers/specs/2026-10-01-strategy-review-g4-design.md

## Context
improve-requirements-3 §24–27 and §34: when a goal stalls, the SYSTEM must separate strategy from execution, check the
layers in order, and ask questions instead of judging. The umbrella fixed `diagnosis-v1` and that AI only phrases it.

## Decisions
1. **`diagnosis-v1`** (pure, 28 local days, per active mission): goal (pace gap ≥ 0.25), strategy (habit completion
   ≥ 70% and progress not rising), tactic (median protocol session < 60% of `intended_minutes` with ≥ 3 sessions, or
   habit completion < 50%), planning (≥ 5 blocks, missed + skipped ≥ 40%), execution (≥ 5 logs, confirmed blockers
   ≥ 30%), recovery (Recovery stat < 50). Habit rules need ≥ 5 scheduled days. Below 5 mission sessions: collecting.
2. **Suspected layer = the lowest firing layer** (closest to execution), so an upper layer is never blamed while a
   lower one shows a problem.
3. **Progress 28 days ago** uses `met_at` / `completed_at` before the window; numeric partial values from then are
   unknown and count 0 (conservative).
4. **Choices only navigate** (directive page or scheduler). [유지] hides the question per mission/layer for the local
   week in the browser (localStorage); nothing is stored or changed server-side.
5. **AI:** the F2 input gains a numbers-only `direction` block; `analysis-v2` may return `directionNote`, which the
   F2 evidence check drops if it cites unknown numbers. Template observations on mission cards work without AI.

## Consequences
- Purpose-layer problems are not diagnosed (no signal); the directive page remains the place to revisit them.
- Threshold changes need `diagnosis-v2`.
