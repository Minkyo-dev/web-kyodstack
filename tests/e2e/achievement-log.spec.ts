import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0037: completing a milestone / project shows up in the 성장 tab's 성취 로그 (stamped by the DB trigger).
test.describe("achievement log", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("completed milestone and project are logged; reopening removes the entry", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const project = `${E2E_PREFIX} Log project ${Date.now()}`;
    const { data: p } = await db.from("projects").insert({ user_id: uid, name: project }).select("id").single();
    const { data: m } = await db
      .from("milestones")
      .insert({ user_id: uid, project_id: p!.id, name: "Checkpoint A" })
      .select("id")
      .single();
    await db.from("milestones").update({ status: "completed" }).eq("id", m!.id);
    await db.from("projects").update({ status: "completed" }).eq("id", p!.id);

    await login(page);
    await page.getByRole("navigation", { name: "플래너" }).getByRole("link", { name: "성장", exact: true }).click();
    const log = page.getByRole("list", { name: "성취 로그" });
    await expect(log.getByRole("listitem").filter({ hasText: "PROJECT CLEAR" }).filter({ hasText: project })).toBeVisible();
    await expect(log.getByRole("listitem").filter({ hasText: "MILESTONE" }).filter({ hasText: `${project} · Checkpoint A` })).toBeVisible();

    await db.from("projects").update({ status: "active" }).eq("id", p!.id);
    await page.reload();
    await expect(page.getByRole("list", { name: "성취 로그" }).getByRole("listitem").filter({ hasText: "PROJECT CLEAR" }).filter({ hasText: project })).toHaveCount(0);
  });
});
