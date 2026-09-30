import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

const iso = (ms: number) => new Date(ms).toISOString();
const localDate = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));

test.describe("calendar planning", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("start from a block without opening the drawer", async ({ page }) => {
    const db = await dbAsUser();
    const { data: running } = await db.from("work_sessions").select("id").is("ended_at", null);
    test.skip((running?.length ?? 0) > 0, "A real timer is running on this account; not touching it.");
    const { data: me } = await db.auth.getUser();
    const title = `${E2E_PREFIX} 블록 시작 ${Date.now()}`;
    const { data: task } = await db
      .from("tasks")
      .insert({ user_id: me.user!.id, title, user_estimated_minutes: 60 })
      .select("id")
      .single();
    const start = Date.now() + 5 * 60_000;
    const { data: block } = await db
      .rpc("create_schedule_block", { p_task_id: task!.id, p_starts_at: iso(start), p_ends_at: iso(start + 3_600_000) })
      .single();

    await login(page);
    await page.goto(`/scheduler?week=${localDate(start)}`);
    const event = page.locator(".fc-event.sched-block", { hasText: title });
    await event.hover();
    await event.getByRole("button", { name: `${title} 시작` }).click();
    await expect(page.getByRole("status", { name: "집중 중인 작업" })).toContainText(title);
    await expect(page.getByRole("dialog", { name: title })).toHaveCount(0); // drawer did not open
    const { data: session } = await db
      .from("work_sessions")
      .select("schedule_block_id")
      .eq("task_id", task!.id)
      .single();
    expect(session!.schedule_block_id).toBe((block as { id: string }).id);
  });

  test("missed block → reschedule tomorrow creates a new block and keeps the miss", async ({ page }) => {
    const db = await dbAsUser();
    const { data: me } = await db.auth.getUser();
    const title = `${E2E_PREFIX} 놓친 블록 ${Date.now()}`;
    const { data: task } = await db
      .from("tasks")
      .insert({ user_id: me.user!.id, title, user_estimated_minutes: 30 })
      .select("id")
      .single();
    const start = Date.now() - 2 * 3_600_000;
    const { data: created } = await db
      .rpc("create_schedule_block", { p_task_id: task!.id, p_starts_at: iso(start), p_ends_at: iso(start + 1_800_000) })
      .single();
    const oldId = (created as { id: string }).id;

    await login(page);
    await page.goto(`/scheduler?week=${localDate(start)}`);
    const event = page.locator(".fc-event.sched-block", { hasText: title });
    await expect(event).toContainText("놓침");
    await event.getByRole("button", { name: `${title} 일정 메뉴` }).click();
    await page.getByRole("menuitem", { name: /^내일 / }).click();

    await expect
      .poll(async () => (await db.from("schedule_blocks").select("id").eq("task_id", task!.id)).data?.length)
      .toBe(2);
    const { data: blocks } = await db
      .from("schedule_blocks")
      .select("id, status, starts_at")
      .eq("task_id", task!.id)
      .order("starts_at");
    expect(blocks![0]).toMatchObject({ id: oldId, status: "missed" });
    expect(blocks![1].status).toBe("planned");
    expect(localDate(Date.parse(blocks![1].starts_at))).toBe(localDate(start + 86_400_000));
  });

  test("actual-work toggle hides finished sessions; the default setting persists", async ({ page }) => {
    const db = await dbAsUser();
    const { data: me } = await db.auth.getUser();
    const { data: settings } = await db.from("scheduler_settings").select("show_actual_default").single();
    const title = `${E2E_PREFIX} 실제 표시 ${Date.now()}`;
    const { data: task } = await db
      .from("tasks")
      .insert({ user_id: me.user!.id, title })
      .select("id")
      .single();
    const start = Date.now() - 26 * 3_600_000; // yesterday-ish, never in the future
    await db.from("work_sessions").insert({
      user_id: me.user!.id,
      task_id: task!.id,
      started_at: iso(start),
      ended_at: iso(start + 1_800_000),
      source: "manual",
    });
    try {
      await db.from("scheduler_settings").update({ show_actual_default: false }).eq("user_id", me.user!.id);
      await login(page);
      await page.goto(`/scheduler?week=${localDate(start)}`);
      const session = page.locator(".fc-event.sched-session", { hasText: title });
      await expect(session).toHaveCount(0);
      await page.getByLabel("실제 작업 보기").check();
      await expect(session.first()).toBeVisible();

      await page.getByRole("button", { name: "스케줄러 설정" }).click();
      await page.getByRole("menuitemcheckbox", { name: "실제 작업을 기본으로 표시" }).click();
      await expect
        .poll(async () => (await db.from("scheduler_settings").select("show_actual_default").single()).data?.show_actual_default)
        .toBe(true);
      await page.reload();
      await expect(page.getByLabel("실제 작업 보기")).toBeChecked();
    } finally {
      await db
        .from("scheduler_settings")
        .update({ show_actual_default: settings!.show_actual_default })
        .eq("user_id", me.user!.id);
    }
  });
});
