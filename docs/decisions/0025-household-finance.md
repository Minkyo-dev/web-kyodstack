# 0025 — Household finance service

- Status: accepted
- Date: 2026-10-01

## Context
`docs/household-finance-design.md` adds a household (couple) finance utility next to the scheduler. The spec fixes the
data model, screens and aggregation rules but leaves a few things open: how the second member joins, how a transfer is
stored, how members see each other's names, and where the code lives in this repo.

## Decisions
1. **Joining a household: invite code.** Each `finance_households` row has an `invite_code` (10 hex characters). The
   first visit to `/finance` offers "create a household" (caller becomes `OWNER`, default categories are seeded in
   the same transaction) or "join with a code" (caller becomes `MEMBER`). The owner can rotate the code. Both are
   `SECURITY DEFINER` functions kept in the unexposed `private` schema; `public.finance_*_household` are invoker
   wrappers (advisor lint 0029).
2. **One household per user (MVP).** `unique (user_id)` on `finance_household_members`; every finance mutation gets
   the household from the membership row, never from the client.
3. **Display names live on the membership.** Members cannot read each other's `profiles` (own-row RLS), so
   `finance_household_members.display_name` is set on create/join and editable by its member only (column grant).
4. **RLS = membership.** `private.finance_is_member(household_id)` / `finance_is_owner` (definer, no recursion)
   back the policies on households, members, accounts, categories and transactions (spec §33).
5. **Integrity in the database as well as the service (spec §34).** Composite FKs `(account_id, household_id)`,
   `(transfer_account_id, household_id)`, `(category_id, household_id)`, `(household_id, paid_by_user_id)` →
   members and `(household_id, owner_user_id)` → members. Triggers enforce the two-level category tree and that the
   category's type matches the transaction (expense/refund → EXPENSE, income → INCOME), stamp `updated_by_user_id`
   and keep `created_by_user_id` unchanged.
6. **A transfer is one row.** `account_id` = from, `transfer_account_id` = to, no category, and a
   `transfer_group_id` for future two-legged imports. The sign always comes from `type`; `amount > 0` (only an
   `ADJUSTMENT` may be negative).
7. **One cash-flow rule, in SQL.** `finance_cash_flow` maps INCOME → income, EXPENSE → expense, REFUND → negative
   expense, and drops TRANSFER/ADJUSTMENT. `finance_daily_totals`, `finance_monthly_totals` and
   `finance_category_totals` (subcategories roll up into the parent) are built on it and used by the dashboard and the
   calendar alike. The form records only expense/income/transfer (spec §21); refunds count when they exist.
8. **Archive in the UI, delete only when unused.** Accounts and categories are archived (`is_active = false`) from the
   UI; archiving a parent category archives its children. A delete policy exists for E2E cleanup, but the foreign keys
   reject deleting anything still referenced. The owner may delete the household (cascade); there is no UI for it.
9. **Layout.** The code follows this repo's convention (`src/features/finance/{actions,components,domain,queries,
   schemas,services}`) instead of the spec §31 sub-feature folders. Routes: `/finance`, `/finance/calendar`,
   `/finance/transactions`, `/finance/settings/{accounts,categories,household}`. The household page is an addition
   needed for the invite code and display names.
10. **Charts without a library.** The cash-flow chart is a small SVG component (income/expense bars on one axis,
    hover tooltip, table view). Compact amounts are formatted by hand because Intl's compact notation differs
    between Node and the browser and broke hydration.

## Consequences
- A third member can join with the code; nothing is hard-coded to two people.
- Leaving a household or moving between households is not supported yet.
- Account balances, budgets, CSV import and multi-currency conversion are out of scope (spec §41); `initial_balance`,
  `source` and `transfer_group_id` exist so they can be added later.
