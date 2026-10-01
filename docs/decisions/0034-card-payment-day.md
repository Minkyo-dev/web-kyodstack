# 0034 — Credit card payment day

- Status: accepted
- Date: 2026-10-01

## Context
A card's balance only went back to 0 when the user recorded the payment by hand or reconciled it. The user wants to
set the day a card resets and the account that pays it, so the amount owed is 0 on that day.

## Decisions
1. **A real transfer, not a reset.** On the payment day, `finance_pay_cards` records one TRANSFER from the payment
   account to the card for the whole amount owed at the end of that day. The card ends the day at 0, the bank goes
   down by the same amount, and net worth does not move. The user chose this over:
   - an ADJUSTMENT that zeroes the card, which inflates net worth unless the bank side is entered by hand;
   - a display-only statement cycle, which leaves the balances unchanged.
2. **Settings on the account.** `finance_accounts` gets three columns:
   - `payment_day`: 1–31, CREDIT_CARD only. A shorter month pays on its last day, the same rule as subscriptions.
   - `payment_account_id`: same household, not the card itself. The form offers active non-card accounts.
   - `paid_through`: works like `charged_through` on subscriptions.

   The schema requires the day and the account together. Switching an account to another type drops both. Deleting
   the payment account sets the column to null, which stops the payments.
3. **No back-fill.** A trigger sets `paid_through` to yesterday (in the household timezone) whenever the day or the
   account changes, so a payment due today still runs. Past payment days are never paid retroactively.
4. **Runs like subscription charging (ADR 0029).** It runs on every finance page load (after the subscription
   charges, so a subscription billed to the card on its payment day is paid off too), after an account edit, and in
   the daily job `/api/internal/jobs/finance-subscriptions`. A unique index on `(transfer_account_id,
   transaction_date)` where `source = 'CARD_PAYMENT'` keeps it idempotent. The new source value marks these rows.
   The merchant is "<card> 카드 대금", so E2E cleanup removes the payments with the `[e2e]` card.
5. **Ordinary transactions.** A payment can be edited or deleted like any transfer. Deleting one does not bring it
   back, because `paid_through` has already passed that date.

## Consequences
- What is paid is the balance at the end of the payment day, not a statement amount. An expense backdated before a
  payment day that has already passed stays owed until the next payment day.
- When the user also records the payment by hand on that day, the card already owes nothing and no transfer is
  written. A hand-entered payment on another day leaves only the remainder for the payment day.
- An archived card stops paying. A payment account archived later keeps paying until the card is edited.
