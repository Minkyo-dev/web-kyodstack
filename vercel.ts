import type { VercelConfig } from "@vercel/config/v1/types";

/**
 * Background jobs (spec §45, §46, ADR 0010). Cron runs in UTC at broad times; each job
 * checks every user's local time itself, so DST never needs a hard-coded offset.
 * Vercel sends "Authorization: Bearer $CRON_SECRET"; set CRON_SECRET in the project env.
 */
export const config: VercelConfig = {
  framework: "nextjs",
  // Only main deploys automatically; previews and the feature branch don't.
  git: {
    deploymentEnabled: {
      main: true,
      preview: false,
      development: false,
      "feat/work-scheduler": false,
    },
  },
  crons: [
    // 10:00 UTC = 06:00 EDT / 05:00 EST → inside the 05:00–10:00 local planner window
    { path: "/api/internal/jobs/daily-planner", schedule: "0 10 * * *" },
    // Daily; the job only acts on the first local day of each user's week
    { path: "/api/internal/jobs/weekly-review", schedule: "0 12 * * *" },
    // Nightly derived-data rebuild
    { path: "/api/internal/jobs/duration-profile-refresh", schedule: "0 8 * * *" },
  ],
};
