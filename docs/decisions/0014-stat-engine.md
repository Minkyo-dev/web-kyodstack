# 0014. Stat engine: live stats, nightly snapshots, commitment rules
- Status: accepted
- Date: 2026-09-30

## Context
Requirements (improve-requirements-2 §21–§34) ask for four measurable behavior stats (Calibration, Reliability,
Consistency, Recovery) with no fake precision, computed deterministically and never by the LLM.

## Decision
- **Engine:** pure TS `computeStats(input)` (`features/analytics/utils/stats.ts`) over raw rows loaded by
  `loadStatInput`. Every query filters `user_id`, so the same loader runs under the service role.
- **Timing:** the progress page computes live on every request. The existing nightly `duration_profile_refresh`
  job also upserts one `stat_snapshots` row per stat (plus per-type Calibration) per local day. No new cron.
  Snapshots are written only by the service role; users can read their own.
- **Commitment (Reliability):** a slot is committed when its start was set at least `commit_lead_minutes` before
  it. "Set" means the creation, or the latest revision that changed `starts_at` (`moved`, or `resized` with a new
  start). A length-only resize never counts as a reschedule.
- **Resolution:**
  - A start change resolves the previous committed slot: proactive 0.85, late 0.5.
  - The final committed slot resolves by the first matching session: on time 1, ≤ 15 min late 0.9,
    ≤ 30 min late 0.75, later within the block 0.5.
  - With no session: completed-without-session 1, early skip/cancel 0.85, late skip/cancel or missed 0.
- **Recovery:** events are final commitments scored 0. Unresolved events younger than 14 days are excluded.
- **Consistency:** counts planned work days from the first activity (none → no days) through yesterday.
- **Formula version** `stats-v1` is stored on every snapshot, and trend lines break across versions.

## Consequences
- Stats are always current, at the cost of reading up to 56 days of raw rows per page view (personal scale).
- The confirmed-external-blocker weight (0.3) waits for F.
