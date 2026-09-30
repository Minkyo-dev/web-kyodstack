# 0016. XP ledger, level and opt-in backfill
- Status: accepted
- Date: 2026-09-30

## Context
Requirements 2 (§17–20, §35, §58–62) and the umbrella design (§10) add XP, a level that never drops, practice levels
and notifications on top of real work data. E1 (`docs/superpowers/specs/2026-09-30-xp-level-design.md`) builds the
ledger and feedback; quests, achievements and titles follow in E2.

## Decision
- **Opt-in.** Gamification is off until the user turns it on from the progress page (the requirements show it on by
  default). Enabling runs a full, idempotent evaluation from the first activity through today in 30-day windows,
  with no per-event notifications, then shows one toast with the starting level. Re-enabling re-runs it and fills
  the days missed while off. Turning it off keeps all data.
- **Ledger.** `xp_events` is unique per `(user, rule, source)` and carries `local_date` (the user's local day) so
  daily caps are a sum. Writes go through `award_xp(p_events, p_user_id default null)`, a `security invoker`
  function: authenticated callers always award to themselves, and the nightly job (service role) passes the user.
  Users may insert and delete their own rows but never update them. An after-statement trigger (definer, not
  callable) recomputes `player_profiles.total_xp/level`; users cannot write those columns.
- **Owner trust.** The server evaluates with the user's JWT, so the owner could technically write their own ledger.
  In a single-owner tool this protects against accidents, not against the owner. Own delete exists so E2E cleanup can
  remove XP from test sources; the level can then drop, but only through deliberate deletion.
- **Rules `xp-v1`.** Focus (timer only, ≥ 10 focused min, diminishing, 30/session, 120/day); completion (+20, task
  with ≥ 10 focused min, 5/day); commitment (+10 per *kept* committed block with score ≥ 0.75 — early skips and
  cancels score 0.85 in Reliability but earn no XP). Caps subtract what the day already holds, so deleting a source
  and re-evaluating never exceeds a cap.
- **Timing.** Core actions (stop, switch, complete task, block status) evaluate yesterday and today and return a
  `ProgressDelta` on `ActionResult`; failures are logged and return nothing. The nightly job re-evaluates the same
  two days to settle commitment XP.
- **Commitments** reuse D2's `commitments()`; practice levels are computed from D2's rolled-up domain minutes.
- **Quest terminology** is stored now and shown from E2.

## Consequences
- Core flows never depend on gamification; with it off, actions do one extra profile read.
- A formula change needs a new `XP_RULES_VERSION`; past ledger rows stay as earned.
