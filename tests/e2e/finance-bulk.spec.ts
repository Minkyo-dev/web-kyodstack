import { expect, test, type Page } from "@playwright/test";
import { cleanupFinance, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0027: logical category delete, and the keyboard-first bulk entry grid (typing, picker cells, spreadsheet paste,
// validation, all-or-nothing save). Uses January 2099 so real household data never mixes in.
const ACCOUNT = `${E2E_PREFIX} 벌크카드`;
const BANK = `${E2E_PREFIX} 벌크통장`;
// Own categories, so the spec never depends on the household's real (user-edited) category list.
const SPEND = `${E2E_PREFIX} 벌크장보기`;
const PAY = `${E2E_PREFIX} 벌크급여`;

async function ensureCategories() {
  const db = await dbAsUser();
  const uid = (await db.auth.getUser()).data.user!.id;
  const { data } = await db.from("finance_household_members").select("household_id").eq("user_id", uid).single();
  for (const [name, type] of [[SPEND, "EXPENSE"], [PAY, "INCOME"]] as const) {
    const { data: found } = await db.from("finance_categories").select("id").eq("household_id", data!.household_id).eq("name", name).maybeSingle();
    if (!found) await db.from("finance_categories").insert({ household_id: data!.household_id, name, type });
  }
}

async function ensureHousehold(page: Page) {
  const db = await dbAsUser();
  const uid = (await db.auth.getUser()).data.user!.id;
  const { data } = await db.from("finance_household_members").select("household_id").eq("user_id", uid).maybeSingle();
  if (data) return;
  await page.goto("/finance");
  const create = page.getByRole("form", { name: "새 가계 만들기" });
  await create.getByLabel("가계 이름").fill(`${E2E_PREFIX} 가계`);
  await create.getByRole("button", { name: "만들기" }).click();
  await expect(page.getByRole("navigation", { name: "가계부" })).toBeVisible();
}

test.describe("finance bulk entry and category delete", () => {
  test.beforeAll(async () => cleanupFinance(await dbAsUser()));
  test.afterAll(async () => cleanupFinance(await dbAsUser()));

  test("a category is deleted logically and leaves settings", async ({ page }) => {
    await login(page);
    await ensureHousehold(page);
    await page.goto("/finance/settings/categories");
    const name = `${E2E_PREFIX} 삭제용`;
    await page.getByRole("button", { name: "지출 카테고리 추가" }).click();
    const form = page.getByRole("form", { name: "새 카테고리" });
    await form.getByLabel("이름").fill(name);
    await form.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText(name)).toBeVisible();

    await page.getByRole("button", { name: `${name} 삭제` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("되돌릴 수 없습니다");
    await dialog.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText(name)).toHaveCount(0);

    const { data } = await (await dbAsUser()).from("finance_categories").select("deleted_at, is_active").eq("name", name).single();
    expect(data?.deleted_at).not.toBeNull();
    expect(data?.is_active).toBe(false);
  });

  test("bulk grid: add rows, pick, paste income/expense/transfer, validate, save all", async ({ page }) => {
    await login(page);
    await ensureHousehold(page);
    await page.goto("/finance/settings/accounts");
    for (const name of [ACCOUNT, BANK]) {
      await page.getByRole("button", { name: "계좌 추가" }).click();
      const accountForm = page.getByRole("form", { name: "새 계좌" });
      await accountForm.getByLabel("이름").fill(name);
      await accountForm.getByRole("button", { name: "저장" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
    }
    await ensureCategories();

    await page.goto("/finance");
    await page.getByRole("link", { name: "여러 건 입력" }).click();
    await expect(page).toHaveURL(/\/finance\/transactions\/bulk$/);
    const grid = page.getByRole("table", { name: "여러 건 입력" });
    // No default rows: the grid starts empty.
    await expect(grid.locator("[data-cell]")).toHaveCount(0);
    await page.getByRole("button", { name: "행 추가" }).first().click();
    await expect(grid.getByLabel("1행 날짜")).toBeFocused();

    // Row 1 by keyboard: loose date, picker cells resolve on Enter.
    await page.keyboard.type("2099-01-20");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab"); // keep 지출
    await page.keyboard.type("12.5");
    await page.keyboard.press("Tab");
    await page.keyboard.type("벌크장");
    await expect(page.getByRole("listbox", { name: "1행 카테고리·받는 계좌 선택지" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(grid.getByLabel("1행 카테고리·받는 계좌")).toHaveValue(SPEND);
    await page.keyboard.press("Tab");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("벌크카");
    await page.keyboard.press("Enter");
    await expect(grid.getByLabel("1행 계좌")).toHaveValue(ACCOUNT);
    await page.keyboard.press("Tab");
    await page.keyboard.type(`${E2E_PREFIX} bulk A`);
    // Enter on the last row adds a row and moves down in the same column.
    await page.keyboard.press("Enter");
    await expect(grid.getByLabel("2행 가맹점·내용")).toBeFocused();

    // Rows 2–4 pasted from a spreadsheet, starting at the date cell: income, a transfer (receiving account in the
    // category cell), and an expense with a bad amount.
    await grid.getByLabel("2행 날짜").focus();
    const tsv = [
      ["2099-01-21", "수입", "100", PAY, ACCOUNT, `${E2E_PREFIX} bulk B`],
      ["2099-01-21", "이체", "50", BANK, ACCOUNT, `${E2E_PREFIX} bulk T`],
      ["2099/1/22", "지출", "abc", SPEND, ACCOUNT, `${E2E_PREFIX} bulk C`],
    ]
      .map((r) => r.join("\t"))
      .join("\n");
    await grid.getByLabel("2행 날짜").evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, tsv);
    await expect(grid.getByLabel("4행 가맹점·내용")).toHaveValue(`${E2E_PREFIX} bulk C`);

    await page.keyboard.press("ControlOrMeta+Enter");
    const errors = page.getByRole("alert").filter({ hasText: "저장하지 못했습니다" });
    await expect(errors).toContainText("4행 금액");
    await expect(grid.getByLabel("4행 금액")).toBeFocused();
    const db = await dbAsUser();
    const none = await db.from("finance_transactions").select("id").like("merchant_name", `${E2E_PREFIX} bulk%`);
    expect(none.data).toHaveLength(0);

    await grid.getByLabel("4행 금액").fill("7");
    await expect(errors).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.getByText("4건을 저장했습니다.")).toBeVisible();

    const { data } = await db
      .from("finance_transactions")
      .select("type, amount, transaction_date, merchant_name, category_id, transfer_group_id")
      .like("merchant_name", `${E2E_PREFIX} bulk%`)
      .order("merchant_name");
    expect(data?.map(({ type, amount, transaction_date, merchant_name }) => ({ type, amount, transaction_date, merchant_name }))).toEqual([
      { type: "EXPENSE", amount: 12.5, transaction_date: "2099-01-20", merchant_name: `${E2E_PREFIX} bulk A` },
      { type: "INCOME", amount: 100, transaction_date: "2099-01-21", merchant_name: `${E2E_PREFIX} bulk B` },
      { type: "EXPENSE", amount: 7, transaction_date: "2099-01-22", merchant_name: `${E2E_PREFIX} bulk C` },
      { type: "TRANSFER", amount: 50, transaction_date: "2099-01-21", merchant_name: `${E2E_PREFIX} bulk T` },
    ]);
    const transfer = data!.find((t) => t.type === "TRANSFER")!;
    expect(transfer.category_id).toBeNull();
    expect(transfer.transfer_group_id).not.toBeNull();
    // The grid empties for the next batch.
    await expect(grid.locator("[data-cell]")).toHaveCount(0);
  });

  test("calendar day panel: the day's transactions, entry for that day, detail on click", async ({ page }) => {
    await login(page);
    await ensureHousehold(page);
    await page.goto("/finance/calendar?month=2099-01");
    const panel = page.getByRole("region", { name: /2099년 1월/ });
    const grid = panel.getByRole("table", { name: "여러 건 입력" });

    // Beside the panel a day click shows that day in the panel instead of opening the Day Drawer.
    await page.locator('[data-date="2099-01-21"]').click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(panel.getByRole("heading", { name: /1월 21일/ })).toBeVisible();
    // Income, expense and transfer of the day (saved by the previous test) are all listed.
    const dayTable = panel.getByRole("table", { name: "이날 거래" });
    await expect(dayTable.getByRole("row", { name: /bulk B/ })).toBeVisible();
    await expect(dayTable.getByRole("row", { name: /bulk T/ })).toBeVisible();

    await page.locator('[data-date="2099-01-23"]').click();
    await expect(panel.getByText("이날 기록된 거래가 없습니다.")).toBeVisible();
    await panel.getByRole("button", { name: "행 추가" }).first().click();
    await expect(grid.getByLabel("1행 날짜")).toHaveValue("2099-01-23");
    await grid.getByLabel("1행 금액").fill("4.5");
    await grid.getByLabel("1행 카테고리·받는 계좌").fill(SPEND);
    await grid.getByLabel("1행 계좌").fill(ACCOUNT);
    await grid.getByLabel("1행 가맹점·내용").fill(`${E2E_PREFIX} panel A`);
    await grid.getByLabel("1행 금액").press("ControlOrMeta+Enter");
    await expect(page.getByText("1건을 저장했습니다.")).toBeVisible();

    // The day list and the calendar both pick up the new row; a row opens its detail.
    await expect(dayTable.getByRole("row", { name: /panel A/ })).toBeVisible();
    await expect(page.locator('[data-date="2099-01-23"]')).toHaveAttribute("aria-label", /지출 -\$4\.50/);
    await dayTable.getByRole("row", { name: /panel A/ }).click();
    await expect(page.getByRole("dialog")).toContainText(`${E2E_PREFIX} panel A`);
  });
});
