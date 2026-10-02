import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

const localDate = (timezone: string, offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

// ADR 0039: the evening check-in picks tomorrow's one thing → the next morning's brief shows it → start it from there.
test.describe("assistant brief", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("check-in → next day's one thing → start", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const { data: profile } = await db.from("profiles").select("timezone").eq("id", uid).single();
    const today = localDate(profile!.timezone);
    // Yesterday in the user's zone: today's local date minus one calendar day.
    const [y, m, d] = today.split("-").map(Number);
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    const { data: backup } = await db.from("daily_reflections").select("*").in("reflection_date", [today, yesterday]);
    await db.from("daily_reflections").delete().in("reflection_date", [today, yesterday]);

    const title = `${E2E_PREFIX} Brief one thing ${Date.now()}`;
    await db.from("tasks").insert({ user_id: uid, title, status: "planned", priority: 1 });
    try {
      await login(page);
      await page.goto("/scheduler");

      // Evening check-in (opened from the footer; the brief offers the same dialog after the evening hour).
      await page.locator("footer[aria-label=\"오늘 요약\"]").getByRole("button", { name: "하루 마무리" }).click();
      const dialog = page.getByRole("dialog", { name: "하루 마무리" });
      await dialog.getByLabel("오늘 잘한 한 가지 (선택)").fill("Shipped the draft");
      await dialog.getByRole("group", { name: "무엇이 가장 막았나요? (선택)" }).getByText("에너지", { exact: true }).click();
      await dialog.getByLabel("내일 가장 먼저 할 한 가지 (선택)").selectOption({ label: title });
      await dialog.getByRole("button", { name: "저장" }).click();
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(async () => (await db.from("daily_reflections").select("win, blocker, next_task_id").eq("reflection_date", today).single()).data)
        .toMatchObject({ win: "Shipped the draft", blocker: "energy", next_task_id: expect.any(String) });

      // Pretend a day passed: today's check-in becomes yesterday's.
      await db.from("daily_reflections").update({ reflection_date: yesterday }).eq("reflection_date", today);
      await page.reload();
      const oneThing = page.getByRole("listitem", { name: "오늘의 한 가지" });
      await expect(oneThing).toContainText(title);
      await expect(oneThing).toContainText("어제 정한 일");
      await expect(page.getByRole("listitem", { name: "어제 체크인" })).toContainText("Shipped the draft");
      await expect(page.getByRole("listitem", { name: "어제 체크인" })).toContainText("에너지");

      await oneThing.getByRole("button", { name: `오늘의 한 가지 시작: ${title}` }).click();
      const bar = page.getByRole("status", { name: "집중 중인 작업" });
      await expect(bar).toContainText(title);
      await bar.getByRole("button", { name: "종료" }).click();
      await page.getByRole("dialog", { name: "작업 마치기" }).getByRole("button", { name: "나중에 계속" }).click();
    } finally {
      await db.from("daily_reflections").delete().in("reflection_date", [today, yesterday]);
      if (backup?.length) await db.from("daily_reflections").insert(backup);
    }
  });
});
