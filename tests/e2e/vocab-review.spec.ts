import { expect, test, type Page } from "@playwright/test";
import { dbAsUser, login } from "./helpers";

/** ADR 0046 V2 against the fake Notion: a keyboard review session, undo, 학습 완료, and the Notion write-back. */
test.skip(!!process.env.E2E_BASE_URL && process.env.NOTION_GATEWAY !== "fake", "needs a dev server started with NOTION_GATEWAY=fake");

async function clearVocab() {
  const db = await dbAsUser();
  for (const table of ["vocab_words", "vocab_settings", "notion_connections"] as const) {
    const { error } = await db.from(table).delete().not("user_id", "is", null);
    if (error) throw error;
  }
}

async function addWord(page: Page, term: string, meaning: string) {
  await page.getByLabel("새 단어").fill(term);
  await page.getByLabel("새 단어").press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("뜻").fill(meaning);
  await dialog.getByLabel("주제 (쉼표로 구분)").fill("e2e");
  await dialog.getByRole("button", { name: "Notion에 저장" }).click();
  await expect(page.getByRole("row", { name: new RegExp(term.replace(/[[\]]/g, "\\$&")) })).toBeVisible();
}

test.beforeEach(clearVocab);
test.afterAll(clearVocab);

test("review with the keyboard: reveal, rate, undo, again, 학습 완료, write-back", async ({ page }) => {
  await login(page);
  await page.goto("/english");
  await page.getByRole("link", { name: "Notion 연결" }).click();
  await page.getByLabel("[e2e] 공유 페이지").check();
  await page.getByRole("button", { name: "단어장 만들기" }).click();
  await expect(page.getByText("속성 정상")).toBeVisible();
  await page.goto("/english/words", { waitUntil: "networkidle" });
  await addWord(page, "[e2e] alpha", "첫째");
  await addWord(page, "[e2e] beta", "둘째");

  await page.goto("/english", { waitUntil: "networkidle" });
  await expect(page.getByText("복습 0 · 새 단어 2")).toBeVisible();
  await page.getByRole("link", { name: "복습 시작" }).click();
  await page.waitForLoadState("networkidle");

  const card = page.locator("article");
  await expect(card).toContainText("[e2e] alpha");
  await page.keyboard.press("Space");
  await expect(card).toContainText("첫째");
  await expect(page.getByRole("button", { name: /알맞음/ })).toBeVisible();
  await page.keyboard.press("3");
  await expect(card).toContainText("[e2e] beta");

  // Z undoes the last rating: alpha comes back.
  await page.keyboard.press("z");
  await expect(page.getByText("방금 평가를 되돌렸어요.")).toBeVisible();
  await expect(card).toContainText("[e2e] alpha");

  // Again (1) brings alpha back in this session, after beta.
  await page.keyboard.press("Space");
  await page.keyboard.press("1");
  await expect(card).toContainText("[e2e] beta");
  await page.keyboard.press("Space");
  await page.keyboard.press("3");
  await expect(card).toContainText("[e2e] alpha");

  // A focused button keeps its own Enter (keyboard users who Tab): "어려움" for alpha, which comes back once more.
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /어려움/ }).focus();
  await page.keyboard.press("Enter");
  await expect(card).toContainText("[e2e] beta");

  // beta's 10-minute learning step is done with Easy; then D marks alpha 학습 완료 and the session ends.
  await page.keyboard.press("Space");
  await page.keyboard.press("4");
  await expect(card).toContainText("[e2e] alpha");
  await page.keyboard.press("d");
  await expect(page.getByText("오늘 복습을 마쳤어요")).toBeVisible();

  const db = await dbAsUser();
  const { data: words } = await db.from("vocab_words").select("id, term").like("term", "[e2e]%").order("term");
  const [alpha, beta] = words!;
  const { data: reviews } = await db.from("vocab_reviews").select("rating, vocab_cards!inner(word_id)").order("created_at");
  expect(reviews?.map((r) => r.rating)).toEqual([1, 3, 2, 4]);
  const { data: alphaCards } = await db.from("vocab_cards").select("suspended_at").eq("word_id", alpha.id);
  expect(alphaCards?.every((c) => c.suspended_at !== null)).toBe(true);

  // finishSession flushes the outbox after responding: Notion's 상태 follows.
  await expect
    .poll(async () => (await db.from("vocab_words").select("term, notion_status").in("id", [alpha.id, beta.id]).order("term")).data?.map((w) => w.notion_status))
    .toEqual(["학습 완료", "학습 중"]);
  // Written rows are closed, so the next flush doesn't send them again.
  await expect.poll(async () => (await db.from("vocab_outbox").select("id").is("done_at", null)).data?.length).toBe(0);

  await page.goto("/english/words", { waitUntil: "networkidle" });
  await expect(page.getByRole("row", { name: /\[e2e\] alpha/ })).toContainText("학습 완료");
  await expect(page.getByRole("row", { name: /\[e2e\] beta/ })).toContainText("학습 중");
});
