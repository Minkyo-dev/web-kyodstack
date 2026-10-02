import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("planner manual opens from its tab and links to its sections", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "플래너" }).getByRole("link", { name: "매뉴얼" }).click();
  await expect(page).toHaveURL(/\/scheduler\/manual$/);
  await expect(page.getByRole("heading", { level: 1, name: "플래너 매뉴얼" })).toBeVisible();
  for (const name of ["1. 핵심 원칙", "2. 처음 30분 세팅", "3. 하루 루틴", "7. 성장 시스템", "9. 막혔을 때"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  await page.getByRole("navigation", { name: "매뉴얼 목차" }).getByRole("link", { name: "막혔을 때" }).click();
  await expect(page).toHaveURL(/#stuck$/);
  // Links inside the manual go to the real tabs.
  await page.getByRole("region", { name: "2. 처음 30분 세팅" }).getByRole("link", { name: "성장" }).click();
  await expect(page).toHaveURL(/\/scheduler\/progress$/);
});
