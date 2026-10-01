import { expect, test, type Page } from "@playwright/test";
import { cleanupFinance, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0033: a default budget and a one-month amount in Settings → 예산, then the dashboard and the calendar card
// against a recorded expense; "되돌리기" restores the default. Uses its own top-level category so real names never
// matter. Runs as the dedicated E2E user.
const CATEGORY = `${E2E_PREFIX} 예산식비`;
const ACCOUNT = `${E2E_PREFIX} 예산카드`;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
const month = Number(today.slice(5, 7));

async function ensureHousehold(page: Page): Promise<string> {
  const db = await dbAsUser();
  const uid = (await db.auth.getUser()).data.user!.id;
  const { data } = await db.from("finance_household_members").select("household_id").eq("user_id", uid).maybeSingle();
  if (data) return data.household_id as string;
  await page.goto("/finance");
  const create = page.getByRole("form", { name: "새 가계 만들기" });
  await create.getByLabel("가계 이름").fill(`${E2E_PREFIX} 가계`);
  await create.getByRole("button", { name: "만들기" }).click();
  await expect(page.getByRole("navigation", { name: "가계부" })).toBeVisible();
  return (await db.from("finance_household_members").select("household_id").eq("user_id", uid).single()).data!.household_id as string;
}

test.describe("finance budgets", () => {
  test.beforeAll(async () => cleanupFinance(await dbAsUser()));
  test.afterAll(async () => cleanupFinance(await dbAsUser()));

  test("default and one-month budgets on the dashboard and calendar", async ({ page }) => {
    await login(page);
    const householdId = await ensureHousehold(page);
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const [{ data: category }, { data: account }] = await Promise.all([
      db.from("finance_categories").insert({ household_id: householdId, name: CATEGORY, type: "EXPENSE" }).select("id").single(),
      db
        .from("finance_accounts")
        .insert({ household_id: householdId, name: ACCOUNT, account_type: "CREDIT_CARD", ownership_type: "PERSONAL", owner_user_id: uid })
        .select("id")
        .single(),
    ]);

    // Default budget $500 from this month.
    await page.goto("/finance/settings/budgets");
    const row = page.getByRole("row", { name: CATEGORY });
    await row.getByLabel(`${CATEGORY} 기본 예산`).fill("500");
    await row.getByLabel(`${CATEGORY} 기본 예산`).press("Enter");
    await expect(page.getByText(`${month}월부터 적용됩니다.`)).toBeVisible();
    await expect(row).toContainText("기본 적용");

    // $450 spent: 90 % → "주의".
    const { error } = await db.from("finance_transactions").insert({
      household_id: householdId,
      type: "EXPENSE",
      amount: 450,
      account_id: account!.id,
      category_id: category!.id,
      transaction_date: today,
      merchant_name: `${E2E_PREFIX} 예산 지출`,
      created_by_user_id: uid,
    });
    expect(error).toBeNull();

    await page.goto("/finance");
    const summary = page.getByLabel("예산 요약");
    await expect(summary).toContainText("$500");
    await expect(summary).toContainText("$450");
    await expect(summary).toContainText("남은 $50");
    const item = page.getByRole("region", { name: "카테고리별 지출" }).getByRole("listitem").filter({ hasText: CATEGORY });
    await expect(item).toContainText("/ $500");
    await expect(item).toContainText("주의");

    await page.goto("/finance/calendar");
    const card = page.getByRole("region", { name: "이번 달 예산" });
    await expect(card).toContainText("$450");
    await expect(card).toContainText("/ $500");
    await expect(card.getByRole("list", { name: "주의할 카테고리" })).toContainText(CATEGORY);

    // This month only: $400 → over by $50.
    await page.goto("/finance/settings/budgets");
    await row.getByRole("button", { name: `${CATEGORY} ${month}월만 변경` }).click();
    await row.getByLabel(`${CATEGORY} ${month}월 예산`).fill("400");
    await row.getByLabel(`${CATEGORY} ${month}월 예산`).press("Enter");
    await expect(row).toContainText("이 달만");
    await page.goto("/finance");
    await expect(item).toContainText("초과");
    await expect(item).toContainText("초과 $50");

    // 되돌리기 → the default applies again.
    await page.goto("/finance/settings/budgets");
    await row.getByRole("button", { name: `${CATEGORY} ${month}월 금액 되돌리기` }).click();
    await expect(row).toContainText("기본 적용");
    const { data: rows } = await db.from("finance_budgets").select("kind, amount").eq("category_id", category!.id);
    expect(rows).toEqual([{ kind: "DEFAULT", amount: 500 }]);
  });
});
