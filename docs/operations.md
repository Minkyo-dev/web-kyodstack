# Operations runbook

The steps and gotchas that are not visible in the code: production setup, secrets, scheduled jobs and the local
dev/E2E workflow. Design decisions are in `docs/decisions/`; this file only says how to run things.

## 1. Environment variables
Set them in `.env.local` (git-ignored) for local work and in Vercel → Project → Settings → Environment Variables for
production. `.env.example` lists the names. All server-only values are validated in `src/lib/env.server.ts`.

| Variable | Needed for | Where to get it |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | everything | Supabase → Project Settings → API Keys (publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | jobs only (`/api/internal/jobs/*`, ADR 0010) | Supabase → Project Settings → API Keys → **secret** key (`sb_secret_…`). Server-only; never prefix it with `NEXT_PUBLIC_`. |
| `GEMINI_API_KEY` | AI features (ADR 0041) | Google AI Studio → API keys |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | optional | defaults `gemini-3.8-flash` / `gemini-3.5-flash-lite` (the fallback is tried once on 429/503) |
| `AI_PROVIDER` | optional | `gemini` (default), `anthropic` (+ `AI_API_KEY`, `AI_MODEL`), `fake` (tests; refused in production) |
| `INTERNAL_JOB_SECRET` | job endpoints, notifications cron | any random string ≥ 16 chars, e.g. `openssl rand -hex 32` |
| `CRON_SECRET` | Vercel Cron (`vercel.ts`) | random ≥ 16 chars; Vercel sends it as `Authorization: Bearer …` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | web push (ADR 0043) | `npx web-push generate-vapid-keys`. The public key reaches the browser through a Server Action, so it needs no `NEXT_PUBLIC_` prefix. |
| `VAPID_SUBJECT` | web push | a contact URL or `mailto:`; the repo URL is used (`https://github.com/Minkyo-dev/web-kyodstack`) |
| `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` | 단어장 (ADR 0046) | the Notion **public** integration (§7) |
| `NOTION_REDIRECT_URI` | optional | defaults to `<request origin>/api/notion/callback`; set it when the deployed host differs from the registered URI |
| `NOTION_TOKEN_KEY` | 단어장 | `openssl rand -base64 32`. Encrypts Notion tokens at rest. Rotating it makes every stored token unreadable: each user's connection flips to 다시 연결 on next use |
| `NOTION_GATEWAY` | dev/E2E only | `fake` serves a deterministic Notion (refused in production); unset = the real API |

- The Gemini free tier allows about 5 requests per minute. Bursts get 429. The fallback model and the SDK retries
  absorb most of it, and every AI part of a screen fails soft.
- After changing a variable in Vercel, redeploy. Running deployments keep the old values.

## 2. Push notification cron (ADR 0043)
Supabase Cron calls `private.notify_tick()` every 5 minutes. The function posts to the job URL with `pg_net`. It
does nothing until **both** Vault secrets exist. Set them once in the Supabase SQL editor; they are not in a
migration because they hold a secret:

```sql
select vault.create_secret('https://<host>/api/internal/jobs/notifications', 'notify_job_url');
select vault.create_secret('<INTERNAL_JOB_SECRET value>', 'notify_job_secret');
-- later changes:
select vault.update_secret((select id from vault.secrets where name = 'notify_job_url'), 'https://<host>/api/internal/jobs/notifications');
```

**Which host.** It must be the host that answers **without a redirect**. A 307/308 drops the POST, and `pg_net`
does not follow redirects.
- In Vercel → Project → Settings → Domains, use the domain that is not marked "Redirects to …":
  - If the apex domain redirects to `www.`, include `www.`.
  - If `www.` redirects to the apex domain, leave it out.
- `<project>.vercel.app` also works, as long as Vercel Deployment Protection doesn't cover production.
- Check it before saving:

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<host>/api/internal/jobs/notifications
  ```

  `401` (no secret sent) means the route is reached directly; that is the right host. `30x` means the wrong host.

**Checking that it runs** (SQL editor):
```sql
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
select status_code, content, created from net._http_response order by created desc limit 5;
```

**Production checklist for push:**
- The Vercel env has `VAPID_*`, `SUPABASE_SERVICE_ROLE_KEY` and `INTERNAL_JOB_SECRET`.
- Both Vault secrets are set.
- On a phone, enable push under scheduler ⚙ → 알림, then press [테스트 알림 보내기]. iPhone needs the app added to
  the home screen first.

## 3. Secret hygiene
- Never paste or select `.env.local` lines in an editor that shares context with an assistant or a chat. If a key
  was exposed, rotate it:
  - The Supabase secret key: Project Settings → API Keys, create a new secret key and delete the old one.
  - The Gemini key: Google AI Studio.
  - Then update `.env.local` and Vercel, and redeploy.
- The Supabase service-role key and AI keys stay server-only (AGENTS.md core invariants).

## 4. Brand assets (ADR 0045)
- The master is `public/web-kyodstack-logo.png`. After it changes, run `node scripts/brand-assets.mjs`, which
  regenerates the favicon, `src/app/icon.png`, `public/icons/*` and `public/brand/*`. Commit the results.
- The meaning of the logo and the color rules are in `docs/brand.md`.

## 5. Local development and E2E
- **One `next dev` per project directory.** A second one exits with "Another next dev server is already running".
  When a dev server is already up, point E2E at it instead of letting Playwright start one:

  ```bash
  set -a; . ./.env.local; set +a; E2E_BASE_URL=http://localhost:3001 npm run test:e2e
  ```

  E2E runs as `e2e@kyodstack.test` (ADR 0031). Its credentials are in `.env.local`.
- **Don't run `npm run build` in the same directory while `next dev` is running.** The dev server then serves
  stale output. Build in a copy instead (hard-linked `node_modules`, so it is fast):

  ```bash
  B=/tmp/kyod-build; mkdir -p $B
  rsync -a --delete --exclude node_modules --exclude .next --exclude .git --exclude test-results ./ $B/
  [ -d $B/node_modules ] || cp -al node_modules $B/node_modules
  (cd $B && npm run build)
  ```
- **Stale Turbopack cache.** A dev server killed mid-compile can leave `.next/dev` in a bad state: pages compile
  for minutes or return 404. Stop the server, `rm -rf .next/dev`, and start it again.
- **Time-of-day traps in E2E seeds.** The user's day is local (`America/Toronto`), so the UTC date is a day ahead
  in the evening.
  - "1 day ago at 16:00 UTC" can be *today* locally, and today is excluded from 4-week windows such as coaching and
    slots.
  - Seed history 2 or more days back, or build local dates with
    `Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" })`.
  - A seeded block that crosses local midnight renders as two FullCalendar segments, and a locator then hits a
    strict-mode violation. Keep seeded blocks inside one local day, as `sameLocalDay()` in
    `calendar-planning.spec.ts` does.
- **Flaky specs.** The full suite runs against the remote Supabase, and single specs sometimes time out. Re-run a
  failed spec on its own before treating it as a regression.
- **단어장 E2E uses the fake Notion.** Playwright's own server starts with `NOTION_GATEWAY=fake`. Against an external
  server (`E2E_BASE_URL`), `vocab-*.spec.ts` are skipped unless that server was started with
  `NOTION_GATEWAY=fake npx next dev -p <port>` and the run also sets `NOTION_GATEWAY=fake`.
- **Local-only edits.** The owner's `package.json` dev-port change (`next dev --port 3001`) is intentionally left
  uncommitted.

## 6. Database changes
Follow AGENTS.md "Database workflow":
1. Apply the migration through MCP `apply_migration`.
2. Rename the local file to the version the remote assigned (`list_migrations`).
3. Regenerate the types.
4. Run `supabase/tests/rls/*.sql` (each ends in `rollback`).
5. Check `get_advisors`.

Never edit an applied migration, not even a comment. Add a new one instead.

## 7. Notion integration (단어장, ADR 0046)
1. notion.so/profile/integrations → **New integration** → type **Public**.
2. Redirect URIs: `https://<prod-host>/api/notion/callback` and `http://localhost:3001/api/notion/callback`.
3. Fill in the website, privacy policy and terms URLs if Notion asks for them (the integration does not need to be
   listed in Notion's gallery).
4. Copy the OAuth client id and secret into Vercel env and `.env.local` (`NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`),
   and add a `NOTION_TOKEN_KEY` to Vercel (each environment may have its own key).
5. **Smoke test once per environment:**
   - `/english` → Notion 연결 → share one page.
   - Pick it → 단어장 만들기.
   - In Notion, check that "Kyod 단어장" has the 11 properties and that 상태 offers 새 단어 / 학습 중 / 학습 완료.
   - Record in ADR 0046 whether Notion returned a `refresh_token` (spec §15).
