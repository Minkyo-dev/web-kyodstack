# 0006. Clamp auto-sized blocks to the focus-block limits
- Status: accepted
- Date: 2026-09-29

## Context
Spec §27 sizes a dropped block from the recommended duration, rounded to the slot increment.
`scheduler_settings` also defines `min_block_minutes` and `max_focus_block_minutes`, but the spec
doesn't say how they interact with auto-sizing.

## Decision
`recommendBlockMinutes` rounds up to `slot_minutes`, then clamps to
`[min_block_minutes, max_focus_block_minutes]`. A task estimated beyond the focus limit gets a
max-length block, and the user adds more blocks. This matches spec §3.1 (Task 1:N ScheduleBlock).
An explicit range (click-drag or manual end time) is never clamped.

## Consequences
`tasks.recommended_minutes` stores the clamped block length. Phase 3 learning uses actual session
minutes per task, not block lengths, so the clamp doesn't bias the estimator.
