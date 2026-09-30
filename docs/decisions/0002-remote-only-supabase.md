# 0002. Remote-only Supabase with SQL RLS tests
- Status: accepted
- Date: 2026-09-29

## Context
The owner chose to develop directly against the remote project `xgjmfmypoadblvzlmfqh`
rather than run a local Docker stack. The spec requires RLS tests (§49.3).

## Decision
- Migrations are written to `supabase/migrations/` and applied through the Supabase MCP (`apply_migration`).
- RLS tests are plain SQL files in `supabase/tests/rls/`. Each one:
  `begin` → creates two fake `auth.users` → switches to `set local role authenticated` with
  `request.jwt.claims` → asserts visibility and denial with `DO` blocks that `raise exception` on failure → `rollback`.
  So they leave no data behind on the remote DB.
- Run them with MCP `execute_sql`, or with `psql "$SUPABASE_DB_URL" -f <file>` when a DB URL is available.

## Consequences
There is no disposable DB. A migration mistake hits the real project, so keep migrations small and additive.
CI can run the same SQL files once a DB URL secret exists.
