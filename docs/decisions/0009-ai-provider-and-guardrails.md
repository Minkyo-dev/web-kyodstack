# 0009. AI provider, contracts and guardrails
- Status: accepted
- Date: 2026-09-30

## Decision
- **Provider boundary:** the domain depends on `AiProvider.generateStructured()` (`features/ai/services/provider.ts`).
  The first implementation is `AnthropicProvider` (official `@anthropic-ai/sdk`, `client.beta.messages.parse` +
  `betaZodOutputFormat`). The default model is `claude-haiku-4-5-20251001` (override with `AI_MODEL`), chosen for cost and speed
  (changed from `claude-opus-5-5` on 2026-09-29). Haiku 4.5 supports neither `effort` nor the server-side refusal
  fallback, so both are sent only to newer models (effort `medium`, `fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`).
  `AI_PROVIDER=fake` gives deterministic canned output for local and offline work; it is refused in production.
- **Validation (spec §31):** SDK schema parse → our own Zod `safeParse` → refusal, `max_tokens` or null output fails
  with `AI_PROVIDER_ERROR` / `AI_OUTPUT_INVALID`, and nothing is persisted. API error messages are logged
  (they contain no secrets). Prompt content is never logged.
- **Statistics before AI (spec §3.5):** `computeWeeklyMetrics` (v1) and `remainingCapacityMinutes` are pure and
  unit-tested. The LLM receives their output.
- **Recommendation guardrails (spec §44, §64)** are applied deterministically after the model responds
  (`sanitizeRecommendations`): project/milestone ids must come from the input, duplicates of open tasks are dropped,
  estimates round up to 5 minutes, and the running total stays within capacity. Generation is skipped
  (no LLM call) when capacity < 15 min or no project is active.
- **Advisory only (spec §3.4, §34):** generation writes only `ai_recommendations` (pending) and `weekly_reviews`.
  A task is created solely by `accept_ai_recommendation()` (atomic insert + accept, `task_id` kept for traceability).
- **Idempotency (spec §47):** a weekly review is an upsert on `(user_id, week_start)`. A new daily run marks
  today's still-pending recommendations `expired` before inserting new ones.
- **Transport:** generation goes through Route Handlers (`/api/ai/weekly-review`, `/api/ai/daily-recommendations`).
  Accept and reject are Server Actions.
- **Tests:** E2E flow 5 seeds a recommendation (deterministic, no LLM cost). Real generation is exercised by a
  manual smoke run.

## Consequences
Switching vendors means adding a provider under `features/ai/providers/`. Every generated row records
provider, model and prompt version (`WEEKLY_REVIEW_PROMPT_VERSION`, `PROJECT_PLANNER_PROMPT_VERSION`).
