# 0008. Recommended durations round up to 5 minutes, not the slot size
- Status: accepted (partly supersedes the rounding in 0006; the clamp stays)
- Date: 2026-09-30

## Context
Spec §12 says to round to the slot increment (15) but also "normally round upward to the nearest 5 or 15".
The §27 and §69 acceptance examples require 60 × 1.33 → **80** minutes (10:00–11:20), which
15-minute rounding cannot produce (it would give 90).

## Decision
`recommendBlockMinutes` rounds up to 5 minutes (after trimming float noise to 2 decimals), then clamps to
`[min_block_minutes, max_focus_block_minutes]`. Dragging and resizing still snap to `slot_minutes`.

## Consequences
An auto-sized block may end off-grid (e.g. 11:20 on a 15-minute grid). That is intended: the block
reflects the personal estimate, and the user can snap it by resizing.
