# Finance: monthly category budgets

- Date: 2026-10-01
- Sub-project B of the finance upgrade (A, balances, is ADR 0032; C, analytics, follows). Goals are out of scope.
- ADR: 0033

## Intent
The household records what it spends but cannot tell how much it may still spend this month. The user chose:
- a monthly budget per top-level expense category; the month's total budget is their sum;
- a default budget plus optional per-month amounts. A change to the default applies from the current month, and past
  months keep their amounts;
- display integrated into the dashboard and the calendar, with no new tab and no warning on entry. Budgets are edited
  in Settings → 예산.

## 1. Data and calculation
- **Table `finance_budgets`**
  - Columns: `id`, `household_id`, `category_id`, `month date` (the 1st), `kind` (`DEFAULT` | `MONTH`),
    `amount numeric(14,2)` (null = "no budget from this month"; otherwise > 0), `created_by_user_id`, `created_at`,
    `updated_at`.
  - Unique on `(household_id, category_id, kind, month)`.
  - Composite FK `(category_id, household_id)`.
  - Check: `month` is the first day of its month.
  - A trigger requires a top-level (`parent_id is null`), non-deleted EXPENSE category.
  - Membership RLS for select, insert, update and delete. A trigger keeps `household_id` and `created_by_user_id`
    unchanged.
- **Budget of month M** — `finance_month_budgets(p_household, p_month)` returns `(category_id, amount, is_override,
  default_amount)`:
  - the MONTH row for M if there is one, else the latest DEFAULT row with `month ≤ M`;
  - null amounts are dropped;
  - only categories that are currently top-level, non-deleted EXPENSE categories are kept (archived ones count);
  - the caller must be a member (42501).
- **Spending** comes from the existing `finance_category_totals(p_household, from, to)`: expense − refund,
  subcategories rolled into their parent. Subscription charges are ordinary expenses, so they count.
- **Derived values** (`domain/budgets.ts`, pure)
  - Per category: `spent`, `budget`, `remaining = budget − spent`, `ratio = spent / budget`, and a status:
    `ok` below 0.8, `warning` from 0.8 to 1.0, `over` above 1.0.
  - Totals: the budget total; the spending in budgeted categories; the spending outside any budget.
  - Pace (current month only): `expected = total × elapsedDays / daysInMonth`, where `elapsedDays` counts today;
    `paceDelta = spentBudgeted − expected`; `perDay = max(0, total − spentBudgeted) / remainingDays`, where
    `remainingDays` counts today.
  - Yearly budget: the sum of each month's budgets, January through the current month for the current year and all
    12 months for a past year.
- **Editing rules**
  - Setting the default writes (upserts) a DEFAULT row at the current month. Clearing it writes a DEFAULT row with
    a null amount.
  - Month overrides may be set or cleared ("되돌리기" deletes the MONTH row) only for the current month or later.
  - Past months are read-only. "Current" uses the household timezone.

## 2. Settings → 예산 (`/finance/settings/budgets`)
- A new settings tab: 계좌 · 카테고리 · 예산 · 가계 구성원.
- Month navigation, defaulting to the current month. Past months are read-only.
- One row per top-level expense category, in category order with its icon. Columns:
  - 기본 예산: inline input, saved on blur or Enter, with the toast "M월부터 적용됩니다";
  - 이 달: "기본 적용", or the override with an "이 달만" badge and a "되돌리기" button; "이 달만 변경" opens an input;
  - 지난 3개월 평균 지출: the average over the 3 months before the viewed month, or "—" when there is none.
- A footer row with the month's total budget and the total 3-month average.
- Empty state: an explanation. Each input's placeholder shows the 3-month average.
- On a phone the rows become stacked cards. There is no horizontal page scroll.

## 3. Dashboard and calendar
- **Dashboard, monthly**: the category section merges budgets.
  - Header line: "10월 예산 $X 중 $Y 사용 (N%) · 남은 $Z" (or "초과 $Z") "· 예산 외 지출 $W", and a "예산 설정" link.
  - Budgeted categories:
    - the bar is scaled to the budget, and the part over the budget is hatched;
    - the text reads "$742 / $800 · 남은 $58" or "· 초과 $42", plus a status word ("주의" or "초과");
    - they are listed even when nothing has been spent.
  - Unbudgeted categories keep the share-of-total bar, labelled "예산 없음".
  - Order: budgeted categories by ratio (highest first), then unbudgeted ones by amount.
- **Dashboard, yearly**: the same, using the yearly budget. The header reads "2026년 예산(1–10월) …".
- **Calendar**: a "이번 달 예산" card under the calendar, above 자산 흐름.
  - Current month:
    - a total bar with an "오늘까지 적정" marker;
    - "적정 페이스보다 $X 더/덜 썼습니다";
    - "남은 N일 동안 하루 $Y";
    - up to 3 categories that are warning or over, or "모든 카테고리가 예산 안입니다".
  - Past month: the final result and the categories over budget, without pace.
  - Future month: the budget amounts only.
  - With no budget at all, a single line with a "예산 설정" link.

## 4. Errors, security, tests
- **Validation**
  - Zod: the amount is > 0 with at most 2 decimals, and empty means no budget; the month is `yyyy-MM`.
  - Past months are rejected with "지난 달 예산은 바꿀 수 없습니다".
  - The category is checked by the service and the trigger.
  - The household always comes from the membership.
- **Errors**: when budgets fail to load, the category spending and the calendar still render, with a one-line
  notice in place of the budget parts. DB errors map to `AppError`.
- **Unit tests**: status thresholds, remaining and over, outside-budget spending, pace and per-day (first and last
  day, past and future months), yearly range, ordering, schema.
- **RLS tests**:
  - the default → override → default-change sequence resolves correctly per month, and past months keep the old
    default;
  - a null "no budget" row;
  - subcategory, income and cross-household categories are rejected;
  - another household can neither read nor write.
- **E2E** (`finance-budgets.spec.ts`): set a default and an override; record an expense; check the dashboard
  figures and status word and the calendar card; check that "되돌리기" restores the default.
- Browser check of settings, dashboard and calendar, wide and phone, with no horizontal scroll.
