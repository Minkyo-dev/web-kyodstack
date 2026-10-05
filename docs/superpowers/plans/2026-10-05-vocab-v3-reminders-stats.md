# 단어장 V3 — reminders (due buckets, push) and stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:**
- **Home:** due buckets `오늘 · 1일 내 · 3일 내 · 7일 내` and a 7-day forecast.
- **Push:** a daily `vocab_due` web push at the user's reminder time. It reuses ADR 0043's quiet hours, daily cap,
  log and per-kind switch.
- **`/english/stats`:** a 12-week review heatmap, current/best streak, 30-day recall rate, counts by status and by
  topic, and today's progress against the limits.

**Architecture:**
- **SQL aggregates.** Stats come from a security-invoker SQL function, `vocab_review_days(p_user_id, p_timezone,
  p_since)`, which returns per-local-day counts. The row limits make large review logs impossible to aggregate
  client-side.
- **Pure TS.** Buckets, forecast, streak and heatmap layout are pure functions over those rows.
- **`notify-v2`.** The rules gain `vocab_due`. The facts come from `features/vocab/services/reminder.service`, and
  the assistant notify loader calls it only when the rule could fire: the switch is on, it is past the reminder
  time, and the reminder hasn't been sent today.

**Spec:** §8.

## Global Constraints
- Every day boundary uses `profiles.timezone`. Stats are deterministic: SQL plus pure TS, no LLM.
- The push respects quiet hours, the daily cap (priority: block_soon → checkin → vocab_due → habit_missed →
  change_quiet), the `vocab_due` switch in 알림 settings, and `vocab_settings.reminder_enabled` / `reminder_time`.
- Charts follow the dataviz skill: accessible, with labels and not color alone.

## Review Focus
1. **The reminder time is 20:30 and it is 20:29 local.** Expected: nothing; at 20:30 it is sent once (deduped per
   local day). Test: notify rule.
2. **The queue is empty** (the user already reviewed everything today). Expected: no push. Test: notify rule with
   0/0.
3. **A streak where today has no reviews yet** but yesterday did. Expected: it continues from yesterday. A gap of
   one day ends it. Test: `streak`.
4. **A DST week** (Toronto, Nov 1 2026). Expected: the heatmap days stay calendar days, and the bucket dates step
   by local date. Test: `dueBuckets` and the heatmap with a DST date.
5. **A user with no Notion connection but a push device.** Expected: the vocab facts are null and nothing breaks.
   Test: the reminder service returns null without words or settings.

---

### Task 1: DB
- `notification_prefs.vocab_due boolean not null default true`.
- The `notification_log.kind` check includes `vocab_due`.
- **`vocab_review_days(p_user_id uuid, p_timezone text, p_since timestamptz) returns table(local_date date,
  reviews int, again int, studied int, studied_ok int)`** (security invoker, stable).
  - `studied` counts reviews whose `before.fsrs_state` was `review`; `studied_ok` counts those rated > 1.
- SQL test `vocab_stats.sql`.

### Task 2: Pure domain
- `assistant/domain/notify.ts` → `notify-v2`:
  - the `vocab_due` kind, pref and input `vocabDue: { reviews; newCards } | null`;
  - `localTime` (HH:MM) in the input;
  - `vocabReminderTime` (HH:MM, or null when the user turned it off).
- `vocab/domain/stats.ts`:
  - `dueBuckets(dueDates: string[], today) → { today, d1, d3, d7 }` (cumulative, local dates, overdue counts as
    today);
  - `forecast(dueDates, today, days = 7) → { date, count }[]`;
  - `streak(days: { date; reviews }[], today) → { current, best }`;
  - `heatmapWeeks(days, today, weeks = 12) → cells`;
  - `recallRate(days) → number | null`.

### Task 3: Services
- **`vocab/services/reminder.service.ts`:**
  - `vocabReminderFacts(db, userId, now) → { reviews, newCards, reminderTime } | null`. It is null without a ready
    connection or with the reminder off, and uses `loadReviewSession` for the capped counts.
- **`vocab/services/stats.service.ts`:**
  - `loadStats(ctx) → { days, buckets, forecast, streak, recallRate, byStatus, byTopic, today: { reviews, newCards,
    caps } }`.
- **Assistant `loadNotifyInput`** reads `vocab_due` and the vocab facts lazily (only when the time has come and
  `vocab:<date>` isn't logged). The prefs schema, subscription service and dialog gain `vocab_due`.
- **`vocab_settings`:** a reminder update action (`reminderEnabled`, `reminderTime`).

### Task 4: UI
- Home: `DueBuckets` and the forecast bar under the today card.
- `/english/stats` page and the 통계 tab.
- The 알림 dialog gets "단어 복습".
- Settings → 학습 gets the reminder on/off and time, with a pointer to the planner's 알림 settings for device
  registration.

### Task 5: E2E and docs
- `vocab-stats.spec.ts`: connect → add a word → review it (Easy) → `/english/stats` shows 1 review today, streak 1,
  and the word under 학습 중; home buckets show the forecast.
- Docs: architecture, progress, ADR 0046 V3 notes, ADR 0043 note (`notify-v2`), operations (the `vocab_due` kind).
