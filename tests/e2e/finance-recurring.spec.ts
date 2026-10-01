import { expect, test, type Page } from "@playwright/test";
import { cleanupFinance, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0029: a recurring payment charges its due date once as an ordinary expense; pause/resume; delete keeps charges.
const ACCOUNT = `${E2E_PREFIX} 구독카드`;
const PLAN = `${E2E_PREFIX} 스트리밍`;

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

test.describe("finance recurring payments", () => {
  test.beforeAll(async () => cleanupFinance(await dbAsUser()));
  test.afterAll(async () => cleanupFinance(await dbAsUser()));

  test("add a plan, charge today once, pause, resume, delete", async ({ page }) => {
    await login(page);
    await ensureHousehold(page);
    await page.goto("/finance/settings/accounts");
    await page.getByRole("button", { name: "계좌 추가" }).click();
    const accountForm = page.getByRole("form", { name: "새 계좌" });
    await accountForm.getByLabel("이름").fill(ACCOUNT);
    await accountForm.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: ACCOUNT })).toBeVisible();

    await page.getByRole("navigation", { name: "가계부" }).getByRole("link", { name: "정기 결제" }).click();
    await page.getByRole("button", { name: "정기 결제 추가" }).click();
    const form = page.getByRole("form", { name: "새 정기 결제" });
    await form.getByLabel("이름").fill(PLAN);
    await form.getByLabel("금액").fill("17.99");
    await form.getByLabel("계좌").selectOption({ label: ACCOUNT });
    await form.getByLabel("카테고리").selectOption({ index: 1 });
    // Defaults: monthly, billing day = today, start = today → today's charge is recorded right away.
    await form.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("결제 1건을 거래로 기록했습니다")).toBeVisible();

    const row = page.getByRole("list", { name: "활성 정기 결제" }).getByRole("listitem").filter({ hasText: PLAN });
    await expect(row).toContainText("매월");
    await expect(row).toContainText("다음 결제");

    const db = await dbAsUser();
    const charges = async () =>
      (await db.from("finance_transactions").select("id, source, type, subscription_id").eq("merchant_name", PLAN)).data ?? [];
    expect(await charges()).toHaveLength(1);
    expect((await charges())[0]).toMatchObject({ source: "SUBSCRIPTION", type: "EXPENSE" });

    // Reloading charges again but records nothing new (idempotent).
    await page.reload();
    expect(await charges()).toHaveLength(1);

    await row.getByRole("button", { name: `${PLAN} 일시정지` }).click();
    const paused = page.getByRole("region", { name: "멈춘 정기 결제" }).getByRole("listitem").filter({ hasText: PLAN });
    await expect(paused).toContainText("일시정지");
    await paused.getByRole("button", { name: `${PLAN} 재개` }).click();
    await expect(row).toBeVisible();
    expect(await charges()).toHaveLength(1);

    await row.getByRole("button", { name: `${PLAN} 삭제` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("이미 기록된 거래는 그대로 남습니다");
    await dialog.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText(PLAN)).toHaveCount(0);
    const left = await charges();
    expect(left).toHaveLength(1);
    expect(left[0].subscription_id).toBeNull();
  });
});
