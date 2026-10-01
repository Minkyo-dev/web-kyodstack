# 0032 — Account balances by reconciling, net worth and the month's asset flow

- Status: accepted
- Date: 2026-10-01
- Design: `docs/superpowers/specs/2026-10-01-finance-balances-design.md` (sub-project A of the finance upgrade)

## Context
The household could see its cash flow but not where it stands: account balances, net worth, card debt and what is
still due this month. The spec's `initial_balance` column existed but was never used.

## Decisions
1. **Balances are computed from transactions and corrected by reconciling.**
   - Reconcile takes the real balance on a date. `finance_reconcile_account` records the difference from the
     computed balance as one `ADJUSTMENT` (`source = 'SYSTEM'`, "잔액 맞추기").
   - The first reconcile is the opening balance. `initial_balance` stays unused.
   - Alternatives rejected:
     - an opening balance plus an as-of date, which gives two mechanisms, and moving the date rewrites history;
     - a balance-snapshot table, which hides where a gap came from and complicates the daily series.
2. **Effects.**
   - INCOME `+`, EXPENSE `−`, REFUND `+`.
   - TRANSFER is `−` on the source account and `+` on the target.
   - ADJUSTMENT keeps its sign.
   - Cards and loans are negative while money is owed. The UI takes the amount owed as a positive number and shows
     "갚을 돈 $X".
3. **SQL owns the numbers.**
   - `finance_account_balances(household, as_of)` and `finance_daily_balances(household, from, to)` are security
     invoker and member-checked (42501). They share `private.finance_balance_effects`.
   - `finance_reconcile_account` locks the account row, rejects future dates (22023) and returns the difference.
   - TypeScript only combines the results (`domain/balances.ts`): net worth, liquid assets, card debt, the series,
     the forecast and the month table.
4. **`finance_accounts.reconciled_on`** records the last reconcile, even when the balance already matched and
   nothing was written. Deriving it from adjustments would leave a correct $0 account "never reconciled" forever.
   This column is the one deviation from the design doc, which said no schema change.
5. **Adjustments stay out of cash flow**, as before, so reconciling never changes the spending figures. Trade-off:
   an expense that was never recorded is absorbed by the adjustment instead of showing as spending. The dialog says
   so.
6. **UI.**
   - Dashboard "재정 현황":
     - balances at the period end, or today while the period is current;
     - tiles for net worth, liquid assets, card debt, and the subscriptions still due this month (current month
       only);
     - grouped account rows with reconcile buttons;
     - an empty state until the first reconcile.
   - Settings → Accounts shows each balance with a reconcile button.
   - Calendar "자산 흐름" under the calendar:
     - a daily net-worth line, solid up to today and dashed after it with the subscription charges applied;
     - clicking a day selects it like a calendar cell;
     - a per-account table (opening, in, out, adjustment, closing), with fewer columns in narrow containers.

## Consequences
- An account's balance is only as right as its records plus its last reconcile. Accounts never reconciled are marked
  "맞춘 적 없음".
- E2E cleanup also removes adjustments on `[e2e]` accounts, which are not `[e2e]`-named.
- Two pre-existing phone overflows were fixed along the way:
  - the bulk grid's `sr-only` span escaped its scroller (the scroller is now `relative`);
  - the dashboard's category list made its grid column wider than the screen (`grid-cols-1`).
