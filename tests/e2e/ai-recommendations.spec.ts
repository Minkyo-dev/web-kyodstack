import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// Spec §49.4 flow 5: project → milestone → accept AI recommendation → task linked.
// The recommendation is seeded directly (deterministic, no LLM cost); generation is
// covered by unit tests of the guardrails and a manual smoke run.
const todayToronto = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

test.describe("AI recommendations", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("edit + accept creates a linked task; reject leaves no task", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const project = `${E2E_PREFIX} MLB ${Date.now()}`;
    const { data: p } = await db.from("projects").insert({ user_id: uid, name: project }).select("id").single();
    const { data: m } = await db
      .from("milestones")
      .insert({ user_id: uid, project_id: p!.id, name: "M1 Data Ingestion" })
      .select("id")
      .single();
    const accept = `${E2E_PREFIX} ESPN games endpoint 수집`;
    const reject = `${E2E_PREFIX} 거절할 추천`;
    await db.from("ai_recommendations").insert([
      {
        user_id: uid, project_id: p!.id, milestone_id: m!.id, recommendation_date: todayToronto(),
        recommendation_type: "milestone_task", title: accept, estimated_minutes: 70, priority: 1,
        rationale: "마일스톤 마감 3일 전, 수집 작업이 남아 있습니다.", provider: "fake", model: "fake-1", prompt_version: "v1",
      },
      {
        user_id: uid, project_id: p!.id, recommendation_date: todayToronto(),
        recommendation_type: "daily_task", title: reject, estimated_minutes: 30, priority: 3,
        rationale: "r", provider: "fake", model: "fake-1", prompt_version: "v1",
      },
    ]);

    await login(page);
    const recs = page.getByRole("list", { name: "AI 추천 목록" });
    const item = recs.getByRole("listitem", { name: `AI 추천: ${accept}` });
    await expect(item).toContainText(`${project} › M1 Data Ingestion`);

    // No task exists before acceptance (AI never writes tasks directly, spec §3.4).
    expect((await db.from("tasks").select("id").eq("title", accept)).data).toHaveLength(0);

    // Explainable → editable → accepted.
    await item.getByRole("button", { name: accept }).click();
    await expect(item).toContainText("이유: 마일스톤 마감 3일 전");
    await item.getByRole("button", { name: "수정" }).click();
    await item.getByLabel("예상 시간(분)").fill("90");
    await item.getByRole("button", { name: "수락" }).click();

    const task = page.locator("[data-draggable-task]", { hasText: accept });
    await expect(task).toContainText(`${project} › M1 Data Ingestion`);
    await expect(task).toContainText("예상 1h 30m");
    await expect(recs.getByRole("listitem", { name: `AI 추천: ${accept}` })).toHaveCount(0);

    await recs.getByRole("listitem", { name: `AI 추천: ${reject}` }).getByRole("button", { name: "거절", exact: true }).click();
    await expect(page.getByRole("listitem", { name: `AI 추천: ${reject}` })).toHaveCount(0);

    const { data: rows } = await db
      .from("ai_recommendations")
      .select("title, status, task_id, decided_at")
      .eq("project_id", p!.id)
      .order("title");
    const byTitle = Object.fromEntries(rows!.map((r) => [r.title, r]));
    expect(byTitle[accept]).toMatchObject({ status: "accepted" });
    expect(byTitle[accept].task_id).not.toBeNull();
    expect(byTitle[reject]).toMatchObject({ status: "rejected", task_id: null });
    expect((await db.from("tasks").select("id").eq("title", reject)).data).toHaveLength(0);

    const { data: created } = await db
      .from("tasks")
      .select("user_estimated_minutes, project_id, milestone_id, priority")
      .eq("title", accept)
      .single();
    expect(created).toEqual({ user_estimated_minutes: 90, project_id: p!.id, milestone_id: m!.id, priority: 1 });
  });
});
