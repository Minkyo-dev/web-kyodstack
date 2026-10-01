import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

const localDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));
const at = (date: string, hhmm: string) => {
  const probe = new Date(`${date}T12:00:00Z`);
  const tzHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Toronto" }).format(probe));
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h + 12 - tzHour, m)).toISOString();
};
const levelFor = (total: number) => {
  let level = 1;
  let rest = total;
  while (rest >= 100 + 50 * level) { rest -= 100 + 50 * level; level += 1; }
  return { level, into: rest, need: 100 + 50 * level };
};

test.describe("gamification", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("enable → level line; completing earns XP and levels up; turning off hides it", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const { data: before } = await db
      .from("player_profiles")
      .select("gamification_enabled, animations_enabled, achievement_toasts, backfilled_at")
      .maybeSingle();
    const stamp = Date.now();
    const start = new Date().toISOString();
    try {
      if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: false }).eq("user_id", uid);

      // An open task for today with 15 focused minutes yesterday (eligible for completion XP).
      const title = `${E2E_PREFIX} XP ${stamp}`;
      const today = localDate(Date.now());
      const yesterday = localDate(Date.now() - 86_400_000);
      const { data: task } = await db.from("tasks").insert({ user_id: uid, title, target_date: today }).select("id").single();
      await db.from("work_sessions").insert({ user_id: uid, task_id: task!.id, source: "timer", started_at: at(yesterday, "06:00"), ended_at: at(yesterday, "06:15") });

      await login(page);
      await page.goto("/scheduler/progress");
      await page.getByRole("button", { name: "게임 요소 켜기" }).click();
      await expect(page.getByText(/지금까지 기록으로 Lv\.\d+에서 시작/)).toBeVisible({ timeout: 60_000 });
      const line = page.getByRole("link", { name: /^Lv\.\d+ · \d+ \/ \d+ XP$/ });
      await expect(line).toBeVisible();

      // One XP short of the next level: synthetic e2e events on an old date (cleanup removes them).
      const { data: p } = await db.from("player_profiles").select("total_xp").single();
      const lv = levelFor(p!.total_xp);
      let gap = lv.need - lv.into - 1;
      const events = [];
      while (gap > 0) {
        const xp = Math.min(120, gap);
        events.push({ rule: "focus", source_type: "e2e", source_id: randomUUID(), local_date: "2000-01-01", xp, metadata: { e2e: 1 } });
        gap -= xp;
      }
      if (events.length) await db.rpc("award_xp", { p_events: events });

      await page.goto("/scheduler");
      await page.getByRole("checkbox", { name: `${title} 완료로 표시` }).click();
      await expect(page.getByText(/^\+\d+ XP$/)).toBeVisible();
      const event = page.getByRole("dialog", { name: "LEVEL UP" });
      await expect(event).toContainText(`${lv.level} → ${lv.level + 1}`);
      await page.keyboard.press("Escape");
      await expect(event).toHaveCount(0);

      // Off: the line disappears; the scheduler still works.
      await page.goto("/scheduler/progress");
      await page.getByRole("button", { name: "게임 요소 설정" }).click();
      await page.getByRole("checkbox", { name: /^게임 요소/ }).uncheck();
      await page.getByRole("button", { name: "저장" }).click();
      await expect(page.getByRole("link", { name: /^Lv\.\d+ ·/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "게임 요소 켜기" })).toBeVisible();
    } finally {
      await db
        .from("player_profiles")
        .update(before ?? { gamification_enabled: false, backfilled_at: null })
        .eq("user_id", uid);
      // Enabling also generates quests and evaluates achievements (E2): remove what this test created.
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
