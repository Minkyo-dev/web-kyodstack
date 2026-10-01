import { expect, test, type Page } from "@playwright/test";
import { cleanupFinance, dbAsUser, E2E_PREFIX, login } from "./helpers";

// Household finance core flow (docs/household-finance-design.md §43): accounts → add income/expense/transfer in the
// Day Drawer → totals exclude the transfer → detail → edit → delete; dashboard and search agree. Uses January 2099 so
// real household data never mixes in. Creates an "[e2e]" household only when the user has none.
const DAY = "2099-01-15";

async function addAccount(page: Page, name: string, type: string) {
  await page.getByRole("button", { name: "계좌 추가" }).click();
  const form = page.getByRole("form", { name: "새 계좌" });
  await form.getByLabel("이름").fill(name);
  await form.getByLabel("종류").selectOption(type);
  await form.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
}

test.describe("finance", () => {
  test.beforeAll(async () => cleanupFinance(await dbAsUser()));
  test.afterAll(async () => cleanupFinance(await dbAsUser()));

  test("day drawer: add, transfer excluded, edit, delete", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const { data: membership } = await db.from("finance_household_members").select("household_id").eq("user_id", uid).maybeSingle();

    await login(page);
    await page.goto("/finance");
    if (!membership) {
      const create = page.getByRole("form", { name: "새 가계 만들기" });
      await create.getByLabel("가계 이름").fill(`${E2E_PREFIX} 가계`);
      await create.getByRole("button", { name: "만들기" }).click();
      await expect(page.getByRole("navigation", { name: "가계부" })).toBeVisible();
    }

    await page.goto("/finance/settings/accounts");
    const card = `${E2E_PREFIX} 카드`;
    const bank = `${E2E_PREFIX} 통장`;
    await addAccount(page, card, "CREDIT_CARD");
    await addAccount(page, bank, "CHECKING");

    await page.goto(`/finance/calendar?month=2099-01&date=${DAY}`);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("이날 기록된 거래가 없습니다.")).toBeVisible();

    const add = async (fill: (form: ReturnType<typeof drawer.getByRole>) => Promise<void>) => {
      await drawer.getByRole("button", { name: "이날 거래 추가" }).click();
      const form = drawer.getByRole("form", { name: "거래 추가" });
      await fill(form);
      await form.getByRole("button", { name: "저장" }).click();
      await expect(drawer.getByRole("button", { name: "이날 거래 추가" })).toBeVisible();
    };
    await add(async (form) => {
      await form.getByLabel("금액").fill("73.12");
      await form.getByLabel("카테고리").selectOption({ index: 1 });
      await form.getByLabel("계좌", { exact: true }).selectOption({ label: card });
      await form.getByLabel("가맹점 (선택)").fill(`${E2E_PREFIX} Loblaws`);
    });
    await add(async (form) => {
      await form.getByRole("radio", { name: "수입" }).click();
      await form.getByLabel("금액").fill("4200");
      await form.getByLabel("카테고리").selectOption({ index: 1 });
      await form.getByLabel("계좌", { exact: true }).selectOption({ label: bank });
      await form.getByLabel("보낸 곳 (선택)").fill(`${E2E_PREFIX} Salary`);
    });
    await add(async (form) => {
      await form.getByRole("radio", { name: "이체" }).click();
      await form.getByLabel("금액").fill("1000");
      await form.getByLabel("보내는 계좌").selectOption({ label: bank });
      await form.getByLabel("받는 계좌").selectOption({ label: card });
      await form.getByLabel("내용 (선택)").fill(`${E2E_PREFIX} 카드 대금`);
    });

    // The transfer is listed but never counted as expense (spec §22, §29).
    const totals = drawer.getByLabel("이날 합계");
    await expect(totals).toContainText("+$4,200");
    await expect(totals).toContainText("-$73.12");
    await expect(totals).toContainText("+$4,126.88");
    await expect(drawer.getByRole("region", { name: "이체" })).toContainText("$1,000");
    await expect(page.locator(`[data-date="${DAY}"]`)).toHaveAttribute("aria-label", /수입 \+\$4,200, 지출 -\$73\.12/);

    // Detail → edit → back.
    await drawer.getByRole("button", { name: new RegExp(`${E2E_PREFIX} Loblaws`.replace(/[[\]]/g, "\\$&")) }).click();
    await drawer.getByRole("button", { name: "수정" }).click();
    const edit = drawer.getByRole("form", { name: "거래 수정" });
    await edit.getByLabel("금액").fill("80");
    await edit.getByLabel("메모 (선택)").fill("edited");
    await edit.getByRole("button", { name: "저장" }).click();
    await expect(drawer.getByText("-$80")).toBeVisible();
    await drawer.getByRole("button", { name: "1월 15일" }).click();
    await expect(totals).toContainText("-$80");

    // Dashboard for that month uses the same rule.
    await page.goto("/finance?mode=monthly&year=2099&month=1");
    const summary = page.getByLabel("요약", { exact: true });
    await expect(summary).toContainText("$4,200");
    await expect(summary).toContainText("$80");
    await expect(summary).toContainText("+$4,120");

    // Search finds it; delete from the sheet.
    await page.goto(`/finance/transactions?from=2099-01-01&to=2099-01-31&q=Loblaws`);
    await page.getByRole("button", { name: /Loblaws/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "삭제" }).click();
    await sheet.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText("조건에 맞는 거래가 없습니다.")).toBeVisible();
    await expect
      .poll(async () => (await db.from("finance_transactions").select("id").eq("merchant_name", `${E2E_PREFIX} Loblaws`)).data?.length)
      .toBe(0);
  });
});
