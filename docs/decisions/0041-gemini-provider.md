# 0041 — Gemini (Google AI Studio) is the default AI provider

- Status: accepted
- Date: 2026-10-02
- Amends: ADR 0009 (the provider is still behind `AiProvider`; only the default changes)

## Context
The owner asked to run every generative AI feature on Google AI Studio's Gemini Flash instead of Anthropic, and put
the key in `GEMINI_API_KEY`. That covers the weekly review, recommendations, classification, work-log
interpretation, the SYSTEM analysis, the quest picker and the brief coach line. The Anthropic account had also run
out of credit, so every AI call was failing.

## Decisions
1. **`GeminiProvider`** (`features/ai/providers/gemini.ts`) uses the official `@google/genai` SDK, pinned to
   2.27.0. Structured output uses `responseMimeType: application/json` and `responseJsonSchema`, generated from the
   same Zod schema with `z.toJSONSchema` (the `$schema` key is removed). The reply is parsed and validated with
   that Zod schema again (spec §31). A blocked prompt or a `SAFETY` / `PROHIBITED_CONTENT` finish maps to
   `AI_PROVIDER_ERROR`. `MAX_TOKENS`, an empty reply, invalid JSON or a schema mismatch maps to
   `AI_OUTPUT_INVALID`. Nothing is persisted in any of these cases.
2. **Effort** maps to the thinking level: low → LOW, medium → MEDIUM, high → HIGH.
3. **Models:**
   - The default is `gemini-3.8-flash`, the newest stable Flash available to this key on 2026-10-02.
   - On a 429 (quota) or 503 (overload) after the SDK's own retries (3 attempts, 2–10 s backoff), the call is
     tried once on `gemini-3.5-flash-lite`. That model has its own per-model quota, and its availability was
     checked on the same date. `gemini-2.5-flash` returns 404 "no longer available to new users".
   - Both models can be changed with `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL`.
4. **Selection:** `AI_PROVIDER` defaults to `gemini`. `anthropic` stays available (`AI_API_KEY`, `AI_MODEL`), and
   `fake` still serves tests and is refused in production.
5. **Budget and ledger are unchanged.** `callAi` keeps the 30-calls-per-day cap and records the serving model in
   `ai_calls.model`.

## Consequences
- **Free-tier limits.** A free key allowed 5 requests per minute on `gemini-3.8-flash` when tested on 2026-10-02.
  Bursts, such as the nightly job for one user plus page loads, can hit 429. The fallback model and the daily cap
  soften this, and any AI part already fails without breaking its page.
- **Deployment.** `GEMINI_API_KEY` must be set in the deployment environment (Vercel project env) for production
  AI.
- Every AI output schema was checked live against `gemini-3.8-flash` with this provider on 2026-10-02.
