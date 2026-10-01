# 0019. Weekly SYSTEM analysis and AI-picked daily quests
- Status: accepted
- Date: 2026-09-30

## Context
Requirements 2 (§48–50, §52): "Algorithm calculates, AI explains", a qualitative assessment kept apart from the
numeric stats, and AI quest candidates validated by rules. F2
(`docs/superpowers/specs/2026-09-30-system-analysis-ai-quests-design.md`) builds them on F1's budget and provenance.

## Decision
- **Analysis time is the user's choice** (`scheduler_settings.insight_weekday`/`insight_hour`, local). It starts **off**
  for everyone (a later migration nulls the weekday) so no AI call happens until the user picks a time.
- **Delivery is lazy:** Vercel crons run daily, so the analysis is generated on the first progress-page visit after
  the slot, with the nightly job as catch-up. [다시 분석] at most once per local day. All calls go through `callAi`.
- **Numbers only from the input:** the analysis prompt gets computed numbers (stats now / ~7 / ~28 days ago from
  snapshots, Calibration bias/error, blockers, patterns), no notes or titles. Every number in an explanation must exist
  in the input (percent/fraction forms accepted); otherwise the explanation is dropped. Assessment lines may not
  contain digits.
- **AI quests pick, rules decide:** the AI chooses 3 keys from the rule-built pool (E2 candidates + most important
  task + weak domain). A pure validator checks membership, distinct metrics, the top-task/planned-tasks conflict and
  capacity; any failure → the E2 rule quest. Only the nightly job uses the AI picker; pages never wait on it.
  `quests.generated_by = 'ai'` and `reason` show a "SYSTEM 추천" line. Weekly/recovery quests stay rule-based.
- **Dependency direction:** gamification never imports AI — `ensureQuests` accepts a plain-data `picker`, which the
  jobs layer supplies.
- **E2E** seeds the analysis and an AI quest (no LLM). `system_insights` has an own-delete policy for that cleanup
  (same stance as ADR 0016); the test deletes the seeded row by id because the local clock can lead the DB clock.

## Consequences
- An analysis may arrive later than the chosen hour (first visit or the nightly run).
- Changing the analysis prompt or input requires a new `analysis-v*` version; stored analyses keep their content.
