# 0010. Scheduled jobs: Vercel Cron → internal Route Handlers, with a job ledger
- Status: accepted
- Date: 2026-09-30

## Context
Spec §45 prefers Supabase Cron → Edge Function. The job logic (estimator, metrics, AI services) is already
TypeScript inside the Next.js app, and the Deno Edge Functions would have had to duplicate it.

## Decision
- Jobs are Route Handlers under `/api/internal/jobs/{daily-planner,weekly-review,duration-profile-refresh}`,
  scheduled by Vercel Cron (`vercel.ts`). They take GET (Vercel Cron) or POST (manual calls, or Supabase Cron + `pg_net`
  later, which reaches the same endpoint).
- Auth: `Authorization: Bearer <CRON_SECRET | INTERNAL_JOB_SECRET>`, compared in constant time. With no secret
  configured the endpoint returns 503 and never runs.
- They run with the service role (`lib/supabase/admin.ts`, server-only). Every query a job reaches is scoped by
  `user_id` explicitly, so the queries don't depend on RLS (spec §20).
- Timing (spec §46): the cron fires at a broad UTC time, and each job checks the user's **local** time:
  planner 05:00–10:00 local (key = local date); weekly review on the first local day of the user's week (key =
  previous week start; skipped if a review already exists or the week is empty); profile rebuild daily.
- Idempotency (spec §47): `job_runs` unique `(job_name, user_id, run_key)`. Succeeded or skipped runs never rerun,
  a fresh running row blocks concurrent calls, and failed or stale (> 30 min) runs retry up to 3 attempts.
  The rows double as the job log (spec §48). Users may read their own rows; only the service role writes.

## Consequences
Deployment needs `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` in the Vercel env. Vercel Hobby allows one run
per cron per day, which these schedules fit.
