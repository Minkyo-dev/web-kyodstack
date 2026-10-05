# 단어장 V5 — AI translation practice (CEFR A1–C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The user picks a word set and a CEFR level. The AI writes one Korean sentence per word, at that level,
that needs the word in English. The user translates; per attempt (max 3 per item) the AI returns:
- a verdict;
- whether the target word was used correctly;
- corrections with Korean explanations;
- a minimally corrected sentence;
- a natural native version;
- 1–3 alternatives with register and Korean nuance notes.

The UI shows a word-level diff (computed in TS) between the answer and the corrected sentence. Sessions are saved;
history is browsable. The review summary links "틀린 단어로 AI 연습".

**Architecture:**
- **Tables:** `vocab_practice_sessions`, `vocab_practice_items`, `vocab_practice_attempts` (own-row RLS). A session
  and its items are created atomically by the `vocab_create_practice` RPC.
- **AI:** prompts and schemas live in `features/vocab/ai/practice.*`. Words go to the model as short refs
  (`w1`, `w2`, …) that code maps back to ids, so no UUIDs are echoed. Both calls are budgeted (`vocab.practice.*`
  → vocab pool).
- **Code decides, AI words:**
  - The word pick is done by code: hard words by lapses, otherwise random.
  - The level rubric is a constant.
  - Validation is strict: every word appears, no unknown refs, Hangul present, and two targets only from B2 up.
  - The diff is LCS over tokens.
  - Practice never changes FSRS.

**Spec:** §9.3.

## Global Constraints
- User answers go into prompts only as `sanitizeForPrompt(answer, 500)` inside JSON. Feedback is Zod-validated and
  stored as advice; nothing reaches Notion.
- Prompt versions `vocab-practice-gen-v1` and `vocab-practice-feedback-v1`.
- The level labels in the UI come from the same `CEFR_RUBRIC` the prompt uses.

## Review Focus
1. **The model skips a word, invents a ref, or returns English-only "Korean".** Expected: `AI_OUTPUT_INVALID`,
   nothing saved. Test: `validateGenerated`.
2. **A fourth attempt on one item, or an attempt on another user's item.** Expected: refused (validation /
   NOT_FOUND via RLS). Test: SQL + service limit.
3. **An answer with quotes, newlines, or "ignore previous instructions".** Expected: sanitized, inside JSON. The
   feedback schema still applies. Test: prompt builder.
4. **The diff: punctuation, case, and a reordered sentence.** Expected: token-level LCS with stable output, and
   case-only changes shown as a change. Test: `wordDiff`.
5. **A set builder source with fewer than 5 candidates** (e.g. 2 hard words). Expected: the session uses what
   exists (≥ 1). With 0, the button is disabled and a hint is shown. Test: `pickPracticeWords`.

---

### Task 1: DB (`vocab_practice`)
- The tables as spec §7.1, plus `status` on items is unnecessary (attempts tell).
- RPC `vocab_create_practice(p_user_id, p_cefr, p_source, p_source_ref, p_word_ids uuid[], p_prompt_version,
  p_model, p_items jsonb) returns uuid`.
- Attempts check `answer` 1–500 chars and that `feedback` is an object. A trigger refuses a 4th attempt per item.
- SQL test `vocab_practice.sql`.

### Task 2: Pure domain
- `domain/cefr.ts`: `CEFR_RUBRIC: Record<Cefr, { label: string; rule: string }>`.
- `domain/practice.ts`:
  - `pickPracticeWords(candidates, { source, size, random })`;
  - `refsFor(words)`;
  - `validateGenerated(refs, items, level)`;
  - `MAX_ATTEMPTS = 3`.
- `domain/word-diff.ts`: `wordDiff(a, b) → { type: "same" | "del" | "add"; text }[]`.
- `ai/practice.{schema,prompt}.ts`.
- Tests.

### Task 3: Services and actions
- `practice.service`: `practiceCandidates`, `createPracticeSession`, `loadPracticeSession`, `submitAttempt`,
  `listPracticeSessions`.
- Actions `createPracticeAction` and `submitAnswerAction`.
- The fake provider gets canned outputs for `vocab_practice_generate` and `vocab_practice_feedback`.

### Task 4: UI
- `/english/practice` (set builder + history; `?words=` preselects a manual set).
- `/english/practice/[id]` (`PracticeSession`).
- The 연습 tab.
- The review summary link.

### Task 5: E2E and docs
- `vocab-practice.spec.ts` (fake Notion + fake AI):
  1. Words → practice at B2.
  2. Answer → feedback with a diff and alternatives.
  3. [다시 써보기] → a second attempt.
  4. History lists the session.
- Docs, ADR, progress.
