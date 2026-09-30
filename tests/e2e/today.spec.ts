import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

const localDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));
const at = (date: string, hhmm: string) => {
  // Toronto offset for that date: probe via Intl
  const probe = new Date(`${date}T12:00:00Z`);
  const tzHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Toronto" }).format(probe));
  const offset = 12 - tzHour; // hours behind UTC
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h + offset, m)).toISOString();
};

test.describe("today view and capacity", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("sections, week summary, capacity notice → adjust moves overflow to the next day", async ({ page }) => {
    const db = await dbAsUser();
    const { data: me } = await db.auth.getUser();
    const uid = me.user!.id;
    const { data: before } = await db.from("scheduler_settings").select("planned_work_days, min_meaningful_minutes").single();
    const stamp = Date.now();
    const today = localDate(Date.now());
    const tomorrow = localDate(Date.now() + 86_400_000);

    try {
      // Every day is a work day so the seeded history counts regardless of the weekday.
      await db.from("scheduler_settings").update({ planned_work_days: [0, 1, 2, 3, 4, 5, 6], min_meaningful_minutes: 30 }).eq("user_id", uid);

      // History: 10 past days × 60 min → capacity 60.
      const { data: hist } = await db.from("tasks").insert({ user_id: uid, title: `${E2E_PREFIX} 기록 ${stamp}` }).select("id").single();
      await db.from("work_sessions").insert(
        Array.from({ length: 10 }, (_, i) => {
          const d = localDate(Date.now() - (i + 2) * 86_400_000);
          return { user_id: uid, task_id: hist!.id, source: "manual", started_at: at(d, "09:00"), ended_at: at(d, "10:00") };
        }),
      );

      // Sections: a blockless task and a task with a block tomorrow (excluded from today).
      const loose = `${E2E_PREFIX} 미배정 ${stamp}`;
      await db.from("tasks").insert({ user_id: uid, title: loose, target_date: today });

      // Tomorrow: 3 × 60 min = 180 > 1.3 × 60 and +120 → notice.
      const titles = [1, 2, 3].map((i) => `${E2E_PREFIX} 내일 ${i} ${stamp}`);
      for (const [i, title] of titles.entries()) {
        const { data: t } = await db.from("tasks").insert({ user_id: uid, title, priority: 3 + i - 1 }).select("id").single();
        await db.rpc("create_schedule_block", {
          p_task_id: t!.id,
          p_starts_at: at(tomorrow, `${10 + i * 2}:00`),
          p_ends_at: at(tomorrow, `${11 + i * 2}:00`),
        });
      }

      await login(page);
      await expect(page.getByRole("region", { name: "미배정" })).toContainText(loose);
      await expect(page.getByLabel("주간 요약")).toContainText("계획");

      const notice = page.getByRole("note").filter({ hasText: "내일 계획" });
      await expect(notice).toContainText("보통 작업량 1h");
      await notice.getByRole("button", { name: "계획 조정" }).click();
      const dialog = page.getByRole("dialog", { name: "계획 조정" });
      await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(2); // 180 → ≤ 60 needs 2 moved
      await dialog.getByRole("button", { name: /다음 날 같은 시각으로/ }).click();
      await expect(dialog).toHaveCount(0);

      await expect
        .poll(async () => {
          const { data } = await db.from("schedule_blocks").select("starts_at, status").in("task_id",
            (await db.from("tasks").select("id").in("title", titles)).data!.map((x) => x.id));
          return data!.filter((b) => b.status === "planned" && localDate(Date.parse(b.starts_at)) === tomorrow).length;
        })
        .toBe(1);
    } finally {
      await db.from("scheduler_settings").update(before!).eq("user_id", uid);
    }
  });
});
