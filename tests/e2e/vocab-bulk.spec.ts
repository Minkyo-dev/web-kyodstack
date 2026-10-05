import { expect, test } from "@playwright/test";
import { dbAsUser, login } from "./helpers";

/** ADR 0046 V4 against the fake Notion and the fake AI: [AI 채우기] in the add dialog, and bulk add. */
test.skip(
  !!process.env.E2E_BASE_URL && (process.env.NOTION_GATEWAY !== "fake" || process.env.AI_PROVIDER !== "fake"),
  "needs a dev server started with NOTION_GATEWAY=fake AI_PROVIDER=fake",
);
test.skip(!process.env.E2E_BASE_URL && process.env.AI_PROVIDER !== "fake", "the AI steps need AI_PROVIDER=fake on the dev server");

async function clearVocab() {
  const db = await dbAsUser();
  for (const table of ["vocab_words", "vocab_settings", "notion_connections"] as const) {
    const { error } = await db.from(table).delete().not("user_id", "is", null);
    if (error) throw error;
  }
}

test.beforeEach(clearVocab);
test.afterAll(clearVocab);

test("AI fills empty fields, and bulk add writes the checked lines to Notion", async ({ page }) => {
  await login(page);
  await page.goto("/english");
  await page.getByRole("link", { name: "Notion 연결" }).click();
  await page.getByLabel("[e2e] 공유 페이지").check();
  await page.getByRole("button", { name: "단어장 만들기" }).click();
  await expect(page.getByText("속성 정상")).toBeVisible();

  // Single add: [AI 채우기] fills only empty fields; the typed meaning stays.
  await page.goto("/english/words", { waitUntil: "networkidle" });
  await page.getByLabel("새 단어").fill("[e2e] delta");
  await page.getByLabel("새 단어").press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("뜻").fill("넷째");
  await dialog.getByRole("button", { name: "AI 채우기" }).click();
  await expect(page.getByText("AI가 빈 칸을 채웠어요. 확인한 뒤 저장해 주세요.")).toBeVisible();
  await expect(dialog.getByLabel("뜻")).toHaveValue("넷째");
  await expect(dialog.getByLabel("예문")).toHaveValue("This is [e2e] delta.");
  await expect(dialog.getByLabel("레벨")).toHaveValue("B1");
  await dialog.getByRole("button", { name: "Notion에 저장" }).click();
  await expect(page.getByRole("row", { name: /\[e2e\] delta/ })).toContainText("넷째");

  // Bulk: a duplicate of the list and a repeat in the paste are unchecked; AI fills the empty meaning.
  await page.getByRole("link", { name: "일괄 추가" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/한 줄에 한 단어/).fill(["[e2e] epsilon - 다섯째", "[e2e] zeta", "[e2e] delta - 중복", "[e2e] EPSILON - 또"].join("\n"));
  await page.getByRole("button", { name: "미리보기" }).click();
  await expect(page.getByText("4줄 · 선택 2 · 추가됨 0")).toBeVisible();
  await expect(page.getByRole("row", { name: /\[e2e\] delta/ })).toContainText("이미 있는 단어");
  await expect(page.getByRole("row", { name: /\[e2e\] EPSILON/ })).toContainText("위와 중복");
  await page.getByLabel("주제 (모든 단어에 적용, 쉼표로 구분)").fill("e2e");
  await page.getByRole("button", { name: "AI로 빈 칸 채우기" }).click();
  await expect(page.getByLabel("[e2e] zeta 뜻")).toHaveValue("[e2e] zeta의 뜻");
  await page.getByRole("button", { name: "2개 추가" }).click();
  await expect(page.getByText("2개를 Notion에 추가했어요.")).toBeVisible();

  const db = await dbAsUser();
  const { data } = await db.from("vocab_words").select("term, meaning, topics, cefr").like("term", "[e2e]%").order("term");
  expect(data).toEqual([
    { term: "[e2e] delta", meaning: "넷째", topics: [], cefr: "B1" },
    { term: "[e2e] epsilon", meaning: "다섯째", topics: ["e2e"], cefr: null },
    { term: "[e2e] zeta", meaning: "[e2e] zeta의 뜻", topics: ["e2e"], cefr: "B1" },
  ]);
  const { count } = await db.from("ai_calls").select("id", { count: "exact", head: true }).like("kind", "vocab.%");
  expect(count).toBeGreaterThanOrEqual(2);
});
