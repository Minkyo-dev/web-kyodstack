import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// F1: proposals and the work-log interpretation are seeded directly (deterministic, no LLM cost, as in
// ai-recommendations.spec); the request path is covered by unit tests of the validators.
const localDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));

test.describe("AI classification proposals and work-log interpretation", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("apply / ignore proposals; confirm a blocker → Calibration weight note", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const stamp = Date.now();
    const today = localDate(Date.now());
    const skill = `e2e-air${stamp}`;

    const { data: domain } = await db.from("practice_domains").insert({ user_id: uid, name: `E2E 도메인 ${stamp}` }).select("id").single();
    const mk = async (title: string, extra: Record<string, unknown> = {}) =>
      (await db.from("tasks").insert({ user_id: uid, title, target_date: today, ...extra }).select("id").single()).data!.id;
    const applyTitle = `${E2E_PREFIX} 분류 ${stamp}`;
    const ignoreTitle = `${E2E_PREFIX} 무시 ${stamp}`;
    const blockTitle = `${E2E_PREFIX} 방해 ${stamp}`;
    const applyId = await mk(applyTitle);
    const ignoreId = await mk(ignoreTitle);
    const blockId = await mk(blockTitle, { user_estimated_minutes: 60 });
    const proposal = (taskId: string, feature_type: string, feature_value: unknown) => ({
      user_id: uid, task_id: taskId, feature_type, feature_value, source: "ai", status: "proposed", confidence: 0.88, model: "fake-1", prompt_version: "classify-v1",
    });
    await db.from("task_features").insert([
      proposal(applyId, "task_type", "debugging"),
      proposal(applyId, "domain", domain!.id),
      proposal(applyId, "complexity", 4),
      proposal(applyId, "skills", [skill]),
      proposal(ignoreId, "task_type", "coding"),
    ]);
    // A finished session with a note the AI already interpreted as a technical blocker.
    const start = new Date(Date.now() - 3 * 3600_000).toISOString();
    const end = new Date(Date.now() - 2 * 3600_000).toISOString();
    const { data: session } = await db.from("work_sessions").insert({ user_id: uid, task_id: blockId, source: "timer", started_at: start, ended_at: end }).select("id").single();
    await db.from("work_logs").upsert(
      {
        user_id: uid, task_id: blockId, session_id: session!.id, note: "docker 환경 문제로 worker가 profile을 못 찾아서 오래 걸림",
        ai_interpretation: { delayReason: "environment_issue", scopeChanged: false, unexpectedBlocker: true, blockerType: "technical", confidence: 0.91 },
        interpretation_model: "fake-1", interpretation_version: "worklog-v1",
      },
      { onConflict: "session_id" },
    );

    await login(page);

    // Apply: type, domain, complexity and the skill tag land on the task.
    await page.getByRole("button", { name: applyTitle, exact: true }).click();
    let drawer = page.getByRole("dialog", { name: applyTitle });
    const chips = drawer.getByRole("region", { name: "SYSTEM 제안" });
    await expect(chips).toContainText("유형 디버깅");
    await expect(chips).toContainText(`#${skill}`);
    await chips.getByRole("button", { name: "적용" }).click();
    await expect(page.getByText("제안을 적용했습니다.")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "분류 제안 받기" })).toBeVisible();
    const { data: applied } = await db.from("tasks").select("task_type, practice_domain_id, complexity").eq("id", applyId).single();
    expect(applied).toEqual({ task_type: "debugging", practice_domain_id: domain!.id, complexity: 4 });
    const { data: tagRows } = await db.from("task_tags").select("tag:tags(name)").eq("task_id", applyId);
    expect(JSON.stringify(tagRows)).toContain(skill);
    await page.keyboard.press("Escape");

    // Ignore: the row disappears and the proposal is rejected.
    await page.getByRole("button", { name: ignoreTitle, exact: true }).click();
    drawer = page.getByRole("dialog", { name: ignoreTitle });
    await drawer.getByRole("region", { name: "SYSTEM 제안" }).getByRole("button", { name: "무시" }).click();
    await expect(drawer.getByRole("region", { name: "SYSTEM 제안" })).toHaveCount(0);
    await expect.poll(async () => (await db.from("task_features").select("status").eq("task_id", ignoreId).single()).data?.status).toBe("rejected");
    await page.keyboard.press("Escape");

    // Blocker confirmation in the work-log row.
    await page.getByRole("button", { name: blockTitle, exact: true }).click();
    drawer = page.getByRole("dialog", { name: blockTitle });
    await expect(drawer).toContainText("SYSTEM 해석 · 환경 문제 · 범위 변경 없음 · 예상 못한 방해");
    await expect(drawer).toContainText("외부 방해로 표시할까요?");
    await drawer.getByRole("button", { name: "표시", exact: true }).click();
    await expect(drawer).toContainText("외부 방해로 표시됨");
    await expect.poll(async () => (await db.from("work_logs").select("confirmed_blocker").eq("session_id", session!.id).single()).data?.confirmed_blocker).toBe(true);
    await page.keyboard.press("Escape");

    // Completed with the confirmed blocker → the Calibration card notes the weight.
    await db.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", blockId);
    await page.goto("/scheduler/progress");
    await expect(page.getByText(/외부 방해 \d+건은 가중치 0\.3/)).toBeVisible();
  });
});
