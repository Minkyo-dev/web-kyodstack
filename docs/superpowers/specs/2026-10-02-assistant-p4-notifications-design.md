# Assistant P4 — proactive notifications (web push)

- Date: 2026-10-02
- Status: accepted
- Umbrella: `2026-10-02-assistant-architecture.md`. Decisions: ADR 0043.

## 1. Goal
The assistant speaks first, but sparingly. A few rule-based notifications reach the owner's phone or desktop even
when the app is closed. Each one opens the screen where the owner can act on it.

## 2. Delivery
- **Web Push (VAPID)** through the browser's push service. The app is installable as a PWA (`app/manifest.ts`,
  `public/sw.js`). On iPhone, push only works once the app has been added to the home screen (iOS 16.4+).
- `web-push` (pinned 3.6.7) signs and sends from the server. The keys are
  `VAPID_PUBLIC_KEY` (public; the settings action hands it to the browser), `VAPID_PRIVATE_KEY` (server-only) and `VAPID_SUBJECT`.
- A subscription is per device. A 404/410 from the push service deletes it.

## 3. Rules `notify-v1` (pure, local time, deterministic)

| kind | when | text | opens | dedupe key |
|---|---|---|---|---|
| `block_soon` | A planned block of an open task starts within the next 15 minutes. | "10분 뒤: ‘X’" | `/scheduler` | `block:<block id>` |
| `habit_missed` | Local hour ≥ 8. A habit due today was due yesterday and not checked. One notification lists them all. | "어제 놓친 습관: A, B — 오늘 하면 두 번 연속은 아니에요" | `/scheduler` | `habit:<date>` |
| `checkin` | Local hour ≥ the evening hour, there is no check-in today, and the day had planned blocks or sessions. | "하루 마무리 시간이에요. 내일의 한 가지를 정해 둘까요?" | `/scheduler` | `checkin:<date>` |
| `change_quiet` | Monday or later in the week, local hour ≥ 9. An active 변화 has no focused session and no habit check on its rules in the last 14 days. | "‘X’가 2주째 조용해요. 가장 작은 다음 행동 하나만 정해 볼까요?" | `/scheduler/directive?mission=<id>` | `quiet:<mission>:<week start>` |

- **Preferences** (`notification_prefs`, one row per user, created on the first subscribe):
  - an on/off switch per kind (all on by default);
  - quiet hours, default 22–7 local (nothing is sent inside them, and nothing is queued);
  - a daily cap, default 4 per local day.
- **Order inside one run:** `block_soon` first, then `checkin`, then `habit_missed`, then `change_quiet`. The cap is
  applied after that ordering.

## 4. Schedule
- `/api/internal/jobs/notifications` (GET/POST, the same auth as the other jobs) evaluates every user who has at
  least one subscription.
- **Supabase Cron** (`pg_cron` + `pg_net`) calls it **every 5 minutes**. Vercel Hobby crons run only once a day.
  The cron reads the URL and the secret from Vault (`notify_job_url`, `notify_job_secret`). If either is missing,
  it does nothing.
- **Idempotency:** a `notification_log` row is inserted first, unique on `(user_id, dedupe_key)`. A push is sent
  only when that insert succeeds, so overlapping runs never send twice.

## 5. UI
- Scheduler settings (⚙) → **알림**. The dialog has:
  - this device's state (not supported, blocked, off or on), with [이 기기에서 켜기] and [끄기];
  - the switch for each kind;
  - the quiet hours and the daily cap;
  - [테스트 알림 보내기], which sends straight to this user's devices and skips the rules.
- The service worker shows the notification. Clicking it focuses an open window or opens the target URL.

## 6. Data
- `push_subscriptions(user_id, endpoint unique, p256dh, auth, user_agent, created_at, last_success_at)`: own
  select, insert and delete. The job uses the service role.
- `notification_prefs(user_id pk, block_soon, habit_missed, checkin, change_quiet bool, quiet_start,
  quiet_end smallint 0–23, daily_cap smallint 1–10)`: own select, insert and update.
- `notification_log(user_id, kind, dedupe_key, local_date, title, sent_at)`, unique `(user_id, dedupe_key)`: own
  select (a history view later) and delete (E2E). Only the service role inserts.

## 7. Testing
- **Unit:** each rule's window, dedupe keys, quiet hours across midnight, the cap and ordering, and the kind
  switches.
- **SQL:** own-only access; the log can't be inserted by users.
- **E2E `notifications.spec.ts`:** open the settings dialog; save the preferences (they persist); the device row
  reports that push is unsupported or not yet enabled in headless Chromium. Delivery itself is checked live with
  [테스트 알림 보내기] and the job endpoint.
