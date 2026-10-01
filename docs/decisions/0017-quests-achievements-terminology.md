# 0017. Quests, achievements, titles and quest terminology
- Status: accepted
- Date: 2026-09-30

## Context
Requirements 2 (§4, §51, §53–57, §60) and the umbrella design (§10) add rule-generated quests, achievements, titles and
an optional quest vocabulary. E2 (`docs/superpowers/specs/2026-09-30-quests-achievements-design.md`) builds them on
E1's ledger, `evaluateProgress` and notifier.

## Decision
- **Quests** (`quest-v1`, code constants): a daily quest ("모멘텀 쌓기", +50, three objectives from a candidate pool with
  fallbacks, one swap per day), a weekly quest ("모멘텀 유지", +300) and a recovery quest ("다시 시작", +40, after two
  quiet planned work days, at most once per 7 days). Expiry has no penalty. Objective values are recomputed from facts
  (idempotent); a completed objective keeps `completed_at`; a quest without objectives never clears.
- **Generation** is lazy on scheduler page load plus the nightly job; none are backfilled. `create_quest` inserts a quest
  and its objectives in one transaction and is a no-op when that type already exists for the period (two tabs → one
  quest). `swap_quest_objective` enforces the one-swap rule in the database.
- **Quest XP** uses the ledger rule `quest` (source = quest id); the per-event limit is per rule (`quest` ≤ 300, others
  ≤ 120).
- **Achievements** (`ach-v1`, code constants) give no XP and are never re-locked by the app; titles unlock with them and
  one can be equipped (a trigger rejects a title that is not unlocked). The enable backfill evaluates achievements once
  and reports a count in its toast.
- **Terminology** is a label layer (`src/lib/terms.ts`, `TermsProvider`, `useTerms`, `josa`) over every visible label in
  the private area, active only while gamification is on. Public pages, AI prompts, `AppError` messages, `metadata`
  titles and quest objects keep their names.
- **Dependency direction:** the scheduler page composes `<QuestPanel>` and passes it as a slot; scheduler, projects and
  analytics code import only `src/lib/terms` / `src/hooks/use-terms`, never `features/gamification`.
- **Own delete** on `quests`, `user_achievements` and `user_titles` exists only so E2E cleanup (which runs on the owner
  account) can remove what a test created — the same stance as `xp_events` in ADR 0016.
- AI quest candidates wait for F.

## Consequences
- Quest rows appear only from the day gamification is on.
- Changing objective rules or the achievement catalog needs a new version constant; stored quests keep their own rules.
