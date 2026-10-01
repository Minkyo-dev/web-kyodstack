import { expect, test, type Page } from "@playwright/test";
import { cleanupFinance, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0034: a card's payment day and payment account. Setting the payment day to today pays off what the card owes
// from the payment account as one transfer, so the card is back to 0 and the bank goes down by the same amount.
const BANK = `${E2E_PREFIX} 결제통장`;
const CARD = `${E2E_PREFIX} 결제카드`;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
const day = Number(today.slice(8, 10));

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

async function addAccount(page: Page, name: string, type: string) {
  await page.getByRole("button", { name: "계좌 추가" }).click();
  const form = page.getByRole("form", { name: "새 계좌" });
  await form.getByLabel("이름").fill(name);
  await form.getByLabel("종류").selectOption(type);
  await form.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
}

async function reconcile(page: Page, account: string, amount: string, expectToast: RegExp) {
  await page.getByRole("button", { name: `${account} 시작 잔액 설정` }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("계산된 잔액", { exact: true })).toBeVisible();
  await dialog.getByLabel(/실제 잔액|갚을 금액/).fill(amount);
  await expect(dialog.getByText("…")).toHaveCount(0);
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText(expectToast)).toBeVisible();
  await expect(dialog).toHaveCount(0);
}

test.describe("finance card payment", () => {
  test.beforeAll(async () => cleanupFinance(await dbAsUser()));
  test.afterAll(async () => cleanupFinance(await dbAsUser()));

  test("payment day pays the card off from the payment account", async ({ page }) => {
    await login(page);
    await ensureHousehold(page);
    await page.goto("/finance/settings/accounts");
    await addAccount(page, BANK, "CHECKING");

    // The new-card form offers the payment fields only for a credit card.
    await page.getByRole("button", { name: "계좌 추가" }).click();
    const form = page.getByRole("form", { name: "새 계좌" });
    await expect(form.getByLabel("출금 계좌")).toHaveCount(0);
    await form.getByLabel("종류").selectOption("CREDIT_CARD");
    await expect(form.getByLabel("출금 계좌")).toBeVisible();
    await form.getByLabel("이름").fill(CARD);
    // Half a setting is rejected.
    await form.getByLabel("결제일", { exact: true }).selectOption(String(day));
    await form.getByRole("button", { name: "저장" }).click();
    await expect(form.getByText("결제일과 출금 계좌를 함께 입력하거나 둘 다 비워 두세요.")).toBeVisible();
    await form.getByLabel("결제일", { exact: true }).selectOption("");
    await form.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: CARD })).toBeVisible();

    await reconcile(page, BANK, "1000", /조정 \+\$1,000을 기록했습니다/);
    await reconcile(page, CARD, "200", /조정 -\$200을 기록했습니다/);
    const cardRow = page.getByRole("listitem").filter({ hasText: CARD });
    await expect(cardRow).toContainText("갚을 돈 $200");

    // Payment day = today, paid from the bank: the $200 owed moves now.
    await page.getByRole("button", { name: `${CARD} 수정` }).click();
    const edit = page.getByRole("form", { name: `${CARD} 수정` });
    await edit.getByLabel("결제일", { exact: true }).selectOption(String(day));
    await edit.getByLabel("출금 계좌").selectOption({ label: BANK });
    await edit.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("계좌를 수정했습니다.")).toBeVisible();

    await expect(cardRow).toContainText(`매월 ${day >= 31 ? "말일" : `${day}일`} 결제 · ${BANK}에서 출금`);
    await expect(cardRow).not.toContainText("갚을 돈");
    // Exact name: the card row also mentions the bank ("…에서 출금").
    await expect(page.getByRole("listitem").filter({ has: page.getByText(BANK, { exact: true }) })).toContainText("+$800");

    const db = await dbAsUser();
    const { data: card } = await db.from("finance_accounts").select("id").eq("name", CARD).single();
    const { data: payments } = await db
      .from("finance_transactions")
      .select("amount, type, transaction_date, merchant_name")
      .eq("transfer_account_id", card!.id)
      .eq("source", "CARD_PAYMENT");
    expect(payments).toEqual([{ amount: 200, type: "TRANSFER", transaction_date: today, merchant_name: `${CARD} 카드 대금` }]);
  });
});
