import { expect, test } from "@playwright/test";
import { dbAsUser, login } from "./helpers";

// ADR 0043: scheduler settings → 알림. Preferences persist; the device row reports this browser's state.
// Delivery itself is checked live (test push + job), not in headless E2E.
test("notification settings open from the scheduler and save", async ({ page }) => {
  const db = await dbAsUser();
  const uid = (await db.auth.getUser()).data.user!.id;
  const { data: before } = await db.from("notification_prefs").select("*").eq("user_id", uid).maybeSingle();
  try {
    await login(page);
    await page.getByRole("button", { name: "스케줄러 설정" }).click();
    await page.getByRole("menuitem", { name: "알림" }).click();
    const dialog = page.getByRole("dialog", { name: "알림" });
    await expect(dialog.getByRole("status")).not.toHaveText("확인 중…");
    await expect(dialog.getByRole("status")).toHaveText(/알림|지원|키/);

    const form = dialog.getByRole("form", { name: "알림 설정" });
    await form.getByLabel(/조용한 변화/).uncheck();
    await form.getByLabel("하루 최대").selectOption("3");
    await form.getByLabel("방해 금지 시작").selectOption("21");
    await form.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("알림 설정을 저장했습니다.")).toBeVisible();
    await expect
      .poll(async () => (await db.from("notification_prefs").select("change_quiet, daily_cap, quiet_start, block_soon").eq("user_id", uid).single()).data)
      .toEqual({ change_quiet: false, daily_cap: 3, quiet_start: 21, block_soon: true });

    // Reopening shows the saved values.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "스케줄러 설정" }).click();
    await page.getByRole("menuitem", { name: "알림" }).click();
    await expect(page.getByRole("dialog", { name: "알림" }).getByLabel("하루 최대")).toHaveValue("3");
  } finally {
    const reset = before ?? { user_id: uid, block_soon: true, habit_missed: true, checkin: true, change_quiet: true, quiet_start: 22, quiet_end: 7, daily_cap: 4 };
    await db.from("notification_prefs").upsert(reset, { onConflict: "user_id" });
  }
});
