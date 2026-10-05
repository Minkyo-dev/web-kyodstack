import { expect, test, type Page } from "@playwright/test";
import { dbAsUser, login } from "./helpers";

/** ADR 0046 V1 against the fake Notion: write-through add/edit/delete and pull via [지금 동기화]. */
test.skip(!!process.env.E2E_BASE_URL && process.env.NOTION_GATEWAY !== "fake", "needs a dev server started with NOTION_GATEWAY=fake");

async function clearVocab() {
  const db = await dbAsUser();
  for (const table of ["vocab_words", "notion_connections"] as const) {
    const { error } = await db.from(table).delete().not("user_id", "is", null);
    if (error) throw error;
  }
}

async function connectWithDatabase(page: Page) {
  await page.goto("/english");
  await page.getByRole("link", { name: "Notion 연결" }).click();
  await page.getByLabel("[e2e] 공유 페이지").check();
  await page.getByRole("button", { name: "단어장 만들기" }).click();
  await expect(page.getByText("속성 정상")).toBeVisible();
}

test.beforeEach(clearVocab);
test.afterAll(clearVocab);

test("add, edit, re-pull and delete a word through Notion", async ({ page }) => {
  await login(page);
  await connectWithDatabase(page);
  // Wait for hydration: Enter in the quick-add form must reach React, not submit the form natively.
  await page.goto("/english/words", { waitUntil: "networkidle" });

  await page.getByLabel("새 단어").fill("[e2e] ubiquitous");
  await page.getByLabel("새 단어").press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("뜻").fill("어디에나 있는");
  await dialog.getByLabel("주제 (쉼표로 구분)").fill("e2e, IT");
  await dialog.getByLabel("레벨").selectOption("C1");
  await dialog.getByRole("button", { name: "Notion에 저장" }).click();
  const row = page.getByRole("row", { name: /\[e2e\] ubiquitous/ });
  await expect(row).toContainText("어디에나 있는");
  await expect(row).toContainText("새 단어");

  const db = await dbAsUser();
  const { data: words } = await db.from("vocab_words").select("id, topics, cefr").eq("term", "[e2e] ubiquitous");
  expect(words).toHaveLength(1);
  expect(words?.[0]).toMatchObject({ topics: ["e2e", "IT"], cefr: "C1" });
  const { count } = await db.from("vocab_cards").select("id", { count: "exact", head: true }).eq("word_id", words![0].id);
  expect(count).toBe(2);

  // Duplicate terms are refused.
  await page.getByLabel("새 단어").fill("[E2E] Ubiquitous");
  await page.getByLabel("새 단어").press("Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Notion에 저장" }).click();
  await expect(page.getByText("이미 있는 단어예요.")).toBeVisible();
  await page.keyboard.press("Escape");

  // Edit in the drawer: only the changed field is sent; the table follows.
  await page.getByRole("button", { name: "[e2e] ubiquitous" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("뜻").fill("편재하는");
  await drawer.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장했어요.")).toBeVisible();
  await expect(row).toContainText("편재하는");

  // A mirror row lost behind the app's back comes back from Notion with [지금 동기화].
  await db.from("vocab_words").delete().eq("id", words![0].id);
  await page.reload();
  await expect(page.getByRole("row", { name: /\[e2e\] ubiquitous/ })).toHaveCount(0);
  await page.getByRole("button", { name: "지금 동기화" }).click();
  await expect(page.getByRole("row", { name: /\[e2e\] ubiquitous/ })).toContainText("편재하는");

  // Search and topic filter (a comma in the query must not break the filter).
  await page.goto("/english/words?q=" + encodeURIComponent("ubiq, x)"));
  await expect(page.getByText("조건에 맞는 단어가 없어요.")).toBeVisible();
  await page.goto("/english/words?q=ubiq&topic=e2e");
  await expect(page.getByRole("row", { name: /\[e2e\] ubiquitous/ })).toBeVisible();

  // Topic card on home.
  await page.goto("/english");
  await expect(page.getByRole("link", { name: /e2e\s*1개/ })).toBeVisible();

  // Delete moves the page to Notion's trash and removes the mirror row.
  await page.goto("/english/words", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "[e2e] ubiquitous" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제 확인" }).click();
  // The open drawer hides the table from the accessibility tree, so wait for the result before checking rows.
  await expect(page.getByText("삭제했어요.")).toBeVisible();
  await expect(page.getByRole("row", { name: /\[e2e\] ubiquitous/ })).toHaveCount(0);
  const { data: after } = await db.from("vocab_words").select("id").eq("term", "[e2e] ubiquitous");
  expect(after).toEqual([]);
});
