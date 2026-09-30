import { expect, test, type Page } from "@playwright/test";
import { cleanup, dbAsUser, dragTo, E2E_PREFIX, login, slotPoint } from "./helpers";

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
    await expect
      .poll(async () => {
        const { data } = await db
          .from("task_duration_profiles")
          .select("sample_count, recommended_correction_factor")
          .eq("task_template_id", tpl!.id)
          .eq("complexity_bucket", 0)
          .maybeSingle();
        return data ? [data.sample_count, Number(data.recommended_correction_factor)] : null;
      })
      .toEqual([3, 1.3333]);

    // New similar task: estimate 60 → recommended 80, with an explanation.
    const title = `${E2E_PREFIX} 기술 블로그 새 글 ${stamp}`;
    await page.getByLabel("새 할 일").fill(title);
    await page.getByLabel("예상 시간(분)").fill("60");
    await page.getByLabel("작업 유형").fill(TEMPLATE);
    await page.getByRole("button", { name: "할 일 추가" }).click();
    const item = page.locator("[data-draggable-task]", { hasText: title });
    await expect(item).toContainText("추천 1h 20m");

    await page.getByRole("button", { name: title, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: title });
    await expect(drawer).toContainText("예상 1h → 추천 1h 20m");
    // All samples share complexity 3, so the more specific template+complexity profile wins (§26.6).
    await expect(drawer).toContainText("비슷한 완료 작업 3개 (난이도 3) 기준, 보통 예상보다 33% 더 걸립니다");
    await page.keyboard.press("Escape");

    // Drop at 10:00 → personalized 80-minute block 10:00–11:20.
    const date = await page.locator("td.fc-timegrid-col.fc-day-today").getAttribute("data-date");
    const box = (await item.boundingBox())!;
    await dragTo(page, { x: box.x + 40, y: box.y + box.height / 2 }, await slotPoint(page, date!, "10:00"));
    await expect(savedEvent(page, title)).toContainText("10:00–11:20");
    const { data: task } = await db.from("tasks").select("id, recommended_minutes").eq("title", title).single();
    expect(task!.recommended_minutes).toBe(80);

    // Reopening removes a sample → back to cold start (no false confidence, §26.4).
    await page.getByRole("checkbox", { name: `${titles[0]} 완료 취소` }).click();
    await expect(item).not.toContainText("추천", { timeout: 15_000 });
    const { data: after } = await db
      .from("task_duration_profiles")
      .select("sample_count, recommended_correction_factor")
      .eq("task_template_id", tpl!.id)
      .eq("complexity_bucket", 0)
      .single();
    expect(after).toEqual({ sample_count: 2, recommended_correction_factor: null });
  });
});

const savedEvent = (page: Page, title: string) =>
  page.locator(".fc-event.sched-block", { hasText: title });
