import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/** Point at an already-running dev server (Next allows one per project) or start our own. */
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  // One sign-in per run; tests reuse the saved session (ADR 0031).
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    timezoneId: "America/Toronto",
    locale: "ko-KR",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    storageState: "tests/e2e/.auth/state.json",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: external
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
        // ADR 0046: the vocab specs run against the fake Notion gateway.
        env: { NOTION_GATEWAY: "fake" },
      },
});
