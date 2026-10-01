import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// Archive folder (ADR 0024): archive → leaves the main list → listed under 아카이브 → restore.
test.describe("project archive", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("archive and restore a project", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const { data: before } = await db.from("player_profiles").select("gamification_enabled").maybeSingle();
    // Plain terms for stable labels.
    if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: false }).eq("user_id", uid);
    try {
      const name = `${E2E_PREFIX} Old project ${Date.now()}`;
      const { data: project } = await db.from("projects").insert({ user_id: uid, name, status: "completed" }).select("id").single();
      await login(page);
      await page.goto(`/scheduler/projects?project=${project!.id}`);

      const main = page.getByRole("list", { name: "프로젝트 목록" });
      await expect(main.getByText(name)).toBeVisible();
      await page.getByRole("button", { name: "아카이브로 이동" }).click();
      await expect(main.getByText(name)).toHaveCount(0);
      const archive = page.getByRole("list", { name: "아카이브된 프로젝트" });
      await expect(archive.getByText(name)).toBeVisible();
      await expect(page.getByRole("region", { name: "프로젝트 상세" })).toContainText("아카이브됨");

      await page.getByRole("button", { name: "아카이브에서 꺼내기" }).click();
      await expect(main.getByText(name)).toBeVisible();
      await expect.poll(async () => (await db.from("projects").select("archived_at").eq("id", project!.id).single()).data?.archived_at).toBeNull();
    } finally {
      await db.from("player_profiles").update({ gamification_enabled: before?.gamification_enabled ?? false }).eq("user_id", uid);
    }
  });
});
