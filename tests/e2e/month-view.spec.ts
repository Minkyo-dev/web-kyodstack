import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// Month view: blocks of the month show up; clicking one opens the task; the toggle returns to the week view.
test.describe("month view", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("shows the month's blocks and opens a task", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const title = `${E2E_PREFIX} 월간 ${Date.now()}`;
    // Noon in Toronto today: always inside the current month view.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
    const { data: task } = await db.from("tasks").insert({ user_id: uid, title, user_estimated_minutes: 30 }).select("id").single();
    const { error } = await db.rpc("create_schedule_block", {
      p_task_id: task!.id,
      p_starts_at: `${today}T16:00:00Z`,
      p_ends_at: `${today}T16:30:00Z`,
    });
    expect(error).toBeNull();

    await login(page);
    await page.getByRole("navigation", { name: "캘린더 보기" }).getByRole("link", { name: "월" }).click();
    await expect(page).toHaveURL(/view=month/);
    const month = page.getByRole("region", { name: "월간 캘린더" });
    await expect(page.getByRole("navigation", { name: "월 이동" })).toContainText(`${Number(today.slice(5, 7))}월`);
    const event = month.locator(".fc-event", { hasText: title });
    await expect(event).toBeVisible();
    await event.click();
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("navigation", { name: "월 이동" }).getByRole("link", { name: "다음 달" }).click();
    await expect(month.locator(".fc-event", { hasText: title })).toHaveCount(0);

    await page.getByRole("navigation", { name: "캘린더 보기" }).getByRole("link", { name: "주" }).click();
    await expect(page.getByRole("region", { name: "주간 캘린더" })).toBeVisible();
  });
});
