import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// G3: mission progress from criteria on the progress page.
test.describe("direction status", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("active mission shows criteria progress", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    // A past deadline sorts it first (the section shows at most 3 missions).
    const title = `${E2E_PREFIX} Status ${Date.now()}`;
    const { data: mission, error } = await db
      .from("missions")
      .insert({ user_id: uid, title, deadline: "2000-01-01" })
      .select("id")
      .single();
    expect(error).toBeNull();
    await db.from("mission_criteria").insert([
      { user_id: uid, mission_id: mission!.id, label: "A", kind: "check", met_at: new Date().toISOString(), position: 0 },
      { user_id: uid, mission_id: mission!.id, label: "B", kind: "check", position: 1 },
    ]);

    await login(page);
    await page.goto("/scheduler/progress");
    const card = page.getByRole("article", { name: title });
    await expect(card).toContainText("50%");
    await expect(card).toContainText("기준 1/2");
    await expect(card.getByRole("progressbar", { name: `${title} 진행률` })).toHaveAttribute("aria-valuenow", "50");
    await expect(page.getByRole("region", { name: "이번 주" })).toBeVisible();
  });
});
