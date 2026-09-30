import { expect, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const E2E_PREFIX = "[e2e]";

export function credentials() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("Set E2E_EMAIL and E2E_PASSWORD (never commit them).");
  return { email, password };
}

export async function login(page: Page) {
  const { email, password } = credentials();
  await page.goto("/login?next=/scheduler");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/scheduler/);
  // The URL can change before the session cookie lands; later full page loads need it.
  await expect
    .poll(async () => (await page.context().cookies()).some((c) => c.name.includes("-auth-token")))
    .toBe(true);
}

/** Direct DB access as the same user (RLS applies) for assertions and cleanup. */
export async function dbAsUser(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword(credentials());
  if (error) throw error;
  return client;
}

export async function cleanup(db: SupabaseClient) {
  // XP earned from E2E sources (tasks, their sessions and blocks) and synthetic "e2e" events.
  const { data: e2eTasks } = await db.from("tasks").select("id").like("title", `${E2E_PREFIX}%`);
  const taskIds = (e2eTasks ?? []).map((t) => t.id);
  if (taskIds.length) {
    const [s, b] = await Promise.all([
      db.from("work_sessions").select("id").in("task_id", taskIds),
      db.from("schedule_blocks").select("id").in("task_id", taskIds),
    ]);
    const sources = [...taskIds, ...(s.data ?? []).map((x) => x.id), ...(b.data ?? []).map((x) => x.id)];
    for (let i = 0; i < sources.length; i += 100) await db.from("xp_events").delete().in("source_id", sources.slice(i, i + 100));
  }
  await db.from("xp_events").delete().eq("source_type", "e2e");
  await db.from("tasks").delete().like("title", `${E2E_PREFIX}%`);
  // Templates cascade into template_tags.
  await db.from("task_templates").delete().like("name", `${E2E_PREFIX}%`);
  // Projects cascade into milestones (their tasks were deleted above).
  await db.from("projects").delete().like("name", `${E2E_PREFIX}%`);
  // Classification rows: tags/domains made by E2E ("[e2e] …" template tags, "e2e-…" inline tags, "E2E…" domains).
  await db.from("tags").delete().like("name", `${E2E_PREFIX}%`);
  await db.from("tags").delete().like("name", "e2e-%");
  await db.from("practice_domains").delete().like("name", "E2E%");
}

/** Center of the time-grid cell for a local date + time (HH:mm). */
export async function slotPoint(page: Page, date: string, time: string) {
  const col = page.locator(`td.fc-timegrid-col[data-date="${date}"]`);
  const row = page.locator(`td.fc-timegrid-slot-lane[data-time="${time}:00"]`);
  await row.scrollIntoViewIfNeeded();
  const c = await col.boundingBox();
  const r = await row.boundingBox();
  if (!c || !r) throw new Error(`slot ${date} ${time} not visible`);
  return { x: c.x + c.width / 2, y: r.y + 2 };
}

export async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 5, from.y + 5, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
}

/** Pick a local date (yyyy-MM-dd) in a DatePicker: open it, page months until the day shows, click it. */
export async function pickDate(page: Page, trigger: Locator, date: string) {
  await trigger.click();
  const popup = page.locator('[data-slot="popover-content"]');
  const cell = popup.locator(`[data-date="${date}"]`);
  for (let i = 0; i < 24 && !(await cell.isVisible()); i++) {
    const first = await popup.locator("[data-date]").first().getAttribute("data-date");
    await popup.getByRole("button", { name: date > first! ? "다음 달" : "이전 달" }).click();
  }
  await cell.click();
  await expect(popup).toHaveCount(0);
}

/**
 * Tomorrow's calendar column (local date). Blocks placed there are always in the future, so they never turn
 * "missed" regardless of the time the suite runs. Navigates to tomorrow's week when it isn't shown.
 */
export async function tomorrowColumn(page: Page): Promise<string> {
  const today = await page.locator("td.fc-timegrid-col.fc-day-today").getAttribute("data-date");
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const tomorrow = d.toISOString().slice(0, 10);
  const col = page.locator(`td.fc-timegrid-col[data-date="${tomorrow}"]`);
  if ((await col.count()) === 0) await page.goto(`/scheduler?week=${tomorrow}`);
  await col.waitFor();
  return tomorrow;
}
