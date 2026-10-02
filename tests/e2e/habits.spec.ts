import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// G2: habit on the directive page → DAILY QUESTS on the today screen → check / uncheck → archive.
test.describe("habits", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("create, check, uncheck, archive", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const { data: before } = await db.from("player_profiles").select("gamification_enabled").maybeSingle();
    // Plain terms for stable labels.
    if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: false }).eq("user_id", uid);
    try {
      const title = `${E2E_PREFIX} Stretch ${Date.now()}`;
      await login(page);

      await page.getByRole("link", { name: "정체성" }).click();
      const form = page.getByRole("form", { name: "새 습관" });
      await form.getByLabel("이름").fill(title);
      for (const d of ["토", "일"]) await form.getByLabel(d, { exact: true }).check();
      await form.getByRole("button", { name: "추가" }).click();
      const item = page.getByRole("listitem", { name: `습관 ${title}` });
      await expect(item).toContainText("매일");
      await expect(item).toContainText("체크");

      await page.getByRole("link", { name: "스케줄러" }).click();
      const panel = page.getByRole("region", { name: "습관" });
      const row = panel.getByRole("listitem", { name: `습관 ${title}` });
      await expect(row).toContainText("미완료");
      await row.getByLabel(`${title} 완료`).check();
      await expect(row).toContainText("완료");
      await expect(row).not.toContainText("미완료");
      const habitId = (await db.from("habits").select("id").eq("title", title).single()).data!.id;
      await expect
        .poll(async () => (await db.from("habit_checks").select("source").eq("habit_id", habitId)).data)
        .toEqual([{ source: "manual" }]);

      await row.getByLabel(`${title} 완료`).uncheck();
      await expect(row).toContainText("미완료");
      await expect.poll(async () => (await db.from("habit_checks").select("id").eq("habit_id", habitId)).data?.length).toBe(0);

      await page.getByRole("link", { name: "정체성" }).click();
      await page.getByRole("listitem", { name: `습관 ${title}` }).getByRole("button", { name: "보관" }).click();
      await expect(page.getByRole("listitem", { name: `습관 ${title}` })).toHaveCount(0);
      await page.getByRole("link", { name: "스케줄러" }).click();
      await expect(page.getByRole("listitem", { name: `습관 ${title}` })).toHaveCount(0);
    } finally {
      await db.from("player_profiles").update({ gamification_enabled: before?.gamification_enabled ?? false }).eq("user_id", uid);
    }
  });
});
