# Finance: account balances, net worth and the month's asset flow

- Date: 2026-10-01
- Sub-project A of the finance upgrade. B (budgets) and C (analytics) follow. Goals are out of scope.
- ADR: 0032

## Intent
The household cannot see where its finances stand: account balances, net worth, card debt, and what is still due
this month. The user chose:
- balances computed from transactions, corrected now and then against the real balance ("reconcile");
- a "재정 현황" (financial position) section on the dashboard (no new tab);
- under the calendar, the month's asset flow: a daily net-worth chart plus a per-account table.

## 1. Calculation and data (no new table)
- **Effect of a transaction on an account's balance**
  - INCOME: `+amount`
  - EXPENSE: `−amount`
  - REFUND: `+amount`
  - TRANSFER: `−amount` on `account_id`, `+amount` on `transfer_account_id`
  - ADJUSTMENT: `+amount` (signed)
- **Balance of an account on date D** = the sum of those effects over its transactions dated ≤ D.
  - There is no separate opening balance: the first reconcile is the opening balance. `initial_balance` stays
    unused.
  - Credit cards and loans are negative while money is owed.
- **SQL functions** (member-checked inside; another household gets 42501):
  - `finance_account_balances(p_household, p_as_of)` returns `(account_id, balance, last_reconciled date|null)`
    for every account, archived accounts included.
  - `finance_daily_balances(p_household, p_from, p_to)` returns `(day, account_id, balance, inflow, outflow,
    adjustment)` for each day in `[from, to]` and each account.
    - The balance is the running balance at the end of the day.
    - `inflow` and `outflow` are the day's non-adjustment effects (positive and negative, as absolute values).
      `adjustment` is the day's adjustment total.
  - `finance_reconcile_account(p_account, p_date, p_actual)` locks the account row and computes the balance on
    `p_date`.
    - When the difference is not zero, it inserts one ADJUSTMENT transaction (`source = 'SYSTEM'`,
      `merchant_name = '잔액 맞추기'`, `created_by = auth.uid()`) dated `p_date`.
    - It returns the difference (0 means nothing was written).
    - It rejects future dates.
- **Derived numbers** (pure TypeScript, `domain/balances.ts`):
  - net worth = Σ all balances;
  - liquid = Σ CHECKING + SAVINGS + CASH;
  - card debt = Σ max(0, −balance) over CREDIT_CARD;
  - still due this month = Σ subscription charges with today < date ≤ month end.
    - `dueDatesBetween(plan, from, to)` in `domain/subscription.ts` generalises `nextDueDate`.
- Adjustments stay out of the cash-flow aggregates, so reconciling never changes the expense totals.

## 2. Reconcile dialog and the dashboard section
- **Reconcile dialog**
  - Opened from the dashboard's account rows and from Settings → Accounts.
  - Inputs: date (default today, no future) and actual balance. For CREDIT_CARD and LOAN the user types the amount
    owed as a positive number, which is stored negated.
  - It previews computed → actual → adjustment before saving, and explains that the difference is recorded as an
    adjustment, outside the spending figures.
  - The button reads "시작 잔액 설정" until the account has been reconciled once, and "잔액 맞추기" after that.
  - A zero difference saves nothing and says the balance already matches.
- **Dashboard "재정 현황"**, below the summary:
  - Four tiles: net worth, liquid, card debt (owed) and still due this month. The last tile appears only when
    viewing the current month.
  - Account rows grouped as in settings, with the balance, "M/D 맞춤" or "맞춘 적 없음", and a reconcile button.
  - Balances are as of the period end, or today while the period is current.
  - Empty state: when no account has ever been reconciled, an explanation and a start button.
- **Settings → Accounts**: each row shows its current balance and the reconcile button.

## 3. Calendar: the month's asset flow
- Placed under the calendar at every width. From xl it sits in the left column, beside the sticky day panel.
- **Chart**: the daily net worth (SVG, no library).
  - The header reads "순자산 $X · 월초 대비 ±$Y".
  - From day 1 to today the line is solid. After today it is dashed: today's net worth minus subscription charges
    on their due dates. A past month is all solid; a future month is all dashed.
  - Hovering or tapping a day shows a tooltip with the day's net worth and change.
  - Clicking a point selects the day, exactly like clicking a calendar cell. The selected day is marked by a
    vertical rule.
- **Table**: columns 계좌 · 월초 · 들어옴 · 나감 · (조정) · 월말/오늘.
  - 월초 is the balance at the end of the previous month.
  - The 조정 column appears only when the month has adjustments.
  - Rows are grouped. A total row shows only start, end and change, because transfers would double-count in and
    out.
  - Accounts that have never been reconciled are marked "맞춘 적 없음".
  - Archived accounts with zero balance and no activity that month are hidden.
- **Data**: the calendar page loads `finance_daily_balances` (previous month end → month end, clamped to today) and
  the active subscriptions. Transaction mutations already revalidate `/finance`.

## 4. Errors, security, tests
- **Validation** (Zod): a local date that is not in the future; an amount with at most 2 decimals, 0 allowed. The
  account must be in the caller's household, checked by the service and the DB function. Archived accounts can be
  reconciled.
- **Errors**: when the balance read fails, only the balance sections render an error line; the rest of the page
  still works. Errors map to `AppError`.
- **Unit tests**: balance effects, derived numbers, `dueDatesBetween`, the forecast series, owed → negative, and
  the schema.
- **RLS tests** (`finance.sql`):
  - the function outputs on a fixture with a transfer and an adjustment;
  - reconcile writes the exact difference, and a second run writes nothing;
  - another household is denied;
  - adjustments are excluded from cash flow.
- **E2E** (`finance-balances.spec.ts`, dedicated user):
  - set an opening balance, record an expense, and check the dashboard figures;
  - check the calendar table and that a chart click opens the day;
  - reconcile and check the adjustment is recorded.
- Browser check of the dashboard and the calendar (xl and narrow).
