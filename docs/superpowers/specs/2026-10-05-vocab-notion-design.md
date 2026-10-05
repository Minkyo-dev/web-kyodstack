# 단어장 (vocabulary) backed by Notion — design

- Date: 2026-10-05
- Status: approved design; not implemented. Phases V0–V6 below each get their own plan.
- Related: ADR 0046 (this feature's decisions), ADR 0009/0018/0041 (AI provider, guardrails, budget), ADR 0043
  (web push), ADR 0010 (jobs), ADR 0031 (E2E user)

## 1. Intent

A private **단어장** utility next to the planner and the 가계부. It has one owner per Notion connection and supports
several users.

What the owner asked for:
- Each user's **Notion database is the word table**, with create, read, update and delete from the app.
- Words are organized **by topic**.
- **Flashcards** for memorization, a **학습 완료** (learned) state, and reminders that follow the forgetting curve
  ("1일 · 3일 · 7일").
- **AI practice on a word set.** The AI writes a Korean sentence that uses the word, and the user translates it
  into English. The AI then returns grammar corrections, a more natural sentence and the nuance differences. The
  user picks the difficulty from **A1, A2, B1, B2, C1 and C2**.
- UX modeled on "Ramnote". This was read as **RemNote** (notes, flashcards and spaced repetition), because no
  product named "Ramnote" could be found.

Decided in the design dialogue:
| Question | Decision |
|---|---|
| Who connects Notion | Every user connects their own workspace with **public OAuth** |
| Where the Notion DB comes from | **The app creates a DB with a fixed schema** under a page the user shares |
| Review algorithm | **FSRS** (adaptive), via `ts-fsrs` |
| What Notion sees of the learning state | **Only `상태` and `다음 복습` are written back**; FSRS internals stay in Supabase |
| Reminders | **Web push plus in-app** due buckets |
| v1 extras | AI auto-fill, bulk add, pronunciation (TTS), two-direction cards, stats and streak, keyboard shortcuts |
| Architecture | **Notion is the source for content, with a Supabase mirror; Supabase is the source for the learning state** |

Success means:
- Words added in Notion or in the app show up in both places.
- A daily review session runs from the mirror without waiting on Notion.
- A session works with the keyboard alone.
- Practice feedback is structured and checked. It never writes into the word table unless the user confirms.

## 2. Principles (existing project rules, restated)
1. **RLS everywhere.** Every user-owned table has `user_id = auth.uid()` policies. Mutations follow Zod →
   `requireUser` → service → `ActionResult`. `user_id` never comes from the client.
2. **Code decides, AI words.** Queues, intervals, statuses, stats and streaks come from TypeScript or SQL. The LLM
   writes sentences, feedback and suggested field values. Its output is Zod-validated and stored as advice.
3. **Atomic state changes.** A review updates the card and appends to the log in one DB function.
4. **Timezone-correct.** "Today", the due buckets, streaks and reminders use `profiles.timezone`.
5. **Secrets stay on the server.** Notion tokens are encrypted at rest and never reach the browser. Raw Notion or
   provider errors are mapped to `AppError`.
6. **Degrade, don't break.** If Notion is slow or down, reviews still work. Only content edits wait.

## 3. Research notes (2026-10-05)

**Notion API**
- Use `Notion-Version: 2026-03-11` and `@notionhq/client` 5.26.0 (the SDK defaults to 2025-09-03, so the version
  must be passed explicitly).
- Since 2025-09-03, a database holds one or more **data sources**:
  - `GET /v1/databases/{id}` returns `data_sources[]`.
  - Queries use `POST /v1/data_sources/{id}/query`. It takes a `filter` (including timestamp filters on
    `last_edited_time`), `sorts`, `start_cursor`, `page_size` ≤ 100 and `filter_properties[]`. It returns at most
    10,000 results per query.
  - Pages are created with `parent: { type: "data_source_id", data_source_id }`.
  - Schema changes use `PATCH /v1/data_sources/{id}`.
- 2026-03-11 renamed `archived` to **`in_trash`**.
- `POST /v1/databases` takes `parent: { type: "page_id" }`, a `title` and `initial_data_source.properties`. It can
  create `status` properties with options and groups. The response includes `data_sources[]`.
- **Rate limit:** about 3 requests per second per integration token, with short bursts allowed. A 429 comes with a
  `Retry-After` header in seconds.
- `last_edited_time` is **rounded to the minute**, so incremental pulls need an overlap window and an idempotent
  upsert.
- **OAuth:**
  - The authorize URL is `https://api.notion.com/v1/oauth/authorize?client_id&redirect_uri&response_type=code&owner=user&state`.
    On this screen the user picks which pages to share.
  - Token exchange is `POST /v1/oauth/token` with Basic auth (`client_id:client_secret`), `grant_type=authorization_code`,
    `code` and `redirect_uri`.
  - The response holds `access_token`, `refresh_token` (nullable), `bot_id`, `workspace_id`, `workspace_name`,
    `owner` and `duplicated_template_id`.
  - The same endpoint accepts `grant_type=refresh_token`. The documentation gives no expiry for access tokens, so
    the client handles both "never expires" and "401, then refresh".
- **Webhooks** exist (`data_source.content_updated` and others) but are out of scope for v1 (§16).

**FSRS / ts-fsrs**
- FSRS models each card as difficulty, stability and retrievability, and schedules for a target retention.
- `ts-fsrs` 5.x is TypeScript, supports ESM and needs Node ≥ 20. It provides `fsrs(params)`, `createEmptyCard()`,
  `scheduler.repeat(card, now)` (previews all 4 ratings) and `next(card, now, rating)`.
- Its parameters include `request_retention`, `maximum_interval`, `enable_fuzz` and `enable_short_term`.
- The parameter optimizer is a separate binding package and is not used in v1.

**RemNote UX worth copying**
- A **queue**: one card at a time, show the answer, then a 4-step self-rating (Forgot / Partially recalled /
  Recalled with effort / Easily recalled).
- Cards show their **context**.
- Keyboard-first: space to reveal, number keys to rate.
- A daily goal and progress bar, and practicing a single document (here, a topic) on demand.

Sources:
- [Notion upgrade guide 2025-09-03](https://developers.notion.com/docs/upgrade-guide-2025-09-03)
- [Notion upgrade guide 2026-03-11](https://developers.notion.com/guides/get-started/upgrade-guide-2026-03-11)
- [Query a data source](https://developers.notion.com/reference/query-a-data-source)
- [Create a database](https://developers.notion.com/reference/database-create)
- [Create a token](https://developers.notion.com/reference/create-a-token)
- [Authorization](https://developers.notion.com/docs/authorization)
- [@notionhq/client](https://www.npmjs.com/package/@notionhq/client)
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
- [RemNote spaced repetition](https://www.remnote.com/feature/spaced-repetition)

## 4. Architecture

```
browser ──► /english/* (Server Components) ──► features/vocab/queries ──► Supabase (mirror + FSRS, RLS)
        ──► client leaves (review, drawer, practice) ──► features/vocab/actions ──► runAction
                ──► services ──► NotionGateway (lib/notion) ──► api.notion.com
                             └► Supabase (mirror upsert, RPCs, outbox)
jobs:   /api/internal/jobs/vocab-sync (nightly) ──► pull + reconcile + outbox flush per connected user
        /api/internal/jobs/notifications (existing 5-min tick) ──► vocab_due rule
oauth:  /api/notion/connect ──► notion authorize ──► /api/notion/callback ──► /english/settings?setup=1
```

Module layout (features/vocab follows the existing feature shape):
```
src/lib/notion/          server-only
  gateway.ts             NotionGateway interface (the methods the app needs, typed with app-level shapes)
  client-gateway.ts      @notionhq/client implementation: version header, 3 rps throttle, 429/Retry-After, 401→refresh
  fake-gateway.ts        in-memory implementation for tests/E2E (refused in production, like the fake AI provider)
  crypto.ts              AES-256-GCM seal/open for tokens (key: NOTION_TOKEN_KEY)
  oauth.ts               authorize URL, code exchange, refresh
  errors.ts              Notion error → AppError mapping
src/features/vocab/
  domain/                pure: srs.ts (ts-fsrs wrapper), queue.ts, status.ts, buckets.ts, streak.ts,
                         notion-mapping.ts (page ⇄ word), answer-match.ts, word-diff.ts, bulk-parse.ts, cefr.ts
  schemas/               Zod inputs for actions, word field limits
  services/              connection, setup (create DB, repair schema), word (CRUD write-through), sync (pull,
                         reconcile), outbox, review (apply/undo/suspend), practice, enrich
  queries/               home summary, word list, queue, stats, practice history
  actions/               thin "use server" wrappers via runAction
  components/            pages' client leaves
src/app/(private)/english/  layout (tab bar), page, words/, words/bulk/, review/, practice/, practice/[id]/, stats/, settings/
src/app/api/notion/{connect,callback}/route.ts
src/features/ai/prompts/ vocab-enrich.prompt.ts, vocab-practice.prompt.ts (versioned)
```
Dependencies point one way: `app → vocab components → actions/queries/services → lib`. `vocab` does not import the
scheduler or finance features. It reuses `getSchedulerContext` only for the timezone (the AI budget already does
this) and `callAi` from `features/ai`.

## 5. Notion integration

### 5.1 Environment (server-only, `env.server.ts`)
| Var | Purpose |
|---|---|
| `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` | public integration credentials |
| `NOTION_REDIRECT_URI` | `https://<host>/api/notion/callback` (must match the integration settings exactly) |
| `NOTION_TOKEN_KEY` | base64 32-byte key for AES-256-GCM |
| `NOTION_GATEWAY` | `client` (default) or `fake` (tests/E2E; refused when `NODE_ENV=production`) |

### 5.2 Connect
1. **`GET /api/notion/connect`** requires a session.
   - It creates 32 random bytes as `state` and sets the cookie `notion_oauth_state` (httpOnly, Secure, SameSite=Lax,
     Max-Age 600, Path `/api/notion`).
   - It then redirects to the authorize URL with `owner=user`.
2. **`GET /api/notion/callback`** requires a session.
   - It checks `state` against the cookie in constant time, deletes the cookie and exchanges the code.
   - It upserts `notion_connections` for **the session user**. The user is never taken from `state` or the query.
   - It redirects to `/english/settings?setup=1`. On error it redirects with `?error=<code>`, and nothing from the
     provider reaches the browser.
3. **Setup:**
   - `searchSharedPages` (`POST /v1/search`, filter object = page) lists the pages the user shared. The user picks
     a parent.
   - `createVocabDatabase` creates the database "Kyod 단어장" with the §5.3 schema.
   - The app stores `database_id`, `data_source_id` and `schema_version = 1`.
   - If the connection already has a DB that still resolves, setup offers [기존 단어장 사용] instead of creating a
     second one.
4. **Reconnect:** a 401 triggers one refresh (when a refresh token exists). If that fails, or there is no refresh
   token, `status = 'reauth_required'`, and every vocab page shows a reconnect banner. Reads from the mirror and
   reviews keep working.
5. **Disconnect** deletes the token columns and sets `status = 'disconnected'`.
   - The mirror, cards and logs are kept read-only. Reconnecting to the same DB resumes them.
   - The UI also tells the user how to remove the connection on Notion's side. V0 verifies whether a revoke
     endpoint exists, and calls it if so.

### 5.3 Notion schema v1 (created by the app)
| Property | Notion type | Mirror column | Edited by |
|---|---|---|---|
| 단어 | title | `term` | both |
| 뜻 | rich_text | `meaning` | both |
| 품사 | select (명사, 동사, 형용사, 부사, 구동사, 숙어, 기타) | `pos` | both |
| 발음 | rich_text | `ipa` | both |
| 예문 | rich_text | `example` | both |
| 유의어 | rich_text | `synonyms` | both |
| 메모 | rich_text | `note` | both |
| 주제 | multi_select | `topics text[]` | both |
| 레벨 | select (A1…C2) | `cefr` | both |
| 상태 | status: 새 단어 (To-do) / 학습 중 (In progress) / 학습 완료 (Complete) | `notion_status` | both (§6.3) |
| 다음 복습 | date (date only) | — (derived) | app only; Notion edits are ignored and overwritten by the next write-back |

**Field limits** (Zod, also keeps every value inside one Notion text object of ≤ 2000 chars):
- `term` 1–200
- `meaning` ≤ 1000
- `example` ≤ 1000
- `synonyms` ≤ 500
- `note` ≤ 2000
- `topics` ≤ 10 names, each 1–50 chars and without commas (Notion rejects commas in option names)

Properties are read **by property id**, which is stored per connection after creation, so renaming a property
in Notion does not break sync. A deleted or type-changed property raises `NOTION_SCHEMA_MISMATCH`. Settings then
offers [속성 복구], which re-adds the missing properties with `PATCH /v1/data_sources/{id}` and stores the new ids.

### 5.4 Gateway contract
The gateway in `src/lib/notion/types.ts` is generic. It knows Notion, not vocabulary (the vocabulary schema is
`features/vocab/domain/notion-schema.ts`):
```ts
interface NotionGateway {
  authorizeUrl(state, redirectUri): string;
  exchangeCode(code, redirectUri): Promise<OAuthGrant>;
  refresh(refreshToken): Promise<OAuthGrant>;
  revoke(accessToken): Promise<void>;
  searchPages(auth): Promise<NotionPageRef[]>;
  createDatabase(auth, { parentPageId, title, properties: NotionPropertySpec[] }): Promise<CreatedDatabase>;
  getDataSourceProperties(auth, dataSourceId): Promise<NotionPropertyInfo[]>;
  addProperties(auth, dataSourceId, properties): Promise<NotionPropertyInfo[]>;
  // V1 adds the word-page methods: queryPages, createPage, updatePage, trashPage
}
```
`NotionWordPage` holds the page id, url, `last_edited_time`, `in_trash` and the mapped fields. Mapping lives in the
pure `domain/notion-mapping.ts`, so it can be unit tested without the SDK.

The client implementation:
- throttles each connection to 3 requests per second (an in-process token bucket);
- honors `Retry-After` on 429, up to 3 attempts, then `NOTION_RATE_LIMITED`;
- retries 502/503/504 once, then `NOTION_UNAVAILABLE`;
- on 401 refreshes once, then `NOTION_REAUTH_REQUIRED`;
- maps every other error to `NOTION_ERROR`, logging the Notion code but never returning it.

## 6. Sync

### 6.1 App → Notion, content (synchronous write-through)
- **Create:** Zod → `gateway.createPage` → upsert the mirror row from the **returned page** → create the two cards
  (the `vocab_create_word` RPC: mirror row + both cards in one transaction).
- **Update:** only changed fields are sent (`PATCH` with those properties), so concurrent edits to other fields in
  Notion survive. The returned page refreshes the mirror.
- **Delete:** `trashPage`, then the mirror row and its cards are hard-deleted (cascade). Reviews of a deleted word
  go with it. This is acceptable because stats are recomputed from the remaining log.
- If Notion fails, nothing is written locally and the action returns the mapped error. This guarantees the mirror
  never holds content Notion doesn't.

### 6.2 Notion → app, content (incremental pull)
Pulls are triggered:
- on entering any `/english` page when `last_pulled_at` is older than 5 minutes (runs in `after()`, so the page
  renders from the mirror immediately);
- by [지금 동기화];
- by the nightly job.

A pull:
1. Sets `pull_started = now()`.
2. Queries with `last_edited_time on_or_after (last_pulled_at − 2 min)`. The overlap covers the minute rounding.
3. Pages through `next_cursor`.
4. Upserts each page by `(user_id, notion_page_id)`. A page with `in_trash` gets `deleted_at = now()`.
5. Applies §6.3 status changes.
6. Creates cards for words that have none.
7. Sets `last_pulled_at = pull_started` **only after all pages succeeded**, so a partial pull is repeated next time.

### 6.3 `상태` in both directions
- The mirror keeps `notion_status`, the last value seen in or written to Notion.
- **On pull,** if the incoming `상태` differs from `notion_status`, the user changed it in Notion:
  - `학습 완료` suspends both cards.
  - Leaving `학습 완료` unsuspends both and makes them due now.
  - `새 단어` ⇄ `학습 중` alone changes nothing.
  - `notion_status` is then updated.
- **After an app-side change** (rating, suspend or unsuspend), the derived status (§7.5) and `다음 복습` are
  enqueued in the outbox when they differ from what Notion has.

### 6.4 App → Notion, learning state (outbox)
- `vocab_outbox` keeps **at most one pending row per word** (a partial unique index on `word_id where done_at is null`).
  Enqueueing is an upsert that replaces the payload with the latest value.
- **Flushers:**
  - `after()` at review session end and on page entry (bounded to 30 rows, about 10 s at 3 rps);
  - the nightly job (all rows).
- On failure: `attempts + 1` and exponential `next_attempt_at` (1 min → 1 h cap). After 10 attempts the row stays
  for the settings page to show as "동기화 실패 N건" with [다시 시도].
- Write-backs bump `last_edited_time`, so the next pull re-reads those pages. That is harmless because upserts are
  idempotent.

### 6.5 Reconcile (nightly)
- Query the data source with `filter_properties` limited to the title, to collect every live page id.
- Mirror rows missing from that set get `deleted_at`. Rows that reappear (restored from trash) are cleared and
  re-read.
- Sets `last_reconciled_at`.

## 7. Learning

### 7.1 Data model (RLS own-row on every table; each table arrives in the phase that first uses it)
```sql
notion_connections (
  user_id uuid primary key references auth.users on delete cascade,
  workspace_id text, workspace_name text, bot_id text,
  access_token_enc text, refresh_token_enc text,       -- 'v1:<iv>:<tag>:<ciphertext>' base64 parts
  database_id text, data_source_id text, property_ids jsonb, schema_version int,
  status text not null check (status in ('active','reauth_required','disconnected')),
  last_pulled_at timestamptz, last_reconciled_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
)
vocab_words (
  id uuid pk, user_id uuid not null, notion_page_id text not null, notion_url text,
  term text not null, meaning text, pos text, ipa text, example text, synonyms text, note text,
  topics text[] not null default '{}', cefr text check (cefr in ('A1','A2','B1','B2','C1','C2')),
  notion_status text, notion_last_edited_at timestamptz, deleted_at timestamptz,
  created_at, updated_at,
  unique (user_id, notion_page_id)
)  -- indexes: (user_id) where deleted_at is null; GIN (topics); (user_id, lower(term))
vocab_cards (
  id uuid pk, user_id uuid not null, word_id uuid not null references vocab_words on delete cascade,
  direction text not null check (direction in ('recognition','recall')),
  fsrs_state text not null default 'new' check (fsrs_state in ('new','learning','review','relearning')),
  due timestamptz not null default now(), stability double precision, difficulty double precision,
  elapsed_days int default 0, scheduled_days int default 0, learning_steps int default 0,
  reps int not null default 0, lapses int not null default 0, last_review timestamptz,
  suspended_at timestamptz,
  unique (word_id, direction)
)  -- index: (user_id, due) where suspended_at is null
vocab_reviews (                                          -- append-only; source of stats, undo and future optimizer
  id uuid pk, user_id uuid not null, card_id uuid not null references vocab_cards on delete cascade,
  client_review_id uuid not null, rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null, duration_ms int,
  before jsonb not null, after jsonb not null, algo_version text not null,
  unique (user_id, client_review_id)
)  -- index: (user_id, reviewed_at)
vocab_outbox (id, user_id, word_id references vocab_words on delete cascade, payload jsonb not null,
  attempts int default 0, next_attempt_at timestamptz default now(), last_error_code text, done_at timestamptz)
  -- unique (word_id) where done_at is null
vocab_settings (user_id pk, new_per_day int default 20 check 0..200, reviews_per_day int default 200 check 1..1000,
  desired_retention numeric default 0.90 check 0.70..0.97, directions text[] default '{recognition,recall}',
  default_cefr text default 'B1', reminder_enabled bool default true, reminder_time time default '20:00')
vocab_practice_sessions (id, user_id, cefr text not null, source text check in ('topic','reviewed_today','hard','manual'),
  source_ref text, word_ids uuid[] not null, prompt_version text, model text, created_at)
vocab_practice_items (id, session_id references vocab_practice_sessions on delete cascade, user_id, position int,
  target_word_ids uuid[] not null, prompt_ko text not null, hint_ko text)
vocab_practice_attempts (id, item_id references vocab_practice_items on delete cascade, user_id,
  answer text not null check (length(answer) between 1 and 500), feedback jsonb not null,
  prompt_version text, model text, created_at)
```
**Token columns:**
- RLS lets the owner select their own row, but the tokens are ciphertext without the server key.
- Queries never select the token columns except in `lib/notion`, and those values never leave the server.
- Rows are written only by the connection service, under the user's RLS.

**DB functions (security invoker, RLS applies):**
- `vocab_create_word(word jsonb)` inserts the mirror row plus both cards.
- `vocab_apply_review(card_id, expected_reps, card_after jsonb, review jsonb)` takes a row lock, checks
  `reps = expected_reps` (otherwise `VOCAB_REVIEW_CONFLICT`), updates the card and inserts the review. A repeated
  `client_review_id` returns the stored result (idempotent).
- `vocab_undo_review(card_id)` restores `before` of the card's latest review and deletes that review. Only the
  latest review of that card can be undone.
- `vocab_set_suspended(word_id, suspended bool)` updates both cards.

### 7.2 FSRS (`domain/srs.ts`)
- Wraps `ts-fsrs` with `request_retention = settings.desired_retention`, `maximum_interval = 3650`,
  `enable_fuzz = true` and `enable_short_term = true` (learning steps in minutes).
- `algo_version = 'fsrs-6@<ts-fsrs version>'`.
- The wrapper converts between `vocab_cards` rows and ts-fsrs `Card` objects, and exposes:
  - `preview(card, now)`, which returns the next due time for each rating (the button labels);
  - `apply(card, rating, now)`.
- Nothing outside `srs.ts` imports `ts-fsrs`.

### 7.3 Queue (`domain/queue.ts`, pure)
Input: the cards in scope, today's local day range, the settings and today's counts from `vocab_reviews`.
- **Review pool:** not suspended, `fsrs_state <> 'new'` and `due ≤ end of today (local)`, ordered by `due` ascending.
  It is capped at `reviews_per_day − reviews done today`.
- **New pool:** `fsrs_state = 'new'`, ordered by word `created_at`. It is capped at
  `new_per_day − new cards introduced today`, where "introduced" means a review whose `before.fsrs_state = 'new'`.
- Only directions listed in `settings.directions` are used.
- **Sibling bury:** if one direction of a word was reviewed today, or is already in the queue, its sibling waits
  until tomorrow. Recognition comes before recall.
- **Interleave:** one new card after every three reviews, then the rest.
- **Scope:**
  - `all`;
  - `topic:<name>` (the topic's cards only, with the same caps; the remaining daily capacity is shared, not
    per-topic);
  - `filter` (level and/or status).
- **In-session relearning:** a card rated Again or Hard whose next `due` falls within 20 minutes goes back into the
  client queue at its due time, or after at least 3 other cards. FSRS handles early reviews.

### 7.4 Review screen (`/english/review?scope=`)
- **Focus mode.** The sidebar collapses. The top bar shows progress `12 / 40`, a scope chip and [종료] (Esc).
- **Recognition front:** the term, large, with 🔊 (TTS) and the topic chips.
- **Recall front:** the meaning, the part of speech and the example with the term blanked (`It is ___ in modern
  cities.`), plus an optional answer field.
  - `answer-match.ts` normalizes both sides (lowercase, trim, collapse spaces, strip outer punctuation).
  - An exact match suggests Good. Damerau–Levenshtein distance 1, for terms of 4 or more letters, suggests Hard.
    Anything else suggests Again.
  - The suggestion only highlights a button; the user always chooses.
- **Back:** meaning, IPA, example (🔊), synonyms, topics and level.
- **Buttons:** `다시 / 어려움 / 알맞음 / 쉬움`, each labeled with its next interval from `preview()` (for example
  `10분 · 1일 · 3일 · 7일`). This is how the "1·3·7일" rhythm shows up without being hard-coded.
- **Shortcuts:**
  - `Space`/`Enter` shows the answer.
  - `1–4` rate.
  - `E` edits (dialog → write-through).
  - `D` toggles 학습 완료.
  - `Z` undoes.
  - `P` plays the audio.
  - `Esc` ends the session.

  Shortcuts are disabled while a text field is focused. A `?` popover lists them.
- **TTS:** the Web Speech API (`speechSynthesis`, an `en-US` voice when available). The button is hidden if the API
  is unsupported.
- **Saving:** `reviewCardAction({ cardId, rating, durationMs, clientReviewId, expectedReps })`.
  - The service loads the card, runs `srs.apply` with the server's `now` and calls `vocab_apply_review`, then
    enqueues the outbox.
  - The UI advances optimistically. On failure it shows a toast and puts the card back at the front of the queue.
    On `VOCAB_REVIEW_CONFLICT` it shows a toast and refetches the card.
- **Session end:** a summary of the count, the rating distribution and tomorrow's due count, with
  [틀린 단어로 AI 연습]. That button opens the practice set builder pre-filled with the words rated Again in this
  session (source `manual`, at most 10). Then `after()` flushes the outbox.
- **Mobile:** the rating buttons are a sticky bottom bar, and the card has full width.

### 7.5 Status and 학습 완료 (`domain/status.ts`, pure)
- `새 단어`: every card is new.
- `학습 완료`: every card is suspended.
- `학습 중`: otherwise.
- `다음 복습` is the local date of the earliest `due` among unsuspended cards, or empty when there are none.
- **Mature hint:** when every active card has `scheduled_days ≥ 21`, the word shows a "숙련" badge and a
  [학습 완료로 표시] suggestion. Nothing switches automatically.
- Turning 학습 완료 off makes both cards due now; the FSRS memory state is kept.

## 8. Reminders and stats

### 8.1 Due buckets (home)
- Counts of active cards whose due local date is ≤ today, ≤ today+1, ≤ today+3 and ≤ today+7. These are
  cumulative and shown as `오늘 23 · 1일 내 31 · 3일 내 58 · 7일 내 90`.
- A 7-day forecast bar shows the per-day counts.

### 8.2 Push (`vocab_due`)
- Extends the assistant's rules from `notify-v1` to `notify-v2` with one kind, `vocab_due`. The rule:
  - `reminder_enabled`, the per-kind switch is on, and local time ≥ `reminder_time`;
  - today's queue (§7.3, scope `all`) is not empty. The caps already subtract what was done today, so a finished
    day sends nothing.
- Dedupe key `vocab_due:<local date>`. It respects quiet hours and the daily cap (priority: after `block_soon`,
  before `habit_missed`).
- Message: "오늘 복습할 단어 23개 · 새 단어 10개" → `/english/review`.
- The job loads the facts through a vocab query with an explicit `user_id` (service role, ADR 0043 rules). The
  notify domain stays pure and receives `vocabDue: { reviews, newCards } | null` as an input.

### 8.3 Stats (`/english/stats`, home widgets)
All stats come from `vocab_reviews` grouped by local day (a `security_invoker` SQL view joined to
`profiles.timezone`, or a query with `at time zone`):
- a heatmap of the last 12 weeks;
- the **streak**: consecutive local days with ≥ 1 review, ending today if today has a review, otherwise yesterday;
- the **30-day recall rate**: the share of reviews with `before.fsrs_state = 'review'` and `rating > 1`;
- counts by status and by topic, and today's progress against the caps.

No LLM is involved.

## 9. AI

All calls go through `callAi` with versioned prompts in `features/ai/prompts`, a Zod output schema, `sanitize`d and
delimited user text, and the fake provider in tests.

### 9.1 Budget pools (amends ADR 0018)
- `callAi(ctx, kind, req, { pool })`:
  - The `default` pool keeps 30 calls per local day and counts kinds not starting with `vocab.`.
  - The new **`vocab` pool allows 60 calls per local day** and counts `vocab.%` kinds.
- Over the cap returns `AI_BUDGET_EXCEEDED` with the pool in the message mapping, for example "오늘 단어장 AI 사용량을
  모두 썼어요".
- Gemini's free tier (5 RPM) is enough: a practice session issues 1 call and then 1 per answer at human typing
  speed.

### 9.2 Auto-fill (`vocab.word.enrich`, prompt `vocab-enrich-v1`)
- **Input:** `terms[1..20]`, plus any fields already present.
- **Output:** `items[{ term, meaning_ko, pos (enum), ipa, example_en, synonyms[≤5], cefr }]`.
  - `term` must echo an input term after normalization. Unknown terms are dropped. If none remain, the result is
    `AI_OUTPUT_INVALID`.
- **Single add:** [AI 채우기] fills the **form**, the user edits, then [저장] writes through.
- **Bulk add** (`/english/words/bulk`):
  - Paste up to 200 lines in the form `term`, `term - meaning`, `term : meaning` or `term<TAB>meaning`
    (`bulk-parse.ts`).
  - A preview grid flags duplicates by normalized term, against the mirror and within the paste, and excludes them
    by default.
  - [AI로 빈 칸 채우기] fills empty cells 20 rows per call.
  - [N개 추가] calls the create action in chunks of 10 from the client, with a progress bar. Notion takes about
    3 rows per second. Rows that fail stay in the grid with their error.

### 9.3 Practice (`/english/practice`)
**Set builder:**
- Source:
  - a topic;
  - words reviewed today;
  - hard words (`lapses ≥ 2` on any card, or Again within the last 7 days);
  - a manual pick from the word list.
- Size 5–10, chosen by code (most lapses first for hard words, otherwise random).
- CEFR level as a segmented control A1…C2 with one-line descriptions. The default comes from settings.

**Generate** (`vocab.practice.generate`, prompt `vocab-practice-v1`, 1 call):
- **Input:** level, the CEFR rubric line (below) and the words as `{ id, term, meaning, pos }`.
- **Output:** `items[{ target_word_ids[1..2], prompt_ko, hint_ko? }]`, one per word. The second target is allowed
  only for B2 and above.
- Validation:
  - every requested id appears at least once;
  - no unknown ids;
  - `prompt_ko` is 5–200 chars and contains Hangul.
  - Otherwise the result is `AI_OUTPUT_INVALID` and nothing is saved.
- The session and items are saved, so a refresh resumes the session.

**CEFR rubric** (`domain/cefr.ts`, shared by the prompt and the UI):
| Level | Korean sentence the user should be able to translate |
|---|---|
| A1 | ≤ 8 words in English; present simple, can/have; everyday objects and routines |
| A2 | ≤ 12 words; past simple, going to, comparatives; daily life, shopping, travel |
| B1 | ≤ 18 words; present perfect, simple conditionals, because/although; work and opinions |
| B2 | ≤ 25 words; passive, relative clauses, modals of deduction; abstract and work topics |
| C1 | ≤ 30 words; mixed conditionals, inversion, hedging; nuance and register matter |
| C2 | no length cap; idiomatic, implicit meaning, formal/informal register shifts |

**Feedback** (`vocab.practice.feedback`, 1 call per attempt, at most 3 attempts per item):
- **Input:** level, `prompt_ko`, the target words and the user answer (≤ 500 chars, delimited).
- **Output:**
  ```
  verdict: 'correct' | 'minor_issues' | 'incorrect'          -- AI label; shown, never used in stats
  target_usage: { used: boolean, correct: boolean, note_ko }
  corrections: [{ original, corrected, category: grammar|word_choice|article|tense|preposition|word_order|spelling|other, explanation_ko }] (≤ 8)
  corrected_sentence: string                                   -- minimal edit of the user's answer
  natural_sentence: string                                     -- how a native speaker would say it
  alternatives: [{ sentence, register: casual|neutral|formal, nuance_ko }] (1..3)
  ```
- **UI:**
  - a word-level diff between the answer and `corrected_sentence`, computed by `word-diff.ts` (LCS over tokens);
    the LLM is not asked for it;
  - the correction list with category badges, the natural sentence (🔊) and an alternatives table (register badge
    and nuance).
  - [다시 써보기] creates a new attempt.
- Practice never changes FSRS state. Past sessions appear at `/english/practice` (history) and
  `/english/practice/[id]`.

## 10. Screens

The sidebar gets "단어장" (lucide `BookOpenText`), and the dashboard gets a card. `/english/layout.tsx` renders a
tab bar in the `PlannerNav` style: 홈 · 단어 · 복습 · AI 연습 · 통계 · 설정. Without an active connection, every tab
except 설정 shows the onboarding card instead of its content.

| Tab | Path | Content |
|---|---|---|
| 홈 | `/english` | today card (`복습 23 · 새 단어 10`, primary [복습 시작]), due buckets + 7-day forecast, streak + mini heatmap, topic cards (counts by status, due, [학습] [보기]), last practice session |
| 단어 | `/english/words?topic&status&level&q` | dense table: term · meaning · topics · level · status badge (icon + text) · next review; the quick-add bar (`term` + Enter → add dialog with [AI 채우기]); [일괄 추가]; a row opens the side drawer (all fields, edit, [Notion에서 열기], [학습 완료], [삭제] with confirmation) |
| 일괄 추가 | `/english/words/bulk` | §9.2 |
| 복습 | `/english/review?scope=` | §7.4 |
| AI 연습 | `/english/practice`, `/english/practice/[id]` | set builder + history; session page |
| 통계 | `/english/stats` | §8.3 |
| 설정 | `/english/settings` | Notion: workspace, DB link, last sync, [지금 동기화], failed write-backs, [속성 복구], [다시 연결], [연결 해제]; study: limits, directions, retention; reminder: on/off, time; practice: default level |

**Style:**
- flat and dense, subtle borders, radius ≤ 8px;
- status is never shown by color alone;
- Server Components by default, with client leaves for the review screen, the drawer, the bulk grid, practice and
  the settings forms;
- page help via `lib/page-help.ts` for each tab.

## 11. Errors (`AppError` codes added)
| Code | When | UI |
|---|---|---|
| `NOTION_NOT_CONNECTED` | no active connection | onboarding card |
| `NOTION_REAUTH_REQUIRED` | 401 after refresh | banner with [다시 연결] |
| `NOTION_RATE_LIMITED` | 429 after retries | toast "Notion이 잠시 바빠요. 잠시 후 다시 시도해 주세요." |
| `NOTION_UNAVAILABLE` | 5xx / network | toast; content edits blocked, reviews continue |
| `NOTION_SCHEMA_MISMATCH` | property missing or wrong type | banner with [속성 복구] |
| `NOTION_ERROR` | anything else | generic toast; the Notion code goes to the log only |
| `VOCAB_REVIEW_CONFLICT` | `expected_reps` mismatch | toast + refetch |
| `AI_BUDGET_EXCEEDED`, `AI_OUTPUT_INVALID`, `AI_PROVIDER_ERROR` | existing | existing toasts, pool-aware text |

## 12. Security
- The OAuth `state` is bound to an httpOnly cookie and compared in constant time. The callback uses the session
  user only.
- Tokens are encrypted with AES-256-GCM and a random 12-byte IV. The ciphertext carries a version prefix for key
  rotation (rotation steps go in `docs/operations.md`).
- Notion ids from the client are validated as UUIDs and always re-checked against the user's own mirror rows. The
  gateway is called only with the session user's connection.
- `createAdminClient()` is used only by `/api/internal/jobs/*` (vocab-sync and notifications), with an explicit
  `user_id` filter on every query.
- Text from users and from Notion goes into prompts delimited and sanitized. AI output never reaches Notion
  without a user action.
- New env vars are server-only. Nothing Notion-related gets a public prefix.
- Advisors (security) run after the migration.

## 13. Testing
- **Unit (vitest):**
  - `srs` (a known sequence of ratings against ts-fsrs, preview labels);
  - `queue` (caps, sibling bury, interleave, scope, timezone edge at local midnight);
  - `status`, `buckets`, `streak` (DST week in America/Toronto);
  - `notion-mapping` both ways, including missing or renamed properties;
  - `answer-match`, `word-diff`, `bulk-parse`, `crypto` round-trip and tamper detection;
  - the budget pools;
  - prompt output validators (unknown ids, missing words, no Hangul);
  - the `vocab_due` rule.
- **Services** against `FakeNotionGateway`: create/update/delete write-through, pull with the overlap window and
  partial failure, the status round trip (§6.3), outbox coalescing and backoff, reconcile.
- **SQL (`supabase/tests/rls/vocab.sql`):** RLS isolation on every new table, `vocab_apply_review` (conflict,
  idempotency), `vocab_undo_review`, `vocab_create_word`, suspend. Each test runs in a transaction and ends with
  `rollback`.
- **E2E** as `e2e@kyodstack.test` with `NOTION_GATEWAY=fake`:
  - seed a connection and `[e2e]` words directly;
  - home buckets → review session with the keyboard (Space, 3, 1, Z) → reload shows the persisted state;
  - word edit through the drawer;
  - practice with seeded session items and a fake AI provider.

  The real Notion OAuth is checked by hand once per environment.
- The browser checks for UI changes use the next-devtools or Playwright MCP, as `AGENTS.md` requires.

## 14. Phases
Each phase has its own plan in `docs/superpowers/plans/` and its own checklist in `docs/progress.md`.

| Phase | Scope | Exit |
|---|---|---|
| **V0** | ADR 0046; env; `lib/notion` (gateway, client, fake, crypto, oauth, errors); migration `vocab_notion_connections` (later tables and RPCs arrive with their phase) + types + RLS tests + advisors; connect/callback routes; setup (pick a page → create the DB, repair schema); `/english` layout, tab bar, sidebar and dashboard entries, settings page (connection part) | a real Notion workspace connects, the DB is created with the §5.3 schema, and the settings page shows it |
| **V1** | word CRUD write-through; words page (table, filters, search, drawer, quick add without AI); pull, reconcile, outbox; nightly job `vocab-sync` | edits in either place appear in the other; trash in Notion removes the word from the app |
| **V2** | `srs`, `queue`, review screen, shortcuts, TTS, undo, 학습 완료 and the mature hint, outbox write-back of 상태 and 다음 복습; home today card and topic cards | the keyboard-only review E2E passes; Notion shows 상태 and 다음 복습 after a session |
| **V3** | due buckets and forecast, `vocab_due` push (notify-v2), stats page, streak and heatmap | push arrives once at the reminder time; stats match the SQL test fixtures |
| **V4** | budget pools; auto-fill (single and bulk); bulk add page | a 50-line paste with duplicates becomes words in Notion |
| **V5** | practice: set builder, CEFR rubric, generate, feedback, diff, history | the practice E2E with the fake provider passes; a live Gemini check of both schemas is recorded in the ADR |
| **V6** (optional) | planner XP: a day with completed vocab reviews is an XP source for users who opted into gamification | as in ADR 0016 rules |

## 15. Risks and checks
- **Notion OAuth token lifetime** is not documented. The client handles both a static token and refresh on 401
  (§5.2). V0 records what Notion actually returns.
- **Public integration requirements.** Notion asks public integrations for website, privacy and terms URLs. V0 adds
  minimal public pages if they are required. The integration does not need to be listed in Notion's gallery.
- **Rate limits across serverless instances.** The in-process throttle is per instance, so concurrent instances
  can still hit 429. Retry-After handling and the outbox make this safe, only slower.
- **Pull cost with large DBs.** Reconcile reads every id nightly, which is about 1 request per 100 words and fine
  below 10,000 words. The 10,000-result query cap is logged if it is ever reached.
- **Notion's 학습 완료 vs the app's derived status** can disagree briefly between a pull and the next outbox flush.
  §6.3 defines who wins: the user's change in Notion first, then the app's derived value.

## 16. Out of scope (roadmap)
- saving expressions from practice feedback into the word list;
- a dedicated hard-words page (v1 has the "hard" practice source only);
- Notion webhooks for near-real-time pulls;
- mapping an existing, user-designed Notion DB;
- the FSRS parameter optimizer;
- offline review;
- languages other than English;
- sharing word lists between users.
