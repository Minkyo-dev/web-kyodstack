# 0031 — A dedicated E2E user

- Status: accepted
- Date: 2026-10-01

## Context
E2E signed in as the owner's real account. `[e2e]`-prefixed rows were cleaned up afterwards, but the specs still ran
against real data:
- Setting an `[e2e]` directive archived the owner's real one.
- Finance specs created rows inside the real household.
- `finance-bulk.spec.ts` broke when the owner deleted a seeded category ("장보기") the spec relied on.

## Decisions
1. E2E runs as its own Supabase Auth user, `e2e@kyodstack.test`. The private routes accept any signed-in user and
   RLS scopes the data, so no grants are needed. The `handle_new_user` trigger bootstraps its profile (Toronto
   timezone) and scheduler settings.
2. The user was created directly in `auth.users` / `auth.identities` with a confirmed email, so no confirmation mail
   is ever sent. `.test` is a reserved TLD and can never receive mail.
   - The password was generated locally and stored only in the git-ignored `.env.local` (`E2E_EMAIL`,
     `E2E_PASSWORD`).
   - Only its bcrypt hash was sent to the database.
3. `credentials()` in `tests/e2e/helpers.ts` refuses to run unless `E2E_EMAIL` ends in `.test`. Running against a
   real account needs an explicit `E2E_ALLOW_REAL_ACCOUNT=1`.
4. The `[e2e]` prefix and cleanup stay. Runs still need to be repeatable, and the prefix still marks test data.
5. The test user has no household of its own. The finance specs create `[e2e] 가계`, and `cleanupFinance` deletes it.

## Consequences
- The owner's scheduler, direction and finance data are no longer touched by E2E.
- Specs must not depend on data they did not create. `finance-bulk.spec.ts` now creates its own categories.
- To recreate the user (e.g. on a new project), use the Supabase dashboard (Authentication → Add user, auto-confirm),
  or repeat the SQL insert with a fresh bcrypt hash. Then update `.env.local`.
