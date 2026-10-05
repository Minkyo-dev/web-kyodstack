# 0046. 단어장: Notion as the word table, FSRS in Supabase
- Status: proposed (accepted when V0 lands)
- Date: 2026-10-05
- Spec: docs/superpowers/specs/2026-10-05-vocab-notion-design.md
- Amends: ADR 0018 (AI budget gets pools), ADR 0043 (notify rules gain `vocab_due`)

## Context
The owner wants a vocabulary utility in which each user's own Notion database is the word table. On top of it
come flashcards with forgetting-curve reminders and AI translation practice at a chosen CEFR level. The Notion API
allows about 3 requests per second and returns 100 rows per page. A review queue, stats and the RLS rules in
`AGENTS.md` all need fast, local, typed data.

## Decision
1. **Notion is the source for word content, Supabase mirrors it** (`vocab_words`).
   - App edits write through to Notion first and only the changed properties are PATCHed. The returned page is
     upserted.
   - Notion edits are pulled incrementally by `last_edited_time`, with a 2-minute overlap for minute rounding.
   - Deletions are found by a nightly id reconcile.
2. **Supabase is the source for the learning state** (`vocab_cards`, `vocab_reviews`).
   - Only `상태` and `다음 복습` are written back to Notion, through a coalescing outbox.
   - Choosing 학습 완료 in Notion suspends the word in the app.
3. **Public OAuth per user.** Access and refresh tokens are stored AES-256-GCM encrypted (`NOTION_TOKEN_KEY`) in
   `notion_connections`. The app creates the Notion DB with a fixed schema, and properties are tracked by id.
4. **FSRS via `ts-fsrs`** (pinned) behind `features/vocab/domain/srs.ts`. Every word has two cards, recognition and
   recall. A review is applied atomically by `vocab_apply_review`, which uses an optimistic `reps` check and an
   idempotent `client_review_id`.
5. **AI budget pools.** `callAi` takes a pool. `vocab.*` calls have their own 60 per local day, and the existing 30
   stays for everything else. Practice output is advice: AI output never reaches Notion without a user action.
6. **Notion access goes through a `NotionGateway` interface** with a fake implementation for tests and E2E
   (`NOTION_GATEWAY=fake`, refused in production).

## Consequences
- New server env: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, `NOTION_TOKEN_KEY`.
- A Notion public integration must be registered, with its redirect URI and possibly website, privacy and terms
  URLs.
- Notion-side edits appear in the app with a delay of up to 5 minutes, on page entry or on [지금 동기화], until
  webhooks are added.
- Reviews keep working when Notion is down. Write-backs wait in the outbox.
- A new nightly job `vocab-sync`.
