import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

test.describe("classification", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("quick add #tag @domain → chips; autocomplete Enter picks; tag filter; drawer type", async ({ page }) => {
    const stamp = Date.now();
    const tag = `e2e-snow${stamp}`;
    const domain = `E2E${stamp}`;
    const a = `${E2E_PREFIX} RBAC 공부 ${stamp}`;
    const b = `${E2E_PREFIX} 다른 일 ${stamp}`;
    await login(page);

    await page.getByLabel("새 할 일").fill(`${a} #${tag} @${domain}`);
    await page.getByRole("button", { name: "할 일 추가" }).click();
    const itemA = page.locator("li", { hasText: a });
    await expect(itemA).toContainText(tag);
    await expect(itemA).toContainText(`@${domain}`);
    await expect(page.getByText(`새 영역 ${domain}을 만들었어요`)).toBeVisible();

    // Autocomplete: typing "#e2e-snow" then Enter picks the tag instead of submitting.
    const input = page.getByLabel("새 할 일");
    await input.fill(`${b} #e2e-snow`);
    await expect(page.getByRole("option", { name: tag })).toBeVisible();
    await input.press("Enter");
    await expect(page.locator("li", { hasText: b })).toHaveCount(0); // not submitted
    await expect(page.getByRole("button", { name: `태그 ${tag} 제거` })).toBeVisible();
    await input.press("Enter"); // list closed → submits
    await expect(page.locator("li", { hasText: b })).toContainText(tag);

    // Filter by the tag: both tasks shown; a third untagged task hidden.
    const c = `${E2E_PREFIX} 태그 없음 ${stamp}`;
    await input.fill(c);
    await input.press("Enter");
    await page.getByRole("group", { name: "태그 필터" }).getByRole("button", { name: tag }).click();
    await expect(page.locator("li", { hasText: c })).toHaveCount(0);
    await expect(page.locator("li", { hasText: a })).toBeVisible();

    // Drawer: set type → saved
    await page.getByRole("button", { name: a, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: a });
    await drawer.getByLabel("유형").selectOption({ label: "공부" });
    await drawer.getByRole("button", { name: "저장" }).click();
    const db = await dbAsUser();
    await expect
      .poll(async () => (await db.from("tasks").select("task_type").eq("title", a).single()).data?.task_type)
      .toBe("study");
  });
});
