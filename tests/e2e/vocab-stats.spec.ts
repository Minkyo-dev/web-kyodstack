import { expect, test } from "@playwright/test";
import { dbAsUser, login } from "./helpers";

/** ADR 0046 V3 against the fake Notion: due buckets/forecast on home, stats after a review, reminder settings. */
test.skip(!!process.env.E2E_BASE_URL && process.env.NOTION_GATEWAY !== "fake", "needs a dev server started with NOTION_GATEWAY=fake");

async function clearVocab() {
  const db = await dbAsUser();
  for (const table of ["vocab_words", "vocab_settings", "notion_connections"] as const) {
    const { error } = await db.from(table).delete().not("user_id", "is", null);
    if (error) throw error;
  }
}

test.beforeEach(clearVocab);
test.afterAll(clearVocab);

test("a review shows up in the buckets, the forecast and the stats", async ({ page }) => {
  await login(page);
  await page.goto("/english");
  await page.getByRole("link", { name: "Notion 연결" }).click();
  await page.getByLabel("[e2e] 공유 페이지").check();
  await page.getByRole("button", { name: "단어장 만들기" }).click();
  await expect(page.getByText("속성 정상")).toBeVisible();

  await page.goto("/english/words", { waitUntil: "networkidle" });
  await page.getByLabel("새 단어").fill("[e2e] gamma");
  await page.getByLabel("새 단어").press("Enter");
  await page.getByRole("dialog").getByLabel("뜻").fill("셋째");
  await page.getByRole("dialog").getByRole("button", { name: "Notion에 저장" }).click();
  await expect(page.getByRole("row", { name: /\[e2e\] gamma/ })).toBeVisible();

  // Good on a new card: a 10-minute learning step, so it is due again today.
  await page.goto("/english/review", { waitUntil: "networkidle" });
  await page.keyboard.press("Space");
  await page.keyboard.press("3");
  await expect(page.locator("article")).toContainText("[e2e] gamma"); // back in this session
  await page.keyboard.press("Escape");
  await expect(page.getByText("오늘 복습을 마쳤어요")).toBeVisible();

  await page.goto("/english", { waitUntil: "networkidle" });
  await expect(page.getByText("오늘 1 · 1일 내 1 · 3일 내 1 · 7일 내 1")).toBeVisible();

  await page.goto("/english/stats", { waitUntil: "networkidle" });
  const tile = (label: string) => page.locator("div", { has: page.getByText(label, { exact: true }) }).last();
  await expect(tile("오늘 복습")).toContainText("1장");
  await expect(tile("연속 학습")).toContainText("1일");
  await expect(page.locator("dl").first()).toContainText("새 카드1");
  await expect(page.locator("dl").first()).toContainText("학습 중1");

  // Reminder settings persist.
  await page.goto("/english/settings", { waitUntil: "networkidle" });
  await page.getByLabel("알림 시각").fill("07:30");
  await page.getByRole("button", { name: "저장" }).last().click();
  await expect(page.getByText("알림 설정을 저장했어요.")).toBeVisible();
  const db = await dbAsUser();
  const { data } = await db.from("vocab_settings").select("reminder_time, reminder_enabled").single();
  expect(data).toEqual({ reminder_time: "07:30:00", reminder_enabled: true });
});
