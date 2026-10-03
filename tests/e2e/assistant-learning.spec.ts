import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0044: an applied coaching change shows its before/after in "배운 것"; a rule whose sessions cluster at one hour
// gets a time-slot proposal that creates a task and its block; a 변화 with criteria shows a deadline forecast.
const DAY = 86_400_000;
const localDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));

test.describe("assistant learning and forecasts", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("learning log shows the result of an applied habit change", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const stamp = Date.now();
    const habit = `${E2E_PREFIX} Learn stretch ${stamp}`;
    const { data: h } = await db
      .from("habits")
      .insert({ user_id: uid, title: habit, rule: "check", weekdays: [1, 2, 3, 4, 5, 6, 7], created_at: new Date(stamp - 70 * DAY).toISOString() })
      .select("id")
      .single();
    // Nothing kept in the 4 weeks before the change (20 days ago); every day kept after it.
    const after = Array.from({ length: 18 }, (_, i) => ({ user_id: uid, habit_id: h!.id, local_date: localDate(stamp - (i + 2) * DAY), source: "manual" }));
    const { error: checkError } = await db.from("habit_checks").insert(after);
    expect(checkError).toBeNull();
    const title = `'${habit}' 매일 → 매일`;
    const { error } = await db.from("assistant_proposals").insert({
      user_id: uid,
      week_start: localDate(stamp - 21 * DAY),
      kind: "habit_days",
      target_key: `${h!.id}:e2e`,
      title,
      reason: "e2e",
      payload: { habitId: h!.id, from: [1, 2, 3, 4, 5, 6, 7], to: [1, 2, 3, 4, 5, 6, 7] },
      status: "applied",
      decided_at: new Date(stamp - 20 * DAY).toISOString(),
      rules_version: "coach-v2",
    });
    expect(error).toBeNull();

    await login(page);
    await page.goto("/scheduler/review");
    const entry = page.getByRole("region", { name: "배운 것" }).getByRole("listitem", { name: `배운 것 ${title}` });
    await expect(entry).toContainText(/지킴 0% → \d+% · 좋아짐/);
  });

  test("time slot proposal creates a task and its block at the usual hour", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const stamp = Date.now();
    // The dedicated E2E user only: start the week from scratch so coaching is generated now.
    await db.from("assistant_proposals").delete().gte("week_start", "2000-01-01");
    const { data: mission } = await db.from("missions").insert({ user_id: uid, title: `${E2E_PREFIX} Slot change ${stamp}` }).select("id").single();
    const { data: path } = await db.from("paths").insert({ user_id: uid, mission_id: mission!.id, title: "Mornings", approach: "Same hour" }).select("id").single();
    const rule = `${E2E_PREFIX} Slot rule ${stamp}`;
    const { data: protocol } = await db
      .from("protocols")
      .insert({ user_id: uid, mission_id: mission!.id, path_id: path!.id, title: rule, intended_minutes: 30 })
      .select("id")
      .single();
    const { data: task } = await db
      .from("tasks")
      .insert({ user_id: uid, title: `${E2E_PREFIX} Slot task ${stamp}`, mission_id: mission!.id, protocol_id: protocol!.id })
      .select("id")
      .single();
    // Four 30-minute timer sessions at the same hour, 2–5 days back so none lands on the local today (excluded).
    for (const daysAgo of [2, 3, 4, 5]) {
      const start = new Date(stamp - daysAgo * DAY);
      start.setUTCHours(16, 0, 0, 0);
      await db.from("work_sessions").insert({
        user_id: uid,
        task_id: task!.id,
        source: "timer",
        started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + 30 * 60_000).toISOString(),
      });
    }

    await login(page);
    await page.goto("/scheduler/review");
    const card = page.getByRole("region", { name: "코칭" }).getByRole("listitem", { name: new RegExp(`^제안 '${rule.replace(/[[\]]/g, "\\$&")}' \\d{2}:00에 30분 블록$`) });
    await expect(card.getByRole("list", { name: "근거" })).toContainText("그 시간대 4");
    await card.getByRole("button", { name: "적용" }).click();
    await expect(page.getByText("적용했습니다.")).toBeVisible();

    await expect
      .poll(async () => (await db.from("tasks").select("id").eq("protocol_id", protocol!.id).eq("title", rule)).data?.length)
      .toBe(1);
    const { data: created } = await db.from("tasks").select("id, user_estimated_minutes").eq("protocol_id", protocol!.id).eq("title", rule).single();
    expect(created!.user_estimated_minutes).toBe(30);
    const { data: blocks } = await db.from("schedule_blocks").select("starts_at, ends_at, status").eq("task_id", created!.id);
    expect(blocks).toHaveLength(1);
    expect(blocks![0].status).toBe("planned");
    expect(new Date(blocks![0].starts_at).getUTCHours()).toBe(16);
    expect(Date.parse(blocks![0].ends_at) - Date.parse(blocks![0].starts_at)).toBe(30 * 60_000);
  });

  test("a change with criteria shows its deadline forecast", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const title = `${E2E_PREFIX} Forecast ${Date.now()}`;
    // A past deadline sorts it first (the section shows at most 3 missions); created 40 days ago, half met 10 days ago.
    const { data: mission, error } = await db
      .from("missions")
      .insert({ user_id: uid, title, deadline: "2000-01-01", created_at: new Date(Date.now() - 40 * DAY).toISOString() })
      .select("id")
      .single();
    expect(error).toBeNull();
    await db.from("mission_criteria").insert([
      { user_id: uid, mission_id: mission!.id, label: "A", kind: "check", met_at: new Date(Date.now() - 10 * DAY).toISOString(), position: 0 },
      { user_id: uid, mission_id: mission!.id, label: "B", kind: "check", position: 1 },
    ]);

    await login(page);
    await page.goto("/scheduler/progress");
    await expect(page.getByLabel(`${title} 달성 예측`)).toContainText(/^최근 4주 속도면 \d+월 \d+일쯤 달성 · 마감보다 \d+일 늦어요\.$/);
  });
});
