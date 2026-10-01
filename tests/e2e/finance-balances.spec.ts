import { expect, test, type Page } from "@playwright/test";
import { cleanupFinance, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0032: opening balances by reconcile, balances and net worth on the dashboard, the calendar's asset flow, and a
// later reconcile recording only the difference. Runs as the dedicated E2E user, whose household holds only E2E data.
const BANK = `${E2E_PREFIX} 잔액통장`;
const CARD = `${E2E_PREFIX} 잔액카드`;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

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

async function addAccount(page: Page, name: string, type: string) {
  await page.getByRole("button", { name: "계좌 추가" }).click();
  const form = page.getByRole("form", { name: "새 계좌" });
  await form.getByLabel("이름").fill(name);
  await form.getByLabel("종류").selectOption(type);
  await form.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
}

async function reconcile(page: Page, account: string, label: string, amount: string, expectToast: RegExp) {
  await page.getByRole("button", { name: `${account} ${label}` }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("계산된 잔액", { exact: true })).toBeVisible();
  await dialog.getByLabel(/실제 잔액|갚을 금액/).fill(amount);
  await expect(dialog.getByText("…")).toHaveCount(0);
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText(expectToast)).toBeVisible();
  await expect(dialog).toHaveCount(0);
}

test.describe("finance balances", () => {
  test.beforeAll(async () => cleanupFinance(await dbAsUser()));
  test.afterAll(async () => cleanupFinance(await dbAsUser()));

  test("opening balances, net worth, asset flow, reconcile", async ({ page }) => {
    await login(page);
    const householdId = await ensureHousehold(page);
    await page.goto("/finance/settings/accounts");
    await addAccount(page, BANK, "CHECKING");
    await addAccount(page, CARD, "CREDIT_CARD");

    // Opening balances: $1,000 in the bank, $200 owed on the card (entered as a positive amount owed).
    await reconcile(page, BANK, "시작 잔액 설정", "1000", /조정 \+\$1,000을 기록했습니다/);
    await reconcile(page, CARD, "시작 잔액 설정", "200", /조정 -\$200을 기록했습니다/);

    // A $50 expense from the bank today.
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const [{ data: bank }, { data: category }] = await Promise.all([
      db.from("finance_accounts").select("id").eq("name", BANK).single(),
      db.from("finance_categories").select("id").eq("household_id", householdId).eq("type", "EXPENSE").is("deleted_at", null).limit(1).single(),
    ]);
    const { error } = await db.from("finance_transactions").insert({
      household_id: householdId,
      type: "EXPENSE",
      amount: 50,
      account_id: bank!.id,
      category_id: category!.id,
      transaction_date: today,
      merchant_name: `${E2E_PREFIX} 잔액 지출`,
      created_by_user_id: uid,
    });
    expect(error).toBeNull();

    // Dashboard: net worth 1000 − 50 − 200 = 750; liquid 950; card debt 200.
    await page.goto("/finance");
    const position = page.getByLabel("재정 현황 요약");
    await expect(position).toContainText("+$750");
    await expect(position).toContainText("$950");
    await expect(position).toContainText("$200");
    const bankRow = page.getByRole("region", { name: "현금·은행 잔액" }).getByRole("listitem").filter({ hasText: BANK });
    await expect(bankRow).toContainText("+$950");
    await expect(bankRow).toContainText("맞춤");
    await expect(page.getByRole("region", { name: "신용카드 잔액" }).getByRole("listitem").filter({ hasText: CARD })).toContainText("갚을 돈 $200");

    // A later reconcile records only the difference: real 960 vs computed 950.
    await reconcile(page, BANK, "잔액 맞추기", "960", /조정 \+\$10을 기록했습니다/);
    await expect(position).toContainText("+$760");
    const { data: adjustments } = await db.from("finance_transactions").select("amount").eq("account_id", bank!.id).eq("type", "ADJUSTMENT");
    expect(adjustments!.map((a) => Number(a.amount)).sort((a, b) => a - b)).toEqual([10, 1000]);

    // Calendar: the asset flow table and the chart; a click on the chart selects that day.
    await page.goto("/finance/calendar");
    const table = page.getByRole("table", { name: "계좌별 자산 흐름" });
    const row = table.getByRole("row").filter({ hasText: BANK });
    await expect(row).toContainText("+$960");
    await expect(row).toContainText("-$50");
    await expect(table.getByRole("row").filter({ hasText: "순자산" })).toContainText("+$760");
    await page.locator(`[data-flow-day="${today}"]`).click();
    await expect(page).toHaveURL(new RegExp(`date=${today}`));
    await expect(page.locator(`[data-date="${today}"]`)).toHaveAttribute("aria-pressed", "true");
  });
});
