# 0029 — Recurring payments (subscriptions)

- Status: accepted
- Date: 2026-10-01

## Context
Monthly and yearly payments (streaming, phone, insurance) were entered by hand every time. Spec §4 lists "Recurring"
as a later section, and §41 defers *subscription detection*. This ADR adds manually registered recurring payments. It
does not detect them.

## Decisions
1. **A plan, not a transaction type.** `finance_subscriptions` holds name, amount, cycle (`MONTHLY` / `YEARLY`), billing
   day (1–31), billing month (yearly only), start and optional end date, account, expense category, payer and note.
   On each due date one ordinary `EXPENSE` transaction is written with `source = 'SUBSCRIPTION'` and
   `subscription_id`. The dashboard, calendar, day panel and search need no special case, and a charge can be edited
   or deleted like any other transaction.
2. **Due dates.** If a month is shorter than the billing day, the charge falls on its last day, so 31 means the month
   end. The SQL function and `domain/subscription.ts` (`dueDateIn`, `nextDueDate`) use the same rule.
3. **Charging** is `private.finance_charge_subscriptions(household)`, exposed as `public.finance_charge_subscriptions`:
   - It records every due date after `charged_through` (or from the start date) up to today, in the household's
     timezone, and up to the end date. Then it advances `charged_through`.
   - A unique index on `(subscription_id, transaction_date)` and `on conflict do nothing` make it idempotent, even
     when two runs overlap.
   - A member may call it for their own household, and the service role for any household. Anyone else gets `42501`.
   - It runs:
     - after a plan is created, edited or resumed;
     - in `getFinanceContext` on every finance page load, before the page reads totals (a failure is logged and
       the page still renders);
     - from the daily job `/api/internal/jobs/finance-subscriptions` (09:00 UTC), so charges appear even if nobody
       opens the app.
4. **Back-fill.** A new plan with a past start date records every charge from that date to today. The form warns
   about this, and the toast reports the count.
5. **Pause, resume, edit and delete.**
   - Pausing sets `is_active = false`.
   - Resuming moves `charged_through` up to yesterday, so the paused period is never back-filled. A charge due today
     is still recorded.
   - An edit applies only to future charges.
   - Deleting a plan keeps its past charges, and the FK clears their `subscription_id`.
   - Deleting a charged transaction does not bring it back, because `charged_through` has already passed that date.
6. **UI**: a new finance tab, `/finance/recurring` ("정기 결제"):
   - active plans with their schedule, account, category, amount and next due date;
   - a monthly-equivalent total, with a yearly amount counted as amount / 12;
   - paused and ended plans in their own section;
   - add/edit form, pause/resume, and delete behind a confirmation.
7. **Integrity**: membership RLS like the other finance tables. Composite FKs keep the account, category and payer
   inside the household. A trigger requires an expense category, and another keeps `household_id` and
   `created_by_user_id` from changing.

## Consequences
- Charges are recorded in advance only up to today. Future charges are not projected on the calendar.
- A plan with no active account or category can still charge: the FK keeps it valid, and the user is expected to
  edit or pause the plan.
