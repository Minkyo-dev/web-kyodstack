import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

/** Local week start (date-fns weekStartsOn semantics: 0 = Sunday) for the user's zone. */
function weekStart(timezone: string, weekStartsOn: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const back = (t.getUTCDay() - weekStartsOn + 7) % 7;
  return new Date(t.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

// ADR 0042: the 비서 panel shows the conversation and its proposal cards; [적용] creates the task through the task
// service; [새 대화] clears the conversation. Seeded rows only — E2E never calls the LLM.
test.describe("assistant chat", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("seeded conversation → apply a task proposal → new conversation", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const [{ data: profile }, { data: settings }] = await Promise.all([
      db.from("profiles").select("timezone").eq("id", uid).single(),
      db.from("scheduler_settings").select("week_starts_on").eq("user_id", uid).single(),
    ]);
    await db.from("assistant_messages").delete().gte("created_at", "2000-01-01");
    const title = `${E2E_PREFIX} Chat task ${Date.now()}`;
    const { data: proposal } = await db
      .from("assistant_proposals")
      .insert({
        user_id: uid,
        week_start: weekStart(profile!.timezone, settings!.week_starts_on),
        kind: "create_task",
        target_key: `chat:e2e:${Date.now()}`,
        title,
        reason: "요청하신 작업이에요",
        payload: { title, targetDate: null, estimateMinutes: 90, missionId: null },
        rules_version: "chat-v1",
      })
      .select("id")
      .single();
    await db.from("assistant_messages").insert({ user_id: uid, role: "user", content: "보고서 시간 잡아줘" });
    // created_at must order after the user message.
    await db.from("assistant_messages").insert({
      user_id: uid,
      role: "assistant",
      content: "할 일 제안을 만들었어요.\n아래 카드에서 적용할 수 있어요.",
      proposal_ids: [proposal!.id],
      created_at: new Date(Date.now() + 1000).toISOString(),
    });

    await login(page);
    await page.goto("/scheduler/review");
    await page.getByRole("button", { name: "비서 열기" }).click();
    const log = page.getByRole("log", { name: "대화" });
    await expect(log.getByLabel("내 메시지")).toHaveText("보고서 시간 잡아줘");
    await expect(log.getByLabel("비서 답변")).toContainText("아래 카드에서 적용할 수 있어요.");
    // Chat proposals stay in the chat, not in the weekly coaching section.
    await expect(page.getByRole("region", { name: "코칭" }).getByText(title)).toHaveCount(0);

    const card = log.getByRole("group", { name: `제안 ${title}` });
    await card.getByRole("button", { name: "적용" }).click();
    await expect(page.getByText("할 일을 추가했습니다.")).toBeVisible();
    await expect(card).toContainText("적용함");
    await expect
      .poll(async () => (await db.from("tasks").select("title, user_estimated_minutes, status").eq("title", title).maybeSingle()).data)
      .toMatchObject({ title, user_estimated_minutes: 90 });

    await page.getByRole("button", { name: "새 대화" }).click();
    await expect(page.getByText("대화를 비웠습니다.")).toBeVisible();
    await expect(log.getByLabel("비서 답변")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "오늘 뭐부터 할까?" })).toBeVisible();
    await expect.poll(async () => (await db.from("assistant_proposals").select("status").eq("id", proposal!.id).single()).data?.status).toBe("applied");
  });
});
