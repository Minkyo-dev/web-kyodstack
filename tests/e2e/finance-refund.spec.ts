import { expect, test, type Page } from "@playwright/test";
import { cleanupFinance, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0035: refunds in the add form (expense categories, taken off that day's spending), "환불 기록" from an expense's
// detail (prefilled from the expense), and refund rows in the bulk grid. Uses March 2099 so real data never mixes in.
const DAY = "2099-03-10";
const CARD = `${E2E_PREFIX} 환불카드`;
const SPEND = `${E2E_PREFIX} 환불쇼핑`;
const STORE = `${E2E_PREFIX} 환불상점`;

async function ensureHousehold(page: Page) {
  const db = await dbAsUser();
  const uid = (await db.auth.getUser()).data.user!.id;
  const { data } = await db.from("finance_household_members").select("household_id").eq("user_id", uid).maybeSingle();
  if (data) return data.household_id as string;
  await page.goto("/finance");
  const create = page.getByRole("form", { name: "새 가계 만들기" });
  await create.getByLabel("가계 이름").fill(`${E2E_PREFIX} 가계`);
  await create.getByRole("button", { name: "만들기" }).click();
  await expect(page.getByRole("navigation", { name: "가계부" })).toBeVisible();
  const again = await db.from("finance_household_members").select("household_id").eq("user_id", uid).single();
  return again.data!.household_id as string;
}

test.describe("finance refunds", () => {
  // Below xl the calendar opens the Day Drawer (finance.spec).
  test.use({ viewport: { width: 1200, height: 900 } });
  test.beforeAll(async () => cleanupFinance(await dbAsUser()));
  test.afterAll(async () => cleanupFinance(await dbAsUser()));

  test("add form, refund from an expense, bulk grid", async ({ page }) => {
    await login(page);
    const householdId = await ensureHousehold(page);
    const db = await dbAsUser();
    const { data: category } = await db
      .from("finance_categories")
      .insert({ household_id: householdId, name: SPEND, type: "EXPENSE" })
      .select("id")
      .single();
    await page.goto("/finance/settings/accounts");
    await page.getByRole("button", { name: "계좌 추가" }).click();
    const accountForm = page.getByRole("form", { name: "새 계좌" });
    await accountForm.getByLabel("이름").fill(CARD);
    await accountForm.getByLabel("종류").selectOption("CREDIT_CARD");
    await accountForm.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: CARD })).toBeVisible();

    // A $100 expense, then a $5 refund on the same day: the day's spending is $95.
    await page.goto(`/finance/calendar?month=2099-03&date=${DAY}`);
    const drawer = page.getByRole("dialog");
    const add = async (fill: (form: ReturnType<typeof drawer.getByRole>) => Promise<void>) => {
      await drawer.getByRole("button", { name: "이날 거래 추가" }).click();
      const form = drawer.getByRole("form", { name: "거래 추가" });
      await fill(form);
      await form.getByRole("button", { name: "저장" }).click();
      await expect(drawer.getByRole("button", { name: "이날 거래 추가" })).toBeVisible();
    };
    await add(async (form) => {
      await form.getByLabel("금액").fill("100");
      await form.getByLabel("카테고리").selectOption({ label: SPEND });
      await form.getByLabel("계좌", { exact: true }).selectOption({ label: CARD });
      await form.getByLabel("가맹점 (선택)").fill(STORE);
    });
    await add(async (form) => {
      await form.getByRole("radio", { name: "환불" }).click();
      await expect(form.getByText("환불은 지출 카테고리에 기록되고")).toBeVisible();
      await form.getByLabel("금액").fill("5");
      // Only expense categories are offered.
      await form.getByLabel("카테고리").selectOption({ label: SPEND });
      await form.getByLabel("계좌", { exact: true }).selectOption({ label: CARD });
      await form.getByLabel("환불한 곳 (선택)").fill(`${E2E_PREFIX} 환불 직접`);
    });
    const totals = drawer.getByLabel("이날 합계");
    await expect(totals).toContainText("-$95");

    // "환불 기록" on the expense starts a refund with its category, account, merchant and amount.
    await drawer.getByRole("button", { name: new RegExp(STORE.replace(/[[\]]/g, "\\$&")) }).click();
    await drawer.getByRole("button", { name: "환불 기록" }).click();
    const refund = drawer.getByRole("form", { name: "환불 기록" });
    await expect(refund.getByRole("radio", { name: "환불" })).toHaveAttribute("aria-checked", "true");
    await expect(refund.getByLabel("금액")).toHaveValue("100");
    await expect(refund.getByLabel("카테고리")).toHaveValue(category!.id);
    await expect(refund.getByLabel("환불한 곳 (선택)")).toHaveValue(STORE);
    await refund.getByLabel("금액").fill("30");
    await refund.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("환불을 기록했습니다.")).toBeVisible();
    // The panel now shows the new refund.
    await expect(drawer.getByText("+$30")).toBeVisible();

    // Bulk grid: a "환불" row with an expense category.
    await page.goto("/finance/transactions/bulk");
    const grid = page.getByRole("table", { name: "여러 건 입력" });
    await page.getByRole("button", { name: "행 추가" }).first().click();
    const tsv = ["2099-03-11", "환불", "12", SPEND, CARD, `${E2E_PREFIX} 환불 bulk`].join("\t");
    await grid.getByLabel("1행 날짜").evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, tsv);
    await expect(page.getByText(/환불 \$12/)).toBeVisible();
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.getByText("1건을 저장했습니다.")).toBeVisible();

    const { data: refunds } = await db
      .from("finance_transactions")
      .select("amount, merchant_name, category_id, transaction_date")
      .eq("type", "REFUND")
      .like("merchant_name", `${E2E_PREFIX} 환불%`)
      .order("amount");
    expect(refunds?.map(({ amount, merchant_name, category_id }) => ({ amount, merchant_name, category_id }))).toEqual([
      { amount: 5, merchant_name: `${E2E_PREFIX} 환불 직접`, category_id: category!.id },
      { amount: 12, merchant_name: `${E2E_PREFIX} 환불 bulk`, category_id: category!.id },
      { amount: 30, merchant_name: STORE, category_id: category!.id },
    ]);
  });
});
