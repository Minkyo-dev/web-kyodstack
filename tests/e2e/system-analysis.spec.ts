import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// F2: the analysis and the AI quest are seeded directly (no LLM cost, deterministic); the AI paths are covered by
// unit tests of the slot, evidence and quest validators.
test.describe("SYSTEM analysis and AI quests", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("analysis card, schedule setting, SYSTEM 추천 line", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const start = new Date().toISOString();
    const { data: settings } = await db.from("scheduler_settings").select("insight_weekday, insight_hour").single();
    const { data: profile } = await db.from("player_profiles").select("gamification_enabled").maybeSingle();
    const stamp = Date.now();
    let insightId: string | null = null;
    try {
      // Off while the page loads, so nothing calls the AI; the seeded analysis is newer than any slot anyway.
      await db.from("scheduler_settings").update({ insight_weekday: null }).eq("user_id", uid);
      // Deleted by id in finally: created_at comes from the DB clock, which can trail the local `start`.
      const { data: seeded } = await db.from("system_insights").insert({
        user_id: uid, kind: "weekly_analysis", period_start: "2026-09-23", period_end: "2026-09-29", input: {},
        content: {
          explanations: [
            { stat: "calibration", headline: `${E2E_PREFIX} 예상 정확도가 올랐어요 ${stamp}`, detail: "과소 예상이 줄었어요.", evidence: ["8개 작업 기준"] },
            { stat: "reliability", headline: "약속 블록을 잘 지키고 있어요", detail: "", evidence: [] },
          ],
          assessment: { planningTendency: "조금 낙관적", workStyle: "긴 집중 세션", currentRisk: null, strongPattern: "오전 실행이 안정적" },
        },
        model: "fake-1", prompt_version: "analysis-v1",
      }).select("id").single();
      insightId = seeded!.id;

      await login(page);
      await page.goto("/scheduler/progress");
      const card = page.getByRole("region", { name: "SYSTEM ANALYSIS" });
      await expect(card).toContainText(`예상 정확도가 올랐어요 ${stamp}`);
      await expect(card).toContainText("8개 작업 기준");
      await expect(card).toContainText("계획 경향");
      await expect(card).toContainText("자동 분석 꺼짐");
      await expect(card.getByRole("button", { name: "다시 분석" })).toBeDisabled();

      // Pick Wednesday 21:00.
      await card.locator("#analysis-weekday").selectOption("3");
      await card.locator("#analysis-hour").selectOption("21");
      await card.getByRole("button", { name: "저장" }).click();
      await expect(page.getByText("분석 시간을 저장했습니다.")).toBeVisible();
      await expect(card).toContainText("다음 분석 수 21:00");

      // AI-picked daily quest → "SYSTEM 추천" line in the quest panel.
      await db.from("player_profiles").update({ gamification_enabled: true }).eq("user_id", uid);
      await page.goto("/scheduler");
      const panel = page.getByRole("region", { name: "퀘스트" });
      await expect(panel).toContainText(/1% QUEST|오늘의 1%/); // G2 relabel; depends on the terminology setting
      await db.from("quests").update({ generated_by: "ai", reason: "오늘 계획에 맞춘 목표예요" }).eq("type", "daily").gte("created_at", start);
      await page.reload();
      await expect(panel).toContainText("SYSTEM 추천 · 오늘 계획에 맞춘 목표예요");
    } finally {
      await db.from("scheduler_settings").update(settings!).eq("user_id", uid);
      await db.from("player_profiles").update({ gamification_enabled: profile?.gamification_enabled ?? false }).eq("user_id", uid);
      const { data: quests } = await db.from("quests").select("id").gte("created_at", start);
      const ids = (quests ?? []).map((q) => q.id);
      if (ids.length) await db.from("quests").delete().in("id", ids);
      if (insightId) await db.from("system_insights").delete().eq("id", insightId);
    }
  });
});
