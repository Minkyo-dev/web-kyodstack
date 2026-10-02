import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0040: weekly coaching from 4 weeks of data → "이번 주 1% 변화" → apply changes the rule; a habit proposal can be
// passed over; the scheduler brief links to the open focus.
test.describe("assistant coaching", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("rule minutes applied, habit days passed over", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const stamp = Date.now();
    // The dedicated E2E user only: start the week from scratch so coaching is generated now.
    await db.from("assistant_proposals").delete().gte("week_start", "2000-01-01");

    const { data: mission } = await db.from("missions").insert({ user_id: uid, title: `${E2E_PREFIX} Coach change ${stamp}` }).select("id").single();
    const { data: path } = await db
      .from("paths")
      .insert({ user_id: uid, mission_id: mission!.id, title: "Daily output", approach: "Speak first" })
      .select("id")
      .single();
    const rule = `${E2E_PREFIX} Shadowing ${stamp}`;
    const { data: protocol } = await db
      .from("protocols")
      .insert({ user_id: uid, mission_id: mission!.id, path_id: path!.id, title: rule, intended_minutes: 40 })
      .select("id")
      .single();
    const { data: task } = await db
      .from("tasks")
      .insert({ user_id: uid, title: `${E2E_PREFIX} Shadow task ${stamp}`, mission_id: mission!.id, protocol_id: protocol!.id })
      .select("id")
      .single();
    // Three finished timer sessions of 12, 15 and 18 minutes on the last three days (today is excluded).
    for (const [daysAgo, minutes] of [[1, 12], [2, 15], [3, 18]] as const) {
      const start = new Date(Date.now() - daysAgo * 86_400_000);
      start.setUTCHours(16, 0, 0, 0);
      await db.from("work_sessions").insert({
        user_id: uid,
        task_id: task!.id,
        source: "timer",
        started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
      });
    }
    const habit = `${E2E_PREFIX} Stretch ${stamp}`;
    await db.from("habits").insert({
      user_id: uid,
      title: habit,
      rule: "check",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      created_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    });

    await login(page);
    await page.goto("/scheduler/review");
    const coaching = page.getByRole("region", { name: "코칭" });
    const focus = coaching.getByRole("listitem", { name: `제안 '${rule}' 40분 → 15분` });
    await expect(focus).toContainText("이번 주 1% 변화");
    await expect(focus.getByRole("list", { name: "근거" })).toContainText("보통 15분");

    // The brief on the scheduler points at the open focus.
    await page.goto("/scheduler");
    await expect(page.getByRole("listitem", { name: "이번 주 1% 변화" })).toContainText("40분 → 15분");

    await page.goto("/scheduler/review");
    await focus.getByRole("button", { name: "적용" }).click();
    await expect(page.getByText("적용했습니다.")).toBeVisible();
    await expect.poll(async () => (await db.from("protocols").select("intended_minutes").eq("id", protocol!.id).single()).data?.intended_minutes).toBe(15);
    await coaching.getByText(/^이번 주 결정 \(\d+\)$/).click();
    await expect(coaching.getByRole("listitem", { name: `결정한 제안 '${rule}' 40분 → 15분` })).toContainText("적용함");

    const habitCard = coaching.getByRole("listitem", { name: new RegExp(`^제안 '${habit.replace(/[[\]]/g, "\\$&")}' 매일 → `) });
    await habitCard.getByRole("button", { name: "넘기기" }).click();
    await expect(page.getByText("넘겼습니다.")).toBeVisible();
    await expect.poll(async () => (await db.from("habits").select("weekdays").eq("title", habit).single()).data?.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expect
      .poll(async () => (await db.from("assistant_proposals").select("status").eq("kind", "habit_days").like("title", `%${habit}%`).single()).data?.status)
      .toBe("dismissed");
  });
});
