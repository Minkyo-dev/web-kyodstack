# 0035 — Recording refunds

- Status: accepted
- Date: 2026-10-01

## Context
The schema and the cash-flow rule have supported `REFUND` since ADR 0025: it takes an expense category and counts as
`expense − refund`. But the add form and the bulk grid offered only expense, income and transfer (spec §21 MVP), so
a refund could not be entered.

## Decisions
1. **Refund is an entry type** in the add/edit form (a fourth option, "환불") and in the bulk grid ("환불", aliases
   `r`, `refund`, `환`).
   - It needs an amount, an account (the one the money came back to), a date and an **expense** category, the same
     list as an expense.
   - `categoryTypeOf` maps REFUND to EXPENSE for the pickers and for the service's category check. The DB trigger
     already enforced this.
   - The labels are "환불한 곳" and "환불받은 사람".
   - The form explains that a refund comes off that category's spending.
   - The bulk footer shows a refund total.
2. **"환불 기록" from an expense.** An expense's detail has a button that opens the form as a refund:
   - prefilled from the expense: category, account (if it is still active), merchant, payer and the full amount;
   - dated today.

   After the save, the panel shows the new refund.
3. **No link to the original expense.** A refund is a standalone row. Linking would need a column and rules for
   partial or multiple refunds. Category and merchant carry over, and that is enough for the totals.

## Consequences
- Category totals, budgets (ADR 0033) and the dashboard already subtract refunds. Nothing else changed.
- A refund larger than that period's spending in the category can push the category's net spending below zero. This
  is shown as is.
