import { expect, test } from "@playwright/test";
import { dbAsUser, login } from "./helpers";

/** ADR 0046 V0 against the fake Notion gateway. The real OAuth is checked by hand (docs/operations.md). */
test.skip(!!process.env.E2E_BASE_URL && process.env.NOTION_GATEWAY !== "fake", "needs a dev server started with NOTION_GATEWAY=fake");

async function clearConnection() {
  const db = await dbAsUser();
  const { error } = await db.from("notion_connections").delete().not("user_id", "is", null);
  if (error) throw error;
}

test.beforeEach(clearConnection);
test.afterAll(clearConnection);

test("connect Notion, create the word DB, then disconnect", async ({ page }) => {
  await login(page);
  await page.goto("/english");
  await page.getByRole("link", { name: "Notion 연결" }).click();
  await expect(page).toHaveURL(/\/english\/settings\?setup=1/);
  await expect(page.getByText("[e2e] Fake workspace")).toBeVisible();

  await page.getByLabel("[e2e] 공유 페이지").check();
  await page.getByRole("button", { name: "단어장 만들기" }).click();
  await expect(page.getByText("속성 정상")).toBeVisible();
  await expect(page.getByRole("link", { name: "Notion에서 열기" })).toHaveAttribute("href", /notion\.so/);

  const db = await dbAsUser();
  const { data } = await db.from("notion_connections").select("status, database_id, access_token_enc").single();
  expect(data?.status).toBe("active");
  expect(data?.database_id).toBeTruthy();
  expect(data?.access_token_enc).toMatch(/^v1:/);
  expect(data?.access_token_enc).not.toContain("fake-access");

  await page.goto("/english");
  await expect(page.getByRole("link", { name: "Notion에서 열기" })).toBeVisible();

  await page.goto("/english/settings");
  await page.getByRole("button", { name: "연결 해제" }).click();
  await page.getByRole("button", { name: "해제 확인" }).click();
  await expect(page.getByRole("link", { name: "Notion 연결" })).toBeVisible();
});

test("a callback with a forged state stores nothing", async ({ page }) => {
  await login(page);
  await page.goto("/api/notion/callback?code=fake-code&state=forged");
  await expect(page).toHaveURL(/\/english\/settings\?error=oauth_state/);
  await expect(page.getByRole("alert").filter({ hasText: "만료" })).toBeVisible();
  const db = await dbAsUser();
  const { data } = await db.from("notion_connections").select("user_id");
  expect(data).toEqual([]);
});
