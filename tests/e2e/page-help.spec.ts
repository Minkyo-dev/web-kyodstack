import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// (?) help next to each private page title: opens on hover and by keyboard.
const PAGES = [
  { path: "/scheduler", label: "스케줄러 도움말" },
  { path: "/scheduler/directive", label: /도움말$/ },
  { path: "/scheduler/projects", label: /도움말$/ },
  { path: "/scheduler/review", label: "주간 회고 도움말" },
  { path: "/scheduler/progress", label: "추적 도움말" },
];

test("each page explains itself behind a help icon", async ({ page }) => {
  await login(page);
  for (const p of PAGES) {
    await page.goto(p.path);
    const trigger = page.getByRole("button", { name: p.label });
    // A hover before hydration does nothing; retry until the popover opens.
    await expect(async () => {
      await page.mouse.move(0, 0);
      await trigger.hover();
      await expect(page.getByText("사용 방법")).toBeVisible({ timeout: 1_000 });
    }).toPass();
    if (p.path === "/scheduler" && process.env.E2E_SHOTS) await page.waitForTimeout(500).then(() => page.screenshot({ path: `${process.env.E2E_SHOTS}/help.png` }));
    await page.mouse.move(0, 0);
    await expect(page.getByText("사용 방법")).toBeHidden();
  }
  // Keyboard: focus + Enter opens it too.
  await page.goto("/scheduler/review");
  await expect(async () => {
    await page.getByRole("button", { name: "주간 회고 도움말" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("사용 방법")).toBeVisible({ timeout: 1_000 });
  }).toPass();
  if (process.env.E2E_SHOTS) {
    await page.goto("/scheduler?view=month");
    await expect(page.getByRole("region", { name: "월간 캘린더" }).locator(".fc-daygrid")).toBeVisible();
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/month.png` });
  }
});
