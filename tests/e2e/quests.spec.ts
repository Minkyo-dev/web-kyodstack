import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

const localDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));
const at = (date: string, hhmm: string) => {
  const probe = new Date(`${date}T12:00:00Z`);
  const tzHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Toronto" }).format(probe));
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h + 12 - tzHour, m)).toISOString();
};

test.describe("quests, achievements, titles, terminology", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("daily quest → swap once → clear; FIRST STEP → equip BUILDER; quest terminology", async ({ page }) => {
    // The enable backfill can be slow on a busy dev server; cleanup waits for it (see finally).
    test.setTimeout(240_000);
    let enabling = false;
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const start = new Date().toISOString();
    const { data: before } = await db
      .from("player_profiles")
      .select("gamification_enabled, quest_terminology, equipped_title, backfilled_at")
      .maybeSingle();
    const stamp = Date.now();
    try {
      if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: false }).eq("user_id", uid);

      // A task for today with a 15-minute timer session yesterday (FIRST STEP from history).
      const title = `${E2E_PREFIX} 퀘스트 ${stamp}`;
      const today = localDate(Date.now());
      const yesterday = localDate(Date.now() - 86_400_000);
      const { data: task } = await db.from("tasks").insert({ user_id: uid, title, target_date: today }).select("id").single();
      await db.from("work_sessions").insert({ user_id: uid, task_id: task!.id, source: "timer", started_at: at(yesterday, "05:00"), ended_at: at(yesterday, "05:15") });

      await login(page);
      await page.goto("/scheduler/progress");
      enabling = true;
      await page.getByRole("button", { name: "게임 요소 켜기" }).click();
      await expect(page.getByText(/지금까지 기록으로 Lv\.\d+에서 시작/)).toBeVisible({ timeout: 120_000 });

      // Daily quest panel; swap one objective once.
      await page.goto("/scheduler");
      const panel = page.getByRole("region", { name: "퀘스트" });
      await expect(panel).toContainText(/SYSTEM QUEST|오늘의 목표/); // G2 relabel; depends on the terminology setting
      await panel.getByRole("button", { name: /교체$/ }).first().click();
      await expect(page.getByText("목표를 바꿨습니다.")).toBeVisible();
      await expect(panel.getByRole("button", { name: /교체$/ })).toHaveCount(0);
      await expect(panel).toContainText("교체 사용함");

      // Make today's daily quest deterministic: every objective = start a timer session.
      const { data: daily } = await db.from("quests").select("id").eq("type", "daily").eq("period_start", today).single();
      await db.from("quest_objectives").update({ metric: "started_session", params: {}, target_value: 1 }).eq("quest_id", daily!.id);

      await page.reload();
      await page.getByRole("button", { name: `${title} 타이머 시작` }).click();
      const bar = page.getByRole("status", { name: "집중 중인 작업" });
      await expect(bar).toContainText(title);
      await bar.getByRole("button", { name: "종료" }).click();
      const summary = page.getByRole("dialog", { name: "작업 마치기" });
      await summary.getByRole("button", { name: "나중에 계속" }).click();
      await expect(summary).toHaveCount(0);
      await expect(page.getByText(/QUEST CLEARED · 모멘텀 쌓기 \+50 XP/)).toBeVisible();

      // FIRST STEP unlocked → equip BUILDER → shown under the level line.
      await page.goto("/scheduler/progress");
      const achievements = page.getByRole("region", { name: "업적" });
      await expect(achievements.getByRole("listitem").filter({ hasText: "FIRST STEP" })).toContainText("달성 ·");
      await page.getByRole("button", { name: "BUILDER 장착" }).click();
      await expect(page.getByText("칭호를 장착했습니다.")).toBeVisible();
      await expect(page.locator("aside").getByText("BUILDER")).toBeVisible();

      // Quest terminology across the UI.
      await page.getByRole("button", { name: "게임 요소 설정" }).click();
      await page.getByRole("checkbox", { name: /^퀘스트 용어/ }).check();
      await page.getByRole("button", { name: "저장" }).click();
      await expect(page.getByRole("link", { name: "메인 퀘스트" })).toBeVisible();
      await page.goto("/scheduler");
      await expect(page.getByPlaceholder("퀘스트 추가 (#태그 @영역)")).toBeVisible();
    } finally {
      // If the server is still finishing the backfill, its writes would land after cleanup: wait for it first.
      if (enabling) {
        await expect
          .poll(async () => (await db.from("player_profiles").select("backfilled_at").eq("user_id", uid).single()).data?.backfilled_at ?? null, { timeout: 120_000 })
          .not.toBeNull()
          .catch(() => undefined);
      }
      await db
        .from("player_profiles")
        .update(before ?? { gamification_enabled: false, quest_terminology: false, equipped_title: null, backfilled_at: null })
        .eq("user_id", uid);
      const { data: quests } = await db.from("quests").select("id").gte("created_at", start);
      const ids = (quests ?? []).map((q) => q.id);
      if (ids.length) {
        await db.from("xp_events").delete().eq("source_type", "quest").in("source_id", ids);
        await db.from("quests").delete().in("id", ids);
      }
      await db.from("user_titles").delete().gte("unlocked_at", start);
      await db.from("user_achievements").delete().gte("unlocked_at", start);
    }
  });
});
