# 단어장 V4 — AI budget pools, AI auto-fill, bulk add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:**
- **Budget pools.** `callAi` gets pools: `vocab.*` kinds have 60 calls per local day, everything else keeps 30
  (amends ADR 0018).
- **[AI 채우기]** in the add and edit forms proposes meaning, part of speech, IPA, example, synonyms and level. It
  fills only empty fields; the user still saves.
- **`/english/words/bulk`:**
  - paste up to 200 lines → a preview grid (duplicates flagged and unchecked);
  - [AI로 빈 칸 채우기] fills the empty meanings, 20 per call;
  - [N개 추가] writes the rows through to Notion one by one, with progress and a per-row error.
- **Throttle.** The Notion gateway gets an in-process per-token throttle (≥ 334 ms between requests), the one
  deferred from V1.

**Spec:** §9.1, §9.2. **Tech:** existing `callAi`, `AiProvider` (Gemini), the fake provider.

## Global Constraints
- AI output is Zod-validated and only *suggests* form values. Nothing reaches Notion without the user's [저장] or
  [N개 추가].
- Terms go into the prompt through `sanitizeForPrompt`, as JSON.
- Prompt version `vocab-enrich-v1`. The call kind is `vocab.word.enrich`.

## Review Focus
1. **The model returns a term that wasn't asked for, or misses some.** Expected: unknown terms are dropped, missing
   ones stay empty, and if none match the result is `AI_OUTPUT_INVALID`. Test: `matchEnrichment`.
2. **The vocab pool is exhausted while the default pool isn't** (or the other way round). Expected: each refuses
   only its own kinds. Test: `poolOf` plus the pool-filtered count query (code review).
3. **A pasted line with no separator, a `:` inside the meaning, a tab, an empty line, 250 lines.** Expected: a term
   with no meaning; only the first separator splits; empty lines are skipped; the excess is reported. Test:
   `parseBulk`.
4. **A paste with the same word twice, or a word already in the list.** Expected: flagged and unchecked by default;
   the server refuses it anyway. Test: `parseBulk` plus duplicate flags.
5. **Many fast writes from bulk add.** Expected: a ≥ 334 ms spacing per token; the SDK still retries a 429. Test:
   `createThrottle`.

---

### Task 1: Budget pools
- `budget.service`: `AI_POOL_CAPS`, `poolOf(kind)`, `aiCallsToday(ctx, now, pool)`. `callAi` checks the pool of its
  kind, with a pool-specific message for vocab.
- Test `tests/unit/ai-budget-pools.test.ts` (`poolOf`, caps).

### Task 2: Enrichment (prompt, schema, guard, service, action, fake)
- `features/ai/prompts/vocab-enrich.prompt.ts`, `features/ai/schemas/vocab-enrich.schema.ts`.
- `vocab/domain/enrich.ts` `matchEnrichment(terms, items)` → suggestions by normalized term.
- `vocab/services/enrich.service.ts` `enrichTerms(ctx, terms)`, and the action `enrichWordsAction({ terms })`.
- The fake provider gets the `vocab_enrich` canned output.
- Tests: `tests/unit/vocab-enrich.test.ts` (the guard; the schema accepts the fake output).

### Task 3: Bulk parse + throttle (pure)
- `vocab/domain/bulk-parse.ts`: `parseBulk(text, existingTerms) → { rows: BulkRow[]; overflow: number }`.
- `lib/notion/throttle.ts`: `createThrottle(intervalMs, clock)`, wired into `ClientNotionGateway.run`.
- Tests.

### Task 4: UI
- `WordForm` gets an optional `aiFill` that fills only the empty inputs. `QuickAdd` and the drawer pass it.
- `/english/words/bulk` page with the `BulkAdd` client component, and the [일괄 추가] link on the words page.

### Task 5: E2E and docs
- `vocab-bulk.spec.ts` (fake Notion + `AI_PROVIDER=fake`):
  1. Paste 3 lines, one of them a duplicate.
  2. AI fills the empty meaning.
  3. Add 2.
  4. The table shows them; the AI fill in the add dialog fills the meaning.
- Playwright's webServer env gets `AI_PROVIDER: "fake"`. Docs and ADR notes.
