import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// Spec §49.4 flow 4 + manual sessions + daily reflection (Phase 2).
test.describe("actual work tracking", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("timer start → stop with focus → manual entry → overlap rejected → reflection", async ({ page }) => {
    const db = await dbAsUser();
    const { data: running } = await db.from("work_sessions").select("id").is("ended_at", null);
    test.skip((running?.length ?? 0) > 0, "A real timer is running on this account; not touching it.");

    const title = `${E2E_PREFIX} 타이머 ${Date.now()}`;
    await login(page);
    await page.getByLabel("새 할 일").fill(title);
    await page.getByRole("button", { name: "할 일 추가" }).click();
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();

    // Flow 4: start timer from the list → header timer appears → stop with focus 4
    await page.getByRole("button", { name: `${title} 타이머 시작` }).click();
    const timer = page.getByRole("status", { name: "실행 중인 타이머" });
    await expect(timer).toContainText(title);
    await expect(page.locator(".fc-event.sched-session--running", { hasText: title })).toBeVisible();

    await timer.getByRole("button", { name: "정지" }).click();
    const stopDialog = page.getByRole("dialog", { name: "작업 종료" });
    await stopDialog.getByRole("group", { name: "집중" }).getByText("4", { exact: true }).click();
    await stopDialog.getByRole("button", { name: "기록" }).click();
    await expect(timer).toHaveCount(0);

    const { data: task } = await db.from("tasks").select("id,status").eq("title", title).single();
    expect(task!.status).toBe("in_progress");
    const { data: timed } = await db
      .from("work_sessions")
      .select("ended_at,focus_score,source")
      .eq("task_id", task!.id)
      .single();
    expect(timed).toMatchObject({ focus_score: 4, source: "timer" });
    expect(timed!.ended_at).not.toBeNull();

    // Manual entry 00:05–00:50 today → 45 minutes
    await page.getByRole("button", { name: title, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: title });
    await drawer.getByRole("button", { name: "수동으로 기록 추가" }).click();
    const manual = drawer.getByRole("form", { name: "수동 작업 기록" });
    await manual.getByLabel("시작").fill("00:05");
    await manual.getByLabel("종료").fill("00:50");
    await manual.getByRole("button", { name: "기록" }).click();
    await expect(drawer.getByText("수동 · 45m")).toBeVisible();

    // Overlapping manual entry is rejected (actual time is never double-counted)
    await drawer.getByRole("button", { name: "수동으로 기록 추가" }).click();
    await manual.getByLabel("시작").fill("00:30");
    await manual.getByLabel("종료").fill("01:00");
    await manual.getByRole("button", { name: "기록" }).click();
    await expect(page.getByText("같은 시간대에 이미 작업 기록이 있습니다.")).toBeVisible();
    const { count } = await db
      .from("work_sessions")
      .select("id", { count: "exact", head: true })
      .eq("task_id", task!.id);
    expect(count).toBe(2);
    await page.keyboard.press("Escape");

    // Daily reflection: save, then restore whatever the owner had
    const today = await page.locator("td.fc-timegrid-col.fc-day-today").getAttribute("data-date");
    const { data: before } = await db
      .from("daily_reflections")
      .select("mood_score,focus_score,energy_score,note")
      .eq("reflection_date", today!)
      .maybeSingle();
    try {
      await page.getByRole("button", { name: /하루 마무리|회고 수정/ }).click();
      const dlg = page.getByRole("dialog", { name: "하루 마무리" });
      await expect(dlg.getByText("실제")).toBeVisible();
      await dlg.getByRole("group", { name: "기분" }).getByText("3", { exact: true }).click();
      await dlg.getByRole("button", { name: /저장|수정/ }).click();
      await expect(page.getByRole("button", { name: "회고 수정" })).toBeVisible();
      const { data: saved } = await db
        .from("daily_reflections")
        .select("mood_score")
        .eq("reflection_date", today!)
        .single();
      expect(saved!.mood_score).toBe(3);
    } finally {
      if (before) {
        await db.from("daily_reflections").update(before).eq("reflection_date", today!);
      } else {
        await db.from("daily_reflections").delete().eq("reflection_date", today!);
      }
    }
  });
});
