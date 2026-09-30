import { expect, test, type Page } from "@playwright/test";
import { cleanup, dbAsUser, dragTo, E2E_PREFIX, login, slotPoint, tomorrowColumn } from "./helpers";

// Spec §69 acceptance (steps 2–7, 14–15, 18) and Phase 3 exit criteria.
const TEMPLATE = `${E2E_PREFIX} Technical Blog`;

test.describe("duration learning", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("3 completed 60→80 min tasks teach ×1.33, so the next drop creates 10:00–11:20", async ({ page }) => {
    const db = await dbAsUser();
    const { data: me } = await db.auth.getUser();
    const userId = me.user!.id;

    // Seed history: template + 3 planned tasks (est. 60) with 80 min of actual work each.
    const { data: tpl } = await db
      .from("task_templates")
      .insert({ user_id: userId, name: TEMPLATE })
      .select("id")
      .single();
    // Templates carry their name as a tag (D1): new tasks from the template inherit it.
    const { data: tag } = await db.from("tags").insert({ user_id: userId, name: TEMPLATE }).select("id").single();
    await db.from("template_tags").insert({ template_id: tpl!.id, tag_id: tag!.id, user_id: userId });
    const stamp = Date.now();
    const titles = [1, 2, 3].map((i) => `${E2E_PREFIX} 블로그 ${i} ${stamp}`);
    const { data: tasks, error } = await db
      .from("tasks")
      .insert(
        titles.map((title) => ({
          user_id: userId,
          title,
          template_id: tpl!.id,
          user_estimated_minutes: 60,
          status: "planned",
        })),
      )
      .select("id, title");
    expect(error).toBeNull();
    await db.from("task_tags").insert(tasks!.map((t) => ({ task_id: t.id, tag_id: tag!.id, user_id: userId })));
    // Old dates so they never overlap the owner's real sessions.
    await db.from("work_sessions").insert(
      tasks!.map((t, i) => ({
        user_id: userId,
        task_id: t.id,
        started_at: `2026-01-0${i + 1}T14:00:00Z`,
        ended_at: `2026-01-0${i + 1}T15:20:00Z`,
        source: "manual",
      })),
    );

    await login(page);

    // Completing each task refreshes the template profile (spec §61).
    for (const title of titles) {
      await page.getByRole("checkbox", { name: `${title} 완료로 표시` }).click();
      await expect(page.getByRole("checkbox", { name: `${title} 완료 취소` })).toBeVisible();
    }
    const groupCount = async () =>
      (await db.from("duration_groups").select("sample_count").eq("group_key", `tag:${tag!.id}`).maybeSingle()).data
        ?.sample_count ?? 0;
    await expect.poll(groupCount).toBe(3);

    // New similar task: estimate 60 → recommended 80, with an explanation.
    const title = `${E2E_PREFIX} 기술 블로그 새 글 ${stamp}`;
    await page.getByLabel("새 할 일").fill(title);
    await page.getByLabel("예상 시간(분)").fill("60");
    await page.getByLabel("템플릿").fill(TEMPLATE);
    await page.getByRole("button", { name: "할 일 추가" }).click();
    const item = page.locator("[data-draggable-task]", { hasText: title });
    await expect(item).toContainText("추천 1h 20m");

    await page.getByRole("button", { name: title, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: title });
    await expect(drawer).toContainText("예상 1h → 추천 1h 20m");
    // v2: no type yet, so the template-name tag group drives it (D1 spec §2).
    await expect(drawer).toContainText(`#${TEMPLATE} 태그 작업 3개 기준 · 신뢰도 보통`);
    await page.keyboard.press("Escape");

    // Drop at 10:00 → personalized 80-minute block 10:00–11:20.
    const date = await tomorrowColumn(page); // future slot: never "missed"
    const box = (await item.boundingBox())!;
    await dragTo(page, { x: box.x + 40, y: box.y + box.height / 2 }, await slotPoint(page, date!, "10:00"));
    await expect(savedEvent(page, title)).toContainText("10:00–11:20");
    const { data: task } = await db.from("tasks").select("id, recommended_minutes").eq("title", title).single();
    expect(task!.recommended_minutes).toBe(80);
    // Recommendation differs from the 60-minute estimate by ≥ 10 → toast offers keeping it.
    await page.getByRole("button", { name: "1h 유지" }).click();
    await expect(savedEvent(page, title)).toContainText("10:00–11:00");
    const { data: kept } = await db.from("schedule_blocks").select("starts_at, ends_at").eq("task_id", task!.id).single();
    expect((Date.parse(kept!.ends_at) - Date.parse(kept!.starts_at)) / 60_000).toBe(60);

    // Reopening removes a sample → back to cold start (no false confidence, §26.4).
    await page.getByRole("checkbox", { name: `${titles[0]} 완료 취소` }).click();
    await expect(item).not.toContainText("추천", { timeout: 15_000 });
    await expect.poll(groupCount).toBe(2);
  });
});

const savedEvent = (page: Page, title: string) =>
  page.locator(".fc-event.sched-block", { hasText: title });
