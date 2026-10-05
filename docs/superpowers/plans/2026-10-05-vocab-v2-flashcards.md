# 단어장 V2 — FSRS flashcards, review screen, Notion write-back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A RemNote-style review session over the word cards. Each word has a recognition and a recall card.
- **Scheduling:** FSRS via `ts-fsrs` 5.4.2 (pinned).
- **Review screen:** keyboard-first, with Space, 1–4, E, D, Z, P and Esc. It shows interval previews on the
  buttons, uses TTS, supports undo, and lets the user mark a word 학습 완료.
- **Notion write-back:** `상태` and `다음 복습` are written back through a coalescing outbox. Choosing 학습 완료 in
  Notion suspends the word in the app.
- **Home:** a today card (reviews and new cards) plus topic cards with their due counts and [학습].
- **Words list:** gets the derived status and the next review date.
- **Settings:** gets a study section (daily limits, card directions, target retention).

**Architecture:**
- `domain/srs.ts` is the only importer of `ts-fsrs`.
- `domain/queue.ts` and `domain/status.ts` are pure.
- Two security-invoker RPCs apply and undo a review atomically. `vocab_apply_review` takes an optimistic `reps`
  check and an idempotent `client_review_id`.
- `vocab_upsert_words` is replaced. It now also stores `notion_next_review` and applies the `상태` transitions of
  spec §6.3 inside the same transaction.
- The outbox stores the desired `{status, nextReview}` per word. It is flushed after a session, on page entry and
  nightly.

**Spec:** §6.3, §6.4, §7.1–§7.5, §10. **Tech:** as V1, plus `ts-fsrs` 5.4.2.

**Refinements (to ADR 0046):**
1. The review conflict uses the existing `CONFLICT` code with its own message, instead of a new
   `VOCAB_REVIEW_CONFLICT`. The RPC raises SQLSTATE `V0409` and the service maps it.
2. **Suspend/unsuspend** is a single UPDATE on `vocab_cards` (atomic by itself), not an RPC.
3. **`vocab_words.notion_next_review`** stores the last value seen in or written to Notion, so the outbox skips
   no-op writes. The flush updates `notion_status`/`notion_next_review` directly rather than re-upserting the page,
   so its own write never looks like a user's `상태` change.
4. The **[틀린 단어로 AI 연습]** link arrives with V5 (practice).

## Global Constraints
- Every `vocab` query filters `user_id` explicitly. RPCs are security invoker.
- "Today" comes from `profiles.timezone`, using `localDayRange`/`todayLocalDate` from `features/scheduler/utils/timezone`.
- Status is never shown by color alone. The rating buttons show text + interval + key.
- Shortcuts are ignored while focus is in an input or textarea.

## Review Focus
1. **The same rating is submitted twice** (double key press, retry after a network blip). Expected: one review row,
   one state change. Test: SQL `client_review_id` idempotency.
2. **Another tab reviewed the card first.** Expected: `CONFLICT`, a toast, and the card keeps the other tab's
   state. Test: SQL `reps` check.
3. **Both directions of a word are due today.** Expected: only one appears today; the sibling waits. Test:
   `buildQueue` sibling bury.
4. **The user marks a word 학습 완료 in Notion, or clears it there.** Expected: the cards are suspended, or due
   now; the app's own write-back never re-triggers this. Test: SQL transition cases.
5. **The local-midnight boundary in America/Toronto.** Expected: a card due 23:59 local counts as today, 00:01 as
   tomorrow. Test: `buildQueue` with `todayEnd` from `localDayRange`.

---

### Task 1: Database (`vocab_study`)
- **`vocab_reviews`:** `id`, `user_id`, `card_id`, `client_review_id`, `rating`, `reviewed_at`, `duration_ms`,
  `before`, `after`, `algo_version`. Constraints: `unique (user_id, client_review_id)`, an index on
  `(user_id, reviewed_at)`, and a composite FK to `vocab_cards` with cascade. Own-row select/delete only; inserts
  happen only through the RPC (the `insert`/`update` privileges are revoked).
- **`vocab_settings`:** `user_id` PK, `new_per_day` (20; 0–200), `reviews_per_day` (200; 1–1000),
  `desired_retention` (0.90; 0.70–0.97), `directions` (`{recognition,recall}`, a non-empty subset),
  `default_cefr` (B1), `reminder_enabled` (true), `reminder_time` (20:00), `updated_at`. Own-row CRUD.
- **`vocab_outbox`:** `id`, `user_id`, `word_id` (composite FK, cascade), `payload` jsonb (an object),
  `attempts`, `next_attempt_at`, `last_error_code`, `done_at`, `created_at`. A unique index on `(word_id)` where
  `done_at is null`. Own-row CRUD.
- **`vocab_words.notion_next_review date`.**
- **RPCs:**
  - **`vocab_apply_review(p_card_id, p_expected_reps, p_card jsonb, p_review jsonb) returns jsonb`.**
    - A duplicate `client_review_id` returns `{status:'duplicate'}`.
    - It locks the card. If the card is missing it raises P0002. If `reps` differs from `p_expected_reps` it
      raises V0409.
    - It updates the card's FSRS fields and inserts the review.
    - It returns `{status:'applied'}`.
  - **`vocab_undo_review(p_card_id) returns jsonb`.** It restores the latest review's `before` onto the card and
    deletes that review. P0002 if there is none.
  - **`vocab_enqueue_writeback(p_user_id, p_word_id, p_payload)`.** It upserts the pending row: replaces the
    payload, resets `attempts`, sets `next_attempt_at = now()`.
  - **`vocab_upsert_words` is replaced.** It adds `notion_next_review`. When the incoming `notion_status` differs
    from the stored one:
    - a change to `학습 완료` suspends the cards;
    - a change away from `학습 완료` unsuspends them with `due = now()`.

    On insert, an incoming `학습 완료` suspends the new cards.
- **SQL test `vocab_study.sql`:** apply; duplicate; conflict; undo; enqueue coalescing; the transitions; RLS on the
  new tables; users can't insert reviews directly.

### Task 2: Pure domain
- **`srs.ts`:**
  - `type CardState`, `toFsrsCard`, `fromFsrsCard`;
  - `applyRating(state, rating, now, { retention, fuzz })`;
  - `previewIntervals(state, now, opts) → Record<1|2|3|4, string>` (labels such as "10분", "1일", "3일", "2주",
    "3개월", "1년");
  - `ALGO_VERSION = "fsrs-6@ts-fsrs-5.4.2"`.
- **`queue.ts`:** `buildQueue({ cards, todayEnd, doneReviewsToday, newIntroducedToday, reviewedTodayWordIds,
  settings })`.
  - Filters out other directions and suspended cards.
  - Reviews are due ≤ `todayEnd`, by `due`, capped. New cards follow word creation order with recognition first,
    capped.
  - Sibling bury.
  - Interleaves 3 reviews : 1 new.
- **`status.ts`:**
  - `deriveStatus(cards)`;
  - `nextReviewDate(cards, timezone)` (a local yyyy-MM-dd, or null);
  - `isMature(cards)` (all active cards have `scheduled_days ≥ 21`);
  - `writebackFor(cards, timezone) → { status, nextReview }`.
- **`answer-match.ts`:** `normalizeAnswer`, `suggestRating(typed, term) → 1|2|3`, and `blankTerm(example, term)`.

### Task 3: Services and actions
- **`settings.service`:** `getStudySettings` (defaults when there's no row), `updateStudySettings`.
- **`review.service`:**
  - `loadQueue(ctx, scope)`: cards joined with live words, today's counts from `vocab_reviews` and the settings,
    passed through `buildQueue` → `ReviewItem[]` (card state + word fields).
  - `reviewCard`, `undoReview`, `setLearned`, `finishSession` (returns tomorrow's due count).
- **`outbox.service`:**
  - `enqueueWriteback(ctx, wordIds)` computes `writebackFor` and skips words where Notion already matches.
  - `flushOutbox(ctx, limit)` uses backoff (1 min doubling to a 1 h cap). A 10th failure keeps the row. A
    reauth error stops the loop.
- `word-mapping`: `pageToWordFields` also returns `notionNextReview`.
- `maybePull` also flushes the outbox. The nightly `reconcileAll` flushes everything.
- **Actions:** `reviewCardAction`, `undoReviewAction`, `setLearnedAction`, `finishSessionAction` (flush in
  `after()`), `updateStudySettingsAction`.

### Task 4: UI
- **`/english/review?scope=all|topic:<name>`:** the `ReviewSession` client component.
  - Progress, scope chip, [종료].
  - Front/back per direction; the typed answer for recall with a suggested rating.
  - Rating buttons with interval previews.
  - Shortcuts, TTS (Web Speech, hidden when unsupported), undo of the last rating, D = 학습 완료, E = edit dialog.
  - In-session requeue when the next `due` is ≤ 20 minutes away.
  - A summary at the end.
- **Home:** the today card (`복습 N · 새 단어 M`, [복습 시작]) and topic cards with due counts and [학습].
- **Words:** the status from cards, a 다음 복습 column, the drawer's [학습 완료로 표시]/[학습 완료 해제] and the
  "숙련" badge.
- **Settings:** a 학습 section form.
- `EnglishNav` gets 복습.

### Task 5: E2E and docs
- **`vocab-review.spec.ts`** (fake Notion). Seed through the UI: connect + 2 words.
  1. The review: Space → 3 → the next card → Z undo → 1 (again) → the session finishes.
  2. The DB has the reviews and the card states.
  3. 학습 완료 via D removes the word's cards from the queue, and the outbox flush sets `notion_status`.
- **Docs:** architecture, progress, ADR refinements, spec §14 note.
