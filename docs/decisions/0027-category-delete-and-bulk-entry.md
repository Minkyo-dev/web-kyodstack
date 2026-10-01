# 0027 — Logical category delete and the bulk entry grid

- Status: accepted
- Date: 2026-10-01

## Context
The user asked for (1) a delete button next to "보관" in category settings that deletes logically, and (2) a way to
enter many expenses and income at once with the keyboard, like a spreadsheet, instead of one form per transaction.
Spec §25 says "archive rather than delete"; this ADR records the deviation.

## Decisions
1. **Logical delete** is a new column `finance_categories.deleted_at` (migration `finance_category_soft_delete`).
   - A deleted category is also inactive (check constraint). A trigger rejects every later update of a deleted row,
     so it cannot be restored, renamed, moved or reordered. Only a household cascade removes the row.
   - The row stays: past transactions keep their category, its label still shows, and the totals are unchanged.
   - It leaves settings, the transaction pickers and the transactions filter. When an old transaction that uses it is
     edited, it stays selectable for that transaction, the same rule as for archived categories.
   - Deleting a parent deletes its children too, like archive does. The UI asks for confirmation first because the
     delete cannot be undone.
2. **Bulk entry** is a page, `/finance/transactions/bulk`. Both the finance header and the "여러 건 입력" button link
   to it.
   - Columns: date, type, amount, category, account, merchant, payer, note. Rows can be expense, income or transfer.
     On a transfer row the category cell holds the receiving account and the account cell the sending one. Each
     transfer gets its own `transfer_group_id`.
   - Every cell is free text. Picker cells (type, category, account, payer) suggest options as you type (prefix
     matches first; a subcategory also matches by its own name). They resolve to an id when the row is checked.
   - Dates accept loose forms relative to today, such as `10/3`, `3`, `10월 3일` and `어제`.
   - The suggestion list is fixed-positioned so it can escape the grid's scroll box. It follows its cell when the page
     scrolls and closes only when the cell leaves the screen. Scrolling inside the list is ignored.
   - Keyboard:
     - Enter moves down, and adds a row from the last row.
     - Tab moves to the next cell, and adds a row from the last cell.
     - Arrow keys move between cells. Left and right move only at the edge of the text.
     - Alt+↓ opens the suggestions.
     - Ctrl+D copies the cell above.
     - Ctrl+Enter saves.
   - A tab-separated block pasted from Excel or Sheets fills the grid from the focused cell. A copied header row is
     skipped.
   - The grid starts empty and has no default rows. "행 추가" (or Enter on the last row) adds a row. A new row copies
     date, type, account and payer from the row above, or from the last saved row. The payer follows the account's
     owner until the user types it. After a save the grid is empty again.
   - Saving drops blank rows first, so the row numbers in messages match the grid. Rows are checked in the browser
     (`domain/bulk-entry.ts`) and the problems are listed. The server then re-validates
     (`createTransactionsSchema`, at most 200 rows). It loads the references once and inserts all rows in one
     statement, so either every row is saved or none is.
   - The single and bulk paths share one reference check (`loadReferences` / `checkReferences`).

## Consequences
- An unused category can still be hard-deleted by the E2E cleanup (no FK references). The UI never hard-deletes.
- The bulk grid is desktop-first. On a phone it scrolls horizontally; the single form remains the mobile path.
