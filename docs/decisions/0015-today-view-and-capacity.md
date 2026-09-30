# 0015. Today view, week summary and capacity notice
- Status: accepted
- Date: 2026-09-30

## Context
Improve-requirements §23 and D3 spec (`docs/superpowers/specs/2026-09-30-today-summary-capacity-design.md`) ask
for a Today view that answers "what now / what next", a quiet week summary, and a calm warning when a day is
planned well beyond what the user usually does.

## Decision
- **Today sections replace the flat list:** 지금 (running session, current and missed blocks) / 다음 / 이후 /
  미배정 / 오늘 완료. Pure `todaySections` (`features/scheduler/utils/today.ts`).
  - Tasks that only have blocks on other days are excluded from Today.
  - A task already shown as a today block row (including a missed one) or as the running session is not repeated
    in 미배정.
- **Capacity:** one shared `dailyCapacity` (`features/analytics/utils/capacity.ts`), the median focused minutes over
  the last 28 days' planned work days with focused ≥ `min_meaningful_minutes`, today excluded. The stat engine and
  the notice use the same function. Too little history → `null` → no notice.
- **Overload rule:** `planned > 1.3 × capacity` and `planned − capacity ≥ 60` minutes. Planned minutes count
  `planned`, `completed` and `missed` blocks clipped to the local day (skipped/cancelled are excluded). Checked for
  today, then tomorrow.
- **Adjusting is manual:** the notice offers [계획 조정] / [그대로 두기]. The dialog pre-selects future planned
  blocks in overflow order until planned ≤ capacity; nothing moves until the user confirms. Confirmed blocks move to
  the same local time the next day through the normal reschedule action (revision rows included). Dismissal is
  per day and per browser (localStorage).
- **Priority semantics:** 1 = most important (assumed; the schema does not say). Overflow order is lowest
  importance first (highest number), then the latest start.

## Consequences
- The notice never blocks planning and never appears on thin history.
- If priority is later defined the other way round, only `overflowSelection`'s sort flips.
- Dismissal does not sync across devices.
