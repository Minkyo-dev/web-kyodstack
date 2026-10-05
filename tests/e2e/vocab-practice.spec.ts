import { expect, test } from "@playwright/test";
import { dbAsUser, login } from "./helpers";

/** ADR 0046 V5 against the fake Notion and the fake AI: a CEFR practice set, feedback with a diff, a retry, history. */
test.skip(
  !!process.env.E2E_BASE_URL && (process.env.NOTION_GATEWAY !== "fake" || process.env.AI_PROVIDER !== "fake"),
  "needs a dev server started with NOTION_GATEWAY=fake AI_PROVIDER=fake",
);
test.skip(!process.env.E2E_BASE_URL && process.env.AI_PROVIDER !== "fake", "the AI steps need AI_PROVIDER=fake on the dev server");

async function clearVocab() {
  const db = await dbAsUser();
  for (const table of ["vocab_practice_sessions", "vocab_words", "vocab_settings", "notion_connections"] as const) {
    const { error } = await db.from(table).delete().not("user_id", "is", null);
    if (error) throw error;
  }
}

test.beforeEach(clearVocab);
test.afterAll(clearVocab);

test("practice at B2: Korean sentence → answer → feedback → retry → history", async ({ page }) => {
  await login(page);
  await page.goto("/english");
  await page.getByRole("link", { name: "Notion 연결" }).click();
  await page.getByLabel("[e2e] 공유 페이지").check();
  await page.getByRole("button", { name: "단어장 만들기" }).click();
  await expect(page.getByText("속성 정상")).toBeVisible();
  await page.goto("/english/words", { waitUntil: "networkidle" });
  for (const [term, meaning] of [["[e2e] ubiquitous", "어디에나 있는"], ["[e2e] commute", "통근하다"]]) {
    await page.getByLabel("새 단어").fill(term);
    await page.getByLabel("새 단어").press("Enter");
    await page.getByRole("dialog").getByLabel("뜻").fill(meaning);
    await page.getByRole("dialog").getByRole("button", { name: "Notion에 저장" }).click();
    await expect(page.getByRole("row", { name: new RegExp(term.replace(/[[\]]/g, "\\$&")) })).toBeVisible();
  }

  await page.goto("/english/practice", { waitUntil: "networkidle" });
  await page.getByLabel(/직접 고르기/).check();
  await page.getByRole("checkbox", { name: /\[e2e\] ubiquitous/ }).check();
  await page.getByRole("checkbox", { name: /\[e2e\] commute/ }).check();
  await page.getByRole("button", { name: "B2", exact: true }).click();
  await expect(page.getByText("B2 — 추상·업무 주제 · 수동태, 관계절")).toBeVisible();
  await page.getByRole("button", { name: "연습 시작" }).click();

  await expect(page).toHaveURL(/\/english\/practice\/[0-9a-f-]{36}$/);
  await expect(page.getByText("문장 1 / 2")).toBeVisible();
  await expect(page.getByText(/연습 문장 1:/)).toBeVisible();
  await page.getByRole("button", { name: "힌트" }).click();
  await expect(page.getByText("힌트: 현재형")).toBeVisible();

  const input = page.getByLabel("영어 번역");
  await input.fill("I goes to school.");
  await input.press("Enter");
  await expect(page.getByText("거의 맞았어요")).toBeVisible();
  await expect(page.locator("ins", { hasText: "go" })).toBeVisible();
  await expect(page.locator("del", { hasText: "goes" }).first()).toBeVisible();
  await expect(page.getByText("주어가 I일 때는 go를 써요.")).toBeVisible();
  await expect(page.getByText("These days, smartphones are everywhere.")).toBeVisible();
  await expect(page.getByText("캐주얼")).toBeVisible();

  await page.getByRole("button", { name: "다시 써보기" }).click();
  await expect(input).toHaveValue("I goes to school.");
  await input.fill("I go to school.");
  await input.press("Enter");
  await expect(page.getByText("자연스러워요")).toBeVisible();
  await expect(page.getByText("이전 시도 1개")).toBeVisible();

  await page.getByRole("button", { name: "다음 문장" }).click();
  await expect(page.getByText("문장 2 / 2")).toBeVisible();

  await page.goto("/english/practice", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: /B2\s*직접 고름.*1\/2문장/ })).toBeVisible();

  const db = await dbAsUser();
  const { count: attempts } = await db.from("vocab_practice_attempts").select("id", { count: "exact", head: true });
  expect(attempts).toBe(2);
  const { count: calls } = await db.from("ai_calls").select("id", { count: "exact", head: true }).like("kind", "vocab.practice.%");
  expect(calls).toBeGreaterThanOrEqual(3);
});
