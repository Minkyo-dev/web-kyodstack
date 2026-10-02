# 0040 — Assistant P2: one proposal inbox and weekly coaching

- Status: accepted
- Date: 2026-10-02
- Spec: docs/superpowers/specs/2026-10-02-assistant-p2-proposals-coaching-design.md

## Context
P2 of the assistant (umbrella spec) needs two things: a single auditable channel for every change the assistant
suggests, and a weekly "one 1% change" grounded in data. `diagnosis-v1` (ADR 0023) already finds the weak layer,
but its choices only navigate.

## Decisions
1. **`assistant_proposals` is the channel.** Each row has a kind, a target, a payload, evidence, a status
   (proposed / applied / dismissed) and a rules version. The owner can update only `status` and `decided_at`, and
   only on their own rows. Payload and evidence are written once.
2. **Applying calls the existing services.** `rule_minutes` uses `updateProtocol` and `updateHabit`. `habit_days`
   uses `updateHabit`. All of their validation and ownership checks apply. The applier first checks that the target
   still has the values the proposal was made from. Otherwise it refuses and closes the proposal.
3. **Not one transaction** for `rule_minutes`: the protocol is updated first, then each linked habit. A failure
   part-way leaves the protocol changed and the proposal open. Applying again is idempotent, because the freshness
   check accepts the target values as well.
4. **`coach-v1` is deterministic.** Its thresholds are the diagnosis tactic thresholds (60% of the intended minutes,
   ≥ 3 sessions) and habit completion < 50% over ≥ 8 due days. Minutes round to 5. The focus is the first of: a
   concrete minutes fix, then a weekday fix, then a review of the lowest diagnosis layer. At most 3 per week.
   P2 makes no LLM call.
5. **Generated lazily for the current week** on the 주간 회고 page, at most once per week (unique per kind and
   target, one focus per week). Nothing is backfilled. When a week ends its open proposals read as expired; there is
   no job.
6. A dismissed `kind + target` is not proposed again for 28 days.
7. **Existing AI suggestion flows are unchanged for now.** Task recommendations (`ai_recommendations`) and
   classification (`task_features`) keep their own tables. Moving them into this inbox is a later step, recorded in
   the umbrella spec.

## Consequences
- The coaching suggestions are only as good as the timer and habit data. With less than 28 days of use, usually
  only `review` items or nothing at all appear.
- `rules_version` lets later `coach-v2` rules coexist with stored v1 proposals.
