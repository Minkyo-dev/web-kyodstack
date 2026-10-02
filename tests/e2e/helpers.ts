import { expect, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const E2E_PREFIX = "[e2e]";

export function credentials() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("Set E2E_EMAIL and E2E_PASSWORD (never commit them).");
  // ADR 0031: E2E runs as a dedicated `.test` user so it never touches the owner's real data.
  if (!email.endsWith(".test") && process.env.E2E_ALLOW_REAL_ACCOUNT !== "1") {
    throw new Error(`E2E_EMAIL (${email}) is not a dedicated .test account; set E2E_ALLOW_REAL_ACCOUNT=1 to override.`);
  }
  return { email, password };
}

/**
 * The browser session comes from global-setup (one sign-in per run, saved as storageState). This only signs in through
 * the form when that session is missing or no longer accepted.
 */
export async function login(page: Page) {
  // Wait for the page to settle: tests click right after login, and an early click can race hydration.
  await page.goto("/scheduler", { waitUntil: "networkidle" });
  if (!/\/login/.test(page.url())) return;
  const { email, password } = credentials();
  await signInThroughForm(page, email, password);
}

export async function signInThroughForm(page: Page, email: string, password: string) {
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

/** Fails fast with a clear message when Supabase Auth stops answering, instead of a 90 s hook timeout. */
const SIGN_IN_TIMEOUT_MS = 30_000;
let userClient: Promise<SupabaseClient> | null = null;

/**
 * Direct DB access as the same user (RLS applies) for assertions and cleanup. One signed-in client per worker:
 * signing in for every call made a run do ~100 password sign-ins, which Supabase Auth throttled (ADR 0031).
 */
export function dbAsUser(): Promise<SupabaseClient> {
  userClient ??= (async () => {
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Supabase sign-in did not respond within ${SIGN_IN_TIMEOUT_MS / 1000}s`)), SIGN_IN_TIMEOUT_MS),
    );
    const { error } = await Promise.race([client.auth.signInWithPassword(credentials()), timeout]);
    if (error) throw error;
    return client;
  })().catch((error) => {
    userClient = null;
    throw error;
  });
  return userClient;
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
  // Habits (G2) before protocols; their checks cascade, but the checks' XP rows must go first.
  const { data: e2eHabits } = await db.from("habits").select("id").like("title", `${E2E_PREFIX}%`);
  const habitIds = (e2eHabits ?? []).map((h) => h.id);
  if (habitIds.length > 0) {
    const { data: checks } = await db.from("habit_checks").select("id").in("habit_id", habitIds);
    const checkIds = (checks ?? []).map((c) => c.id);
    if (checkIds.length > 0) await db.from("xp_events").delete().eq("rule", "habit").in("source_id", checkIds);
    await db.from("habits").delete().in("id", habitIds);
  }
  // Coaching proposals (ADR 0040) about [e2e] rules/habits/changes carry the name in their title.
  await db.from("assistant_proposals").delete().like("title", `%${E2E_PREFIX}%`);
  // Direction layer (G1). Tasks and projects are gone already, so children can go first.
  const { data: e2eMissions } = await db.from("missions").select("id").like("title", `${E2E_PREFIX}%`);
  const missionIds = (e2eMissions ?? []).map((m) => m.id);
  if (missionIds.length > 0) {
    await db.from("protocols").delete().in("mission_id", missionIds);
    await db.from("paths").delete().in("mission_id", missionIds);
    await db.from("missions").delete().in("id", missionIds); // cascades criteria and identity links
  }
  await db.from("identities").delete().like("name", `${E2E_PREFIX}%`);
  const { data: e2ePurposes } = await db.from("purposes").select("id").like("statement", `${E2E_PREFIX}%`);
  if (e2ePurposes?.length) {
    await db.from("purposes").delete().in("id", e2ePurposes.map((p) => p.id));
    // Setting an [e2e] directive archived the owner's real one: bring the newest archived one back.
    const { data: active } = await db.from("purposes").select("id").eq("status", "active").maybeSingle();
    if (!active) {
      const { data: last } = await db
        .from("purposes")
        .select("id")
        .eq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last) await db.from("purposes").update({ status: "active" }).eq("id", last.id);
    }
  }
  // Classification rows: tags/domains made by E2E ("[e2e] …" template tags, "e2e-…" inline tags, "E2E…" domains).
  await db.from("tags").delete().like("name", `${E2E_PREFIX}%`);
  await db.from("tags").delete().like("name", "e2e-%");
  await db.from("practice_domains").delete().like("name", "E2E%");
  await cleanupFinance(db);
}

/** Finance rows made by E2E: "[e2e]"-named transactions, then unused accounts/categories, then an E2E household. */
export async function cleanupFinance(db: SupabaseClient) {
  // Subscription charges carry the plan name as merchant, so the transaction delete below removes them too.
  await db.from("finance_subscriptions").delete().like("name", `${E2E_PREFIX}%`);
  await db.from("finance_transactions").delete().like("merchant_name", `${E2E_PREFIX}%`);
  // Reconcile adjustments (ADR 0032) are named "잔액 맞추기"; remove the ones on E2E accounts.
  const { data: e2eAccounts } = await db.from("finance_accounts").select("id").like("name", `${E2E_PREFIX}%`);
  const accountIds = (e2eAccounts ?? []).map((a) => a.id);
  if (accountIds.length) await db.from("finance_transactions").delete().eq("type", "ADJUSTMENT").in("account_id", accountIds);
  await db.from("finance_categories").delete().like("name", `${E2E_PREFIX}%`).not("parent_id", "is", null);
  await db.from("finance_categories").delete().like("name", `${E2E_PREFIX}%`);
  await db.from("finance_accounts").delete().like("name", `${E2E_PREFIX}%`);
  // Deleting the household cascades to everything in it; only an E2E-made one (the owner's real one is never named so).
  await db.from("finance_households").delete().like("name", `${E2E_PREFIX}%`);
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
