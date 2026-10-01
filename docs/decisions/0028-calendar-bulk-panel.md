# 0028 — The finance calendar's day panel

- Status: accepted
- Date: 2026-10-01

## Context
The user asked for the bulk entry grid (ADR 0027) as a right-hand panel on the calendar tab. They then made the
panel's purpose seeing everything that happened on a day (all spending, income and transfers), and asked for it to be
wider.

## Decisions
1. **Layout**:
   - From `xl` (≥ 1280px) the calendar page is two columns. The calendar takes `minmax(20rem, 1fr)` and the sticky day
     panel takes `1.8fr`; the page has no max width.
   - Below `xl` the panel stacks under the calendar. It can be collapsed, and reopened ("일별 내역") from the calendar
     toolbar.
   - Calendar cells switch between compact and full amounts with a container query (`@xl`).
2. **Day panel** (`DayPanel`) always shows one day: the selected day, else today in the month, else the 1st. ‹ › move
   a day at a time, across months. It contains:
   - the day's income, expense and net, from the same calendar aggregate;
   - a table of every transaction that day (income first, then expenses and refunds, then transfers). A row opens the
     transaction detail sheet (edit, delete), and the panel refreshes after a change;
   - the entry grid (compact: date, type, amount, category or receiving account, account, merchant). The payer
     follows the account's owner. New rows take the panel's day. Rows not typed into yet follow the panel when the day
     changes; typed rows keep their date. After a save the day list reloads and the totals revalidate.
3. **Day click**:
   - When the panel is beside the calendar, a click shows that day in the panel, highlighted with a ring. The Day
     Drawer is not used there; a `?date=` link opens the panel on that day.
   - When the panel is collapsed or stacked, the click opens the Day Drawer as before (spec §17). The Day Drawer and
     the panel load a day's rows through one hook, `useDayTransactions`.
4. Dates show as `M/D` in the current year and as `yyyy-MM-dd` otherwise, so the text always parses back the same.

## Consequences
- `finance.spec.ts` (the Day Drawer flow) runs at 1200px width; the panel flow is covered in `finance-bulk.spec.ts`.
