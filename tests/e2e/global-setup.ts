import { chromium, type FullConfig } from "@playwright/test";
import { credentials, signInThroughForm } from "./helpers";

export const STORAGE_STATE = "tests/e2e/.auth/state.json";

/**
 * Signs in once per run through the real login form and saves the browser session; every test starts from it
 * (ADR 0031). The access token outlives a full run (~10 min), so no test needs to refresh it.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL;
  const { email, password } = credentials();
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await signInThroughForm(page, email, password);
  await page.context().storageState({ path: STORAGE_STATE });
  await browser.close();
}
