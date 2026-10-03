# 0043 — Assistant P4: rule-based web push notifications

- Status: accepted
- Date: 2026-10-02
- Spec: docs/superpowers/specs/2026-10-02-assistant-p4-notifications-design.md

## Context
P4 lets the assistant speak first when the app is closed. Two constraints shape it. The deployment runs on Vercel
Hobby, where crons run once a day, but "10 minutes before a block" needs checks every few minutes. Notifications
must also stay sparse and respectful (umbrella principle 3).

## Decisions
1. **Web Push with VAPID** (`web-push` 3.6.7, pinned) and a minimal PWA: a manifest and a service worker that only
   handles `push` and `notificationclick`, with no offline caching. There is no third-party push vendor.
2. **Rules `notify-v1` are deterministic** and computed in local time: `block_soon` (≤ 15 min),
   `habit_missed` (≥ 08:00), `checkin` (≥ evening hour, only on days with activity) and `change_quiet` (14 quiet
   days, at most once a week). No LLM is involved.
3. **Respect:** a switch per kind, quiet hours (default 22–7, dropped rather than queued) and a daily cap (default
   4). When more than the cap are due in one run, the order is block → check-in → habit → quiet change.
4. **Supabase Cron every 5 minutes** calls `/api/internal/jobs/notifications` through `pg_net`. The URL and the
   bearer secret come from Vault (`notify_job_url`, `notify_job_secret`), so no secret is in a migration. Without
   both secrets the cron does nothing. This is the "Supabase Cron + pg_net" path foreseen in ADR 0010.
5. **Idempotency through the log.** The job inserts into `notification_log` (unique `(user_id, dedupe_key)`)
   **before** sending. If the push then fails, the notification is lost rather than duplicated, which is the
   respectful failure mode.
6. **The job uses the service role** with an explicit `user_id` on every query (as in ADR 0010). Users can never
   insert log rows. A push service answering 404/410 deletes that subscription.
7. **`VAPID_SUBJECT`** defaults to the repository URL, a public contact that is not personal data. It can be
   changed in the env.

## Consequences
- Production push needs Vercel env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) and
  two Vault secrets in Supabase: the deployed job URL and `INTERNAL_JOB_SECRET`.
- To turn on the 5-minute tick, run this once in the Supabase SQL editor. It is not in a migration because it holds
  a secret:
  ```sql
  select vault.create_secret('https://<deployed-domain>/api/internal/jobs/notifications', 'notify_job_url');
  select vault.create_secret('<INTERNAL_JOB_SECRET value>', 'notify_job_secret');
  ```
- The job URL must be the host that answers without a redirect, because `pg_net` does not follow 30x. See the
  host check and the run queries in `docs/operations.md` §2.
- `pg_net` lives in the `extensions` schema (migration `pg_net_extensions_schema`, advisor 0014).
- iPhone users must add the app to the home screen before they can enable push.
- A 5-minute tick means `block_soon` arrives 10–15 minutes ahead, not exactly 10.
