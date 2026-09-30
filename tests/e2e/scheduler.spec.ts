import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { cleanup, dbAsUser, dragTo, E2E_PREFIX, login, slotPoint, tomorrowColumn } from "./helpers";

const savedEvent = (page: Page, title: string) =>
  page.locator(".fc-event.sched-block", { hasText: title });

// Spec §49.4 flows 1–3.
test.describe("scheduler core", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("create → drag to calendar → persists → move/resize write revisions", async ({ page }) => {
    const title = `${E2E_PREFIX} 기술 블로그 ${Date.now()}`;
    await login(page);

    // Flow 1: create task → appears in Today
    await page.getByLabel("새 할 일").fill(title);
    await page.getByLabel("예상 시간(분)").fill("60");
    await page.getByRole("button", { name: "할 일 추가" }).click();
    const item = page.locator("[data-draggable-task]", { hasText: title });
    await expect(item).toBeVisible();

    // Flow 2: drag to calendar → 60-min block (no history yet) → survives reload
    const date = await tomorrowColumn(page); // future slot: never "missed"
    expect(date).toBeTruthy();
    const itemBox = (await item.boundingBox())!;
    await dragTo(page, { x: itemBox.x + 40, y: itemBox.y + itemBox.height / 2 }, await slotPoint(page, date!, "10:00"));

    // Wait for the server-backed block (the temporary drop preview has no .sched-block class).
    await expect(savedEvent(page, title)).toContainText("10:00–11:00");
    await page.reload();
    await expect(savedEvent(page, title)).toContainText("10:00–11:00");

    const db = await dbAsUser();
    const { data: task } = await db.from("tasks").select("id,status").eq("title", title).single();
    expect(task!.status).toBe("planned");
    const { data: block } = await db
      .from("schedule_blocks")
      .select("id,source")
      .eq("task_id", task!.id)
      .single();
    expect(block!.source).toBe("duration_recommendation");

    // Flow 3a: move to 13:00 → persists → 'moved' revision
    const ev = savedEvent(page, title);
    const evBox = (await ev.boundingBox())!;
    const target = await slotPoint(page, date!, "13:00");
    await dragTo(page, { x: evBox.x + evBox.width / 2, y: evBox.y + 6 }, { x: target.x, y: target.y + 4 });
    await expect(savedEvent(page, title)).toContainText("13:00–14:00");
    await page.reload();
    await expect(savedEvent(page, title)).toContainText("13:00–14:00");

    // Flow 3b: resize bottom edge to 14:30 → 'resized' revision
    const ev2 = savedEvent(page, title);
    await ev2.hover();
    const handle = ev2.locator(".fc-event-resizer-end");
    const hBox = (await handle.boundingBox())!;
    // Extend the end edge (currently 14:00) by exactly two 15-minute slots.
    const at1400 = await slotPoint(page, date!, "14:00");
    const at1430 = await slotPoint(page, date!, "14:30");
    const hx = hBox.x + hBox.width / 2;
    const hy = hBox.y + hBox.height / 2;
    await dragTo(page, { x: hx, y: hy }, { x: hx, y: hy + (at1430.y - at1400.y) });
    await expect(savedEvent(page, title)).toContainText("13:00–14:30");

    await expect
      .poll(async () => {
        const { data } = await db
          .from("schedule_block_revisions")
          .select("change_type")
          .eq("schedule_block_id", block!.id)
          .order("created_at");
        return data?.map((r) => r.change_type);
      })
      .toEqual(["created", "moved", "resized"]);
  });
});
