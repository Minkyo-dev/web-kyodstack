import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// Sub-project A: pause/resume with reason, summary → Continue Later, switch (hold).
test.describe("focus flow", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("pause (reason) → resume → Escape keeps timer → Continue Later → partial; switch holds", async ({ page }) => {
    const db = await dbAsUser();
    const { data: running } = await db.from("work_sessions").select("id").is("ended_at", null);
    test.skip((running?.length ?? 0) > 0, "A real timer is running on this account; not touching it.");

    const a = `${E2E_PREFIX} 집중 A ${Date.now()}`;
    const b = `${E2E_PREFIX} 집중 B ${Date.now()}`;
    await login(page);
    for (const title of [a, b]) {
      await page.getByLabel("새 할 일").fill(title);
      await page.getByRole("button", { name: "할 일 추가" }).click();
      await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
    }

    await page.getByRole("button", { name: `${a} 타이머 시작` }).click();
    const bar = page.getByRole("status", { name: "집중 중인 작업" });
    await expect(bar).toContainText(a);

    await bar.getByRole("button", { name: "일시정지" }).click();
    await expect(bar).toContainText("일시정지됨");
    await bar.getByRole("group", { name: "일시정지 이유" }).getByRole("button", { name: "커피" }).click();
    await expect(bar.getByRole("group", { name: "일시정지 이유" })).toHaveCount(0);

    const { data: taskA } = await db.from("tasks").select("id").eq("title", a).single();
    const { data: sessionA } = await db.from("work_sessions").select("id").eq("task_id", taskA!.id).single();
    await expect
      .poll(async () => (await db.from("work_session_pauses").select("reason").eq("session_id", sessionA!.id)).data)
      .toEqual([{ reason: "coffee" }]);

    await bar.getByRole("button", { name: "재개" }).click();
    await expect(bar.getByRole("button", { name: "일시정지" })).toBeVisible();
    const { data: pauses } = await db
      .from("work_session_pauses")
      .select("resumed_at")
      .eq("session_id", sessionA!.id);
    expect(pauses![0].resumed_at).not.toBeNull();

    // Escape closes the summary without saving; the timer keeps running (Review Focus 5)
    await bar.getByRole("button", { name: "종료" }).click();
    await page.getByRole("dialog", { name: "작업 마치기" }).waitFor();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "작업 마치기" })).toHaveCount(0);
    await expect(bar).toContainText(a);
    const { data: stillOpen } = await db.from("work_sessions").select("ended_at").eq("id", sessionA!.id).single();
    expect(stillOpen!.ended_at).toBeNull();

    // Switch to B, holding A
    await page.getByRole("button", { name: `${b} 타이머 시작` }).click();
    const sw = page.getByRole("dialog", { name: "작업 전환" });
    await sw.getByRole("button", { name: "보류하고 시작" }).click();
    await expect(sw).toHaveCount(0);
    await expect(bar).toContainText(b);
    const { data: heldA } = await db.from("work_sessions").select("ended_at").eq("id", sessionA!.id).single();
    expect(heldA!.ended_at).not.toBeNull();
    const { count: logsA } = await db
      .from("work_logs")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionA!.id);
    expect(logsA).toBe(0);

    // Finish B → Continue Later → B is partial
    await bar.getByRole("button", { name: "종료" }).click();
    const summary = page.getByRole("dialog", { name: "작업 마치기" });
    await summary.getByRole("button", { name: "나중에 계속" }).click();
    // The modal hides the page from the a11y tree, so wait for the dialog to close (save done) first.
    await expect(summary).toHaveCount(0);
    await expect(bar).toHaveCount(0);
    await expect(page.getByRole("listitem").filter({ hasText: b })).toContainText("부분 진행");
    const { data: taskB } = await db.from("tasks").select("status").eq("title", b).single();
    expect(taskB!.status).toBe("in_progress");
  });
});
