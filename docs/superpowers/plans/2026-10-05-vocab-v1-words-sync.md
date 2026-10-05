# 단어장 V1 — words (Notion write-through) and sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Words live in the user's Notion DB and in a Supabase mirror.
- The app creates, edits and deletes words through Notion first (write-through).
- Edits made in Notion come back by incremental pull: on page entry when stale, from [지금 동기화], and nightly.
- A nightly full reconcile also notices pages deleted in Notion.
- `/english/words` lists, filters, searches, adds and edits words. The home tab shows topic cards.

**Architecture:**
- `lib/notion` gains generic page methods with a typed `NotionValue` per property id.
- `features/vocab/domain/word-mapping.ts` translates pages to word fields and back, using the stored property ids.
- One security-invoker RPC, `vocab_upsert_words`, writes mirror rows and their two cards atomically. Both the
  write-through path and pulls use it.
- The services take an explicit `{ supabase, userId }`, so the nightly job can reuse them with the service role.

**Tech Stack:** as V0. **Spec:** `docs/superpowers/specs/2026-10-05-vocab-notion-design.md` §5.3, §6.1, §6.2, §6.5,
§7.1, §10 (단어), §11.

**Deliberate refinements of the spec:**
1. **The outbox moves to V2.** In V1 the app never changes `상태`/`다음 복습`, so the outbox would have no caller.
2. **The `상태` transitions** (§6.3: 학습 완료 in Notion suspends cards) move to V2 with the cards' behavior. V1 only
   mirrors `notion_status`.
3. **The in-process throttle moves to V4** (bulk add). Single writes rely on the SDK retries.
4. **Reconcile is a full pull** (all properties, every page), so it also repairs anything an incremental pull
   missed, and it marks mirror rows missing from Notion as deleted. Notion's query already excludes trashed pages,
   so incremental pulls never see deletions.
5. **Single add rejects a duplicate term** (case-insensitive) with `CONFLICT` "이미 있는 단어예요".

## Global Constraints
- Every query in `vocab` services filters `user_id` explicitly, so the same code runs under the service role in
  the job.
- Field limits (Zod and DB checks):
  - `term` 1–200 (trimmed), `meaning` ≤ 1000, `pos` ≤ 50, `ipa` ≤ 200, `example` ≤ 1000, `synonyms` ≤ 500,
    `note` ≤ 2000;
  - `topics` ≤ 10 names of 1–50 chars without commas;
  - `cefr` ∈ A1…C2 or null.
- Values pulled from Notion are clipped to these limits. An unknown CEFR value becomes null, and an over-long or
  comma-containing topic is clipped or dropped. A user's Notion content never makes a sync fail.
- Only changed properties are sent on update.
- The UI follows V0's rules: Korean labels, status as icon + text, radius ≤ 8px.

## Review Focus
1. **A word is edited in Notion within the same minute as the last pull** (`last_edited_time` is minute-rounded).
   Expected: the next pull still sees it, thanks to the 2-minute overlap. Test: Task 2 `pullSince`.
2. **A user's Notion page holds values the app would reject** (a 3000-char meaning, a topic with a comma, CEFR
   "B3", empty title). Expected: the sync stores clipped or normalized values; an empty title becomes
   "(제목 없음)". Test: Task 2 `pageToWordFields`.
3. **A word is deleted in the app but was already trashed in Notion.** Expected: the delete still succeeds locally.
   Test: Task 4 service treats NOT_FOUND from `trashPage` as done (covered by the E2E delete path plus a unit test
   of `isGoneError`).
4. **The pull fails midway** (a 429 after retries). Expected: `last_pulled_at` is not advanced, and the next pull
   re-reads the window. Test: Task 2 `pullSince` + service ordering (cursor stored only at the end).
5. **The search box gets `%` or `,` characters.** Expected: no PostgREST filter injection; they are matched
   literally. Test: Task 5 `escapeLike`.

---

### Task 1: Gateway page methods
**Files:** `src/lib/notion/types.ts`, `mapping.ts`, `client-gateway.ts`, `fake-gateway.ts`; test
`tests/unit/notion-pages.test.ts`.

**Produces:**
```ts
export type NotionValue =
  | { type: "title" | "rich_text"; text: string }
  | { type: "select" | "status"; name: string | null }
  | { type: "multi_select"; names: string[] }
  | { type: "date"; start: string | null }
  | { type: "other" };
export type NotionPage = { id: string; url: string; lastEditedTime: string; createdTime: string; inTrash: boolean; properties: Record<string, NotionValue> }; // keyed by property id
// NotionGateway +=
queryPages(auth, dataSourceId, opts: { editedOnOrAfter?: string; cursor?: string }): Promise<{ pages: NotionPage[]; nextCursor: string | null }>;
createPage(auth, dataSourceId, values: Record<string, NotionValue>): Promise<NotionPage>;
updatePage(auth, pageId, values: Record<string, NotionValue>): Promise<NotionPage>;
trashPage(auth, pageId): Promise<void>;
```
- mapping:
  - `toNotionPage(page)` reads each property by its `id`;
  - `toPropertyValues(values)` builds request bodies. Rich text is split into ≤ 2000-char text objects, and a null
    select becomes `null`.
- fake:
  - pages are stored per data source in `globalThis`;
  - `lastEditedTime` is rounded **down to the minute**, like Notion;
  - queries exclude trashed pages and page through results 100 at a time with a numeric cursor;
  - `fakeNotionPages()` is exposed for tests.

Tests:
- mapping round-trip for each type, including splitting at 2000 chars;
- `toNotionPage` on an SDK-shaped page;
- fake: create → query with `editedOnOrAfter` → update → trash disappears from the query; the cursor pages at
  100.

### Task 2: Word mapping and sync rules (pure)
**Files:** `src/features/vocab/domain/word-mapping.ts`, `src/features/vocab/domain/sync.ts`; tests
`tests/unit/vocab-word-mapping.test.ts`, `tests/unit/vocab-sync.test.ts`.

**Produces:**
- `type WordFields = { term; meaning; pos; ipa; example; synonyms; note; topics: string[]; cefr: Cefr | null }`.
  The text fields are `string | null`, except `term: string`.
- `pageToWordFields(page, ids): WordFields & { notionStatus: string | null }`, with clipping and normalization.
- `wordToValues(patch: Partial<WordFields> & { status?: StudyStatus }, ids): Record<string, NotionValue>`.
- `changedFields(current: WordFields, next: Partial<WordFields>): Partial<WordFields>`.
- `normalizeTerm(term)`, which lowercases, trims and collapses whitespace.
- `pullSince(lastPulledAt: string | null): string | null`, which is 2 minutes before, or null for a full pull.
- `missingFromNotion(mirror: { id; notionPageId; deleted: boolean }[], liveIds: Set<string>): { toDelete: string[]; toRestore: string[] }`.

### Task 3: Database `vocab_words`, `vocab_cards`, `vocab_upsert_words`
**Files:** migration `<v>_vocab_words.sql`, append to `supabase/tests/rls/vocab.sql`, regenerated types.

- **Tables:** as spec §7.1, with the CHECKs from the Global Constraints. Indexes:
  - `vocab_words_user_live_idx (user_id) where deleted_at is null`
  - GIN on `topics`
  - `(user_id, lower(term))`
  - `vocab_cards (user_id, due) where suspended_at is null`
- **`vocab_upsert_words(p_user_id uuid, p_rows jsonb) returns setof vocab_words`** (security invoker):
  - It upserts each element by `(user_id, notion_page_id)`. The fields are term, meaning, pos, ipa, example,
    synonyms, note, topics, cefr, notion_status, notion_url, notion_last_edited_at, and `deleted_at = null`.
  - It skips an update when the stored `notion_last_edited_at` is newer than the incoming one, so an old page
    never overwrites newer data.
  - It inserts the `recognition` and `recall` cards with `on conflict do nothing`.
  - RLS applies, so an authenticated caller can write only their own `user_id`.
- **RLS:** own-row CRUD on both tables. Cards get no direct insert from clients other than through the function,
  and that is enforced by RLS anyway.
- **SQL test:** cross-user isolation; the upsert creates 2 cards; a second upsert updates fields and doesn't
  duplicate cards; an older `notion_last_edited_at` is ignored; another user's id is rejected; the checks hold.

### Task 4: Services (word CRUD, pull, reconcile) and the job
**Files:**
- `src/features/vocab/services/word.service.ts`, `sync.service.ts`
- `src/features/vocab/schemas/word.schema.ts`
- `src/features/vocab/actions/word.actions.ts`
- `src/app/api/internal/jobs/vocab-sync/route.ts`
- `vercel.ts` (cron `0 7 * * *`)
- `connection.service.ts` (`withNotion` takes `VocabCtx = { supabase; user: { id } }`)
- test `tests/unit/vocab-word-schema.test.ts`

**Behavior:**
- `createWord(ctx, fields)`:
  1. require a ready connection;
  2. reject a duplicate term (`CONFLICT`);
  3. `gateway.createPage(ds, wordToValues({ ...fields, status: "새 단어" }))`;
  4. upsert the returned page through the RPC.
- `updateWord(ctx, wordId, patch)`: load own row → `changedFields` → none: return → `updatePage` → upsert.
- `deleteWord(ctx, wordId)`: `trashPage`; a NOT_FOUND counts as gone → delete the own mirror row.
- `pullChanges(ctx)`: `since = pullSince(last_pulled_at)`, `startedAt = now`. Page through the query and upsert each
  batch. Only after all pages succeed, set `last_pulled_at = startedAt`.
- `reconcile(ctx)`: a full query of every page; upsert; `missingFromNotion` → set `deleted_at` on the missing rows;
  set `last_pulled_at` and `last_reconciled_at`.
- `maybePull(ctx)`: when `last_pulled_at` is older than 5 minutes (or null), swallow and log errors. Pages call it
  via `after()`.
- **Actions:** `createWordAction`, `updateWordAction`, `deleteWordAction`, `syncNowAction` (runs `reconcile` and
  returns counts).
- **Job:** for every active connection with a data source, `reconcile` under the admin client, then
  `{ users, pulled, deleted, failed }`.

### Task 5: Queries and UI
**Files:**
- `src/features/vocab/queries/word.queries.ts` (`listWords(supabase, userId, filter)`, `listTopics`,
  `homeSummary`)
- `src/features/vocab/utils/escape-like.ts` + test
- components: `word-filters.tsx`, `word-table.tsx`, `word-drawer.tsx` (Sheet), `word-form.tsx` (shared by add and
  edit), `quick-add.tsx`, `sync-button.tsx`, `topic-cards.tsx`
- pages: `src/app/(private)/english/words/page.tsx`; update `english/page.tsx` (topic cards + counts + `after`
  maybePull); `EnglishNav` gets the 단어 tab

**UI:**
- 단어 page: filters (search, topic, level, status) as a GET form; the [지금 동기화] button with the last sync time;
  the quick-add bar. A table of 단어 · 뜻 · 주제 · 레벨 · 상태; a row opens the drawer.
- Drawer: the form, plus [Notion에서 열기] and [삭제] with a two-step confirmation.
- Home: total word count, topic cards (name, count, [보기] → `/english/words?topic=`) and an empty state.

### Task 6: E2E, docs
- `tests/e2e/vocab-words.spec.ts` (fake Notion). Setup: connect, create the DB.
  1. Quick-add `[e2e] ubiquitous` with a meaning and topics → it's in the table and in the mirror.
  2. Edit the meaning in the drawer → the table updates.
  3. Delete the mirror row behind the app's back (`dbAsUser`) → [지금 동기화] brings the word back.
  4. Delete via the drawer → it's gone from the table and the mirror.
  5. Cleanup.
- Docs: architecture rows, progress V1 box, ADR 0046 "V1 refinements" (the five above), and a spec §14 V1 note.
