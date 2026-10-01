# 0033 — Monthly category budgets

- Status: accepted
- Date: 2026-10-01
- Design: `docs/superpowers/specs/2026-10-01-finance-budgets-design.md` (sub-project B of the finance upgrade)

## Context
The household could see what it spent but not how much it may still spend. Spec §41 deferred budgets. The user chose
a monthly budget per top-level expense category, a default with optional per-month amounts, and display inside the
dashboard and the calendar. There is no budget tab and no warning on entry.

## Decisions
1. **`finance_budgets` stores versioned rows.**
   - A `DEFAULT` row applies from its `month` until a later DEFAULT. A `MONTH` row overrides one month. A null amount
     means "no budget".
   - Setting the default writes a DEFAULT row at the current month, so earlier months keep the amount they had.
   - Alternatives rejected:
     - copying rows every month, which needs a job and rewriting future rows when the default changes;
     - one current amount per category, which silently rewrites past months.
2. **`finance_month_budgets(household, month)` resolves a month** (member-checked).
   - It keeps only categories that are still top-level, non-deleted EXPENSE categories (archived ones count).
   - A category moved under another one drops out, and its spending rolls into the new parent as before.
3. **Spending reuses `finance_category_totals`** (expense − refund, subcategories rolled up). Subscription charges
   count like any expense.
4. **Status thresholds**: below 80 % is fine, 80–100 % "주의", above 100 % "초과". The status is always written as a
   word as well as shown in color.
5. **Pace** (calendar, current month only)
   - The expected amount by the end of today is total × elapsed days ÷ days in the month.
   - The amount left per day spreads what remains over the remaining days. Today counts in both.
6. **Editing**
   - Past months are read-only. "Current" uses the household timezone, checked by the service.
   - The default is edited only on the current month's screen.
   - One-month amounts are allowed for this month and later. "되돌리기" deletes the MONTH row.
7. **RLS and integrity**
   - Membership policies.
   - A trigger requires a top-level, non-deleted expense category, and another keeps the household and creator
     unchanged.
   - A cross-household write is rejected by the category trigger (23514) before RLS, because it cannot see the other
     household's category. Either way it is rejected and reveals nothing.

## Consequences
- The yearly dashboard sums each counted month's budget (up to 12 RPC calls).
- Budgets on deleted categories are ignored, not removed. Hard-deleting a category cascades its budgets.
