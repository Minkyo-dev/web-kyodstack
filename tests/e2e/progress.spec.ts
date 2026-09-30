import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

test.describe("progress", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("stat cards, patterns, practice domain, work standards persist", async ({ page }) => {
    const db = await dbAsUser();
    const { data: me } = await db.auth.getUser();
    const uid = me.user!.id;
    const stamp = Date.now();
    const domain = `E2E도메인${stamp}`;
    const { data: d } = await db.from("practice_domains").insert({ user_id: uid, name: domain }).select("id").single();
    const { data: task } = await db
      .from("tasks")
      .insert({ user_id: uid, title: `${E2E_PREFIX} 영역 작업 ${stamp}`, practice_domain_id: d!.id })
      .select("id")
      .single();
    const start = Date.now() - 3 * 86_400_000;
    await db.from("work_sessions").insert({
      user_id: uid, task_id: task!.id, source: "manual",
      started_at: new Date(start).toISOString(), ended_at: new Date(start + 45 * 60_000).toISOString(),
    });
    const { data: before } = await db
      .from("scheduler_settings")
      .select("planned_work_days, min_meaningful_minutes, commit_lead_minutes")
      .single();

    try {
      await login(page);
      await page.getByRole("link", { name: "진행" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "진행" })).toBeVisible();
      for (const name of ["예상 정확도", "계획 이행", "꾸준함", "회복력"]) {
        await expect(page.getByRole("article", { name })).toBeVisible();
      }
      await expect(page.getByRole("heading", { name: "나의 패턴" })).toBeVisible();
      const domains = page.getByRole("region", { name: "연습 영역" });
      await expect(domains).toContainText(domain);
      await expect(domains).toContainText("45m");

      await page.getByRole("button", { name: "작업 기준" }).click();
      const dialog = page.getByRole("dialog", { name: "작업 기준" });
      await dialog.getByLabel("토").check();
      await dialog.getByLabel(/최소 작업 시간/).fill("45");
      await dialog.getByRole("button", { name: "저장" }).click();
      await expect
        .poll(async () => (await db.from("scheduler_settings").select("min_meaningful_minutes, planned_work_days").single()).data)
        .toMatchObject({ min_meaningful_minutes: 45 });
      const { data: after } = await db.from("scheduler_settings").select("planned_work_days").single();
      expect(after!.planned_work_days).toContain(6);
    } finally {
      await db.from("scheduler_settings").update(before!).eq("user_id", uid);
    }
  });
});
