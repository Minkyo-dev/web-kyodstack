# Stat engine + progress page (sub-project D2) — design

- Date: 2026-09-30
- Sources:
  - `docs/improve-requirements-2.md` §21–§34, §47, §62
  - Umbrella `2026-09-30-growth-system-architecture.md` §8
  - D1 spec (classification) and the B spec (missed blocks, commitment)
- Part of D (D1 done; D3 = Today view, week summary, capacity notice).

## Goal
Measure behavior with four deterministic stats (Calibration, Reliability, Consistency, Recovery) plus
non-scored patterns, and show them on `/scheduler/progress` with trends. The stats are always computed from raw
data by pure TS. The LLM never computes them.

## Decisions made with the user
1. **Timing:** compute live when the page opens (always current), and store a daily snapshot at night for trends
   and for E.
2. **Engine:** pure TS `computeStats(input, now)` over raw rows loaded by `loadStatInput`, not SQL views/functions.

## 1. Data, settings, job

### Settings (`scheduler_settings`)
| column | type | default | check |
|---|---|---|---|
| `planned_work_days` | smallint[] | `{1,2,3,4,5}` (0 = Sunday) | every element 0–6; array non-empty |
| `min_meaningful_minutes` | int | 30 | 5–480 |
| `commit_lead_minutes` | int | 120 | 0–1440 |

### `stat_snapshots`
- Columns: `id, user_id, computed_on date, stat_type text, scope text, value numeric null, bias numeric null,
  typical_error numeric null, sample_count int, window_start date, window_end date, formula_version text,
  created_at`.
- `stat_type` ∈ `calibration | reliability | consistency | recovery`. `scope` = `overall` or a task type (per-type
  Calibration).
- `unique (user_id, computed_on, stat_type, scope)`. The nightly job upserts, so a second run on the same day
  changes nothing.
- RLS: select own rows only. insert/update/delete are revoked from `authenticated` (only the service-role job
  writes), and `anon` is revoked. This is the same model as `job_runs`.

### Nightly job
- The existing `duration_profile_refresh` job (already rebuilding `duration_groups` and marking missed blocks) also
  writes the day's snapshot through the same `computeStats`. No new cron entry is added (ADR 0014).
- Snapshot scope rows: the 4 overall stats, plus Calibration per task type that has ≥ 5 samples.

### `loadStatInput(supabase, userId, now)`
- Every query filters `user_id` explicitly (safe under the service role). Window = the last 42 local days + today.
- Reads:
  - **Blocks** overlapping the window: `id, task_id, starts_at, ends_at, status, created_at, updated_at`.
  - **Revisions** of those blocks: `change_type, previous_starts_at, previous_ends_at, new_starts_at, created_at`.
  - **Sessions** overlapping the window, with pauses: `id, task_id, schedule_block_id, started_at, ended_at, source`.
  - **Work-log focus scores** of those sessions.
  - **Tasks** completed in the last 28 days: `id, task_type, user_estimated_minutes, completed_at`. For Calibration
    also the task's first session start (earliest session, any date) and its blocks with `created_at`, including
    blocks outside the window.
  - **Tasks referenced** by blocks and sessions: `id, status, practice_domain_id, created_at`.
  - **Practice domains**, plus all-time focused minutes per domain (sessions joined to tasks, bounded to the user).
  - **Settings, timezone, first activity date** (the earliest `tasks.created_at`).

## 2. Formulas (`STATS_VERSION = "stats-v1"`)

General rules:
- Local days in `profiles.timezone`, DST-safe via the tz utils.
- Focused minutes = wall time − pauses, clipped per day with `focusedMinutesInWindow`.
- Below the minimum → `value = null` plus `{ have, need }`.

### Calibration (tasks completed in the last 28 days)
- **P** = Σ minutes of the task's non-cancelled blocks (including missed and skipped) created before its first
  session started. If there are none, the user estimate. If there is none, the task is not eligible.
- **A** = Σ focused minutes of all its sessions (manual included). A = 0 → not eligible.
- **Score:** `100·min(A/P, P/A)`, weight 1 (F later sets 0.3 for a confirmed external blocker).
- **Aggregate:** mean; the minimum is 8 samples.
- **Bias** = median(A/P − 1). **Typical error** = median(|A/P − 1|).
- **Per task type:** the same calculation; the minimum is 5.
- **Copy:**
  - bias > +5% → "보통 N% 더 걸려요"
  - bias < −5% → "보통 N% 덜 걸려요"
  - otherwise "±5% 이내"

### Reliability (the last 28 days, by the time each commitment resolves)
**Committed:** the instant the slot's `starts_at` was set is ≤ `starts_at − commit_lead_minutes`. That instant is
the block's creation, or its latest `moved` revision. `resized` never changes it.

Each block yields **several commitments**:
1. **Each `moved` revision whose previous slot was committed** resolves that slot:
   - 0.85 if `revision.created_at ≤ previous_starts_at − lead` (proactive reschedule)
   - otherwise 0.5 (late reschedule)
2. **The final slot, if committed**, resolves at its end (or at the skip/cancel time):
   - **Sessions:** the first matching session start (`schedule_block_id` = block, or the same task starting in
     [start − 30 min, end)):
     - ≤ start → 1.0
     - ≤ 15 min late → 0.9
     - ≤ 30 min late → 0.75
     - later but before the end → 0.5
   - **No session:**
     - status `completed` (the user marked it done) → 1.0
     - `skipped` / `cancelled` at time t (the cancel revision time, or `updated_at` for a skip) →
       0.85 if t ≤ start − lead, else 0
     - otherwise (missed) → 0
   - A final slot whose end is still in the future and has no resolution is not counted yet.

Resizes made within 5 minutes of a block's creation are never counted as rescheduling anywhere
(the B "keep my estimate").

**Aggregate:** 100 × mean; the minimum is 10 commitments.

### Consistency (the last 42 days)
- **Days:** planned work days from max(first activity date, window start) through yesterday. Today is excluded.
- **Success:** the day's focused minutes ≥ `min_meaningful_minutes`. Non-work days are ignored.
- **Aggregate:** 100 × successes / days; the minimum is 15 days.

### Recovery (the last 42 days)
- **Events:** final-slot commitments scored 0 (missed, or a late skip/cancel).
- **Resolution:** the first local day on or after the block's end day with ≥ `min_meaningful_minutes` focused on
  the same task (a same-day recovery after the block counts).
- **Score:** by the planned work days between the event day and the recovery day:
  - same day or next planned day → 100
  - 2 → 75
  - 3 → 50
  - later, within 14 calendar days → 25
  - none within 14 days, or the task was cancelled → 0
- Unresolved events younger than 14 days are excluded.
- **Aggregate:** mean; the minimum is 5 events.

### Patterns (not scored; the last 28 days)
- Median focused minutes of finished sessions.
- Pause ratio = Σ paused / Σ elapsed.
- Mean self-rated focus from work logs.
- **Daily capacity:** the median focused minutes over planned work days with ≥ min meaningful minutes. D3's
  capacity notice uses it.
- **Reliable window:** the 3-hour local window with the highest mean Reliability score (≥ 3 commitments).
- **High-reschedule window:** the 3-hour local window of `previous_starts_at` with the most `moved` revisions
  (≥ 3).
- **Practice domains:** focused minutes per domain for the last 28 days and all time. Parents include their
  children's minutes.

### Output
```ts
type StatValue = { value: number | null; sampleCount: number; need: number };
type Stats = {
  version: "stats-v1";
  calibration: StatValue & { bias: number | null; typicalError: number | null; byType: Record<TaskType, StatValue & { bias: number | null }> };
  reliability: StatValue;
  consistency: StatValue & { successDays: number; workDays: number };
  recovery: StatValue;
  patterns: {
    medianSessionMinutes: number | null; pauseRatio: number | null; averageFocus: number | null;
    dailyCapacityMinutes: number | null;
    reliableWindow: { start: string; end: string } | null;
    rescheduleWindow: { start: string; end: string } | null;
  };
  domains: { id: string; name: string; parentId: string | null; recentMinutes: number; totalMinutes: number }[];
};
```
Values are rounded to integers for scores, and to 0.01 for bias/error.

## 3. UI

### `/scheduler/progress` (new sidebar item "진행")
- **Stat cards (4; 2×2 on mobile):**
  - The name plus a one-line meaning:
    - 예상 정확도 · 계획 이행 · 꾸준함 · 회복력
  - The value, or "데이터 수집 중 · have/need".
  - Secondary text:
    - Calibration: bias copy + "오차 ±N%"
    - Reliability: "약속 블록 N개"
    - Consistency: "근무일 x/y일"
    - Recovery: "회복 사건 N건"
  - The trend: an inline SVG line over the last 8 weeks of snapshots.
    - A text alternative, e.g. "4주 전 72 → 지금 78".
    - The line breaks where `formula_version` changes.
- **Per-type Calibration table:** type, score, bias, samples (types with ≥ 5 samples).
- **"나의 패턴":** a definition list. Missing values show "—" with a short reason.
- **"연습 영역":** a bar list with minutes as text, for the top 8 by the recent period. It shows recent and total.
- **Link:** "작업 기준" opens the settings dialog.

### "작업 기준" dialog
- Opens from the ⚙ menu on the scheduler and from the progress page.
- **Fields:**
  - Work days: 7 checkboxes, at least one required.
  - Minimum meaningful minutes.
  - Commitment lead minutes.
- Each field has a one-line explanation.
- Saving revalidates `/scheduler`, so the progress stats recompute on the next render.

### Copy
Facts, never judgments: "계획보다 보통 14% 더 걸려요", "회복까지 보통 1일". No red/green alone; the text carries the
meaning.

## 4. Code
- **Migration `stat_engine`:** the 3 settings columns with checks, `stat_snapshots` + RLS/grants.
- **New feature folder `src/features/analytics/`:**
  - `domain/stats.types.ts` (`Stats`, `STATS_VERSION`, labels)
  - `utils/stats.ts`: pure `computeStats` and helpers `commitments(...)`, `calibrationSamples(...)`,
    `workDays(...)`, `recoveryEvents(...)`, `patterns(...)`, `domainMinutes(...)`
  - `queries/stat-input.queries.ts`: `loadStatInput`
  - `queries/snapshots.queries.ts`: `listSnapshots(supabase, userId, sinceDate)`
  - `services/snapshot.service.ts`: `writeDailySnapshot(ctx, now)` (job only)
  - `components/`: stat card, sparkline, pattern list, domain bars, work-standard dialog
- **Settings action:** `updateWorkStandardsAction({ plannedWorkDays, minMeaningfulMinutes, commitLeadMinutes })`
  in the scheduler actions.
- **Page:** `src/app/(private)/scheduler/progress/page.tsx`; a nav item in the private layout.
- **Job:** `runDurationProfileRefresh` calls `writeDailySnapshot`.
- **Dependency direction:** `analytics` reads scheduler/classification types and tz/focus utils. Nothing in the
  scheduler imports analytics, except the D3 capacity notice later.

## 5. Errors and edge cases
- A new account shows "데이터 수집 중" everywhere. The page never divides by zero.
- A work-days array that would become empty is rejected (`VALIDATION_ERROR`, "근무 요일을 하나 이상 골라 주세요.").
- DST weeks: day boundaries come from the tz utils; the tests cover 2026-11-01.
- Sessions crossing midnight are split per day with their pauses.
- Deleted tasks disappear from all stats (their sessions cascade). This is accepted, because the history view isn't
  an audit log.

## 6. Tests
- **Unit** `tests/unit/stats.test.ts`:
  - Calibration table: 60/66 → 91, 60/75 → 80, 60/90 → 67, 60/120 → 50.
  - Bias and typical error.
  - Per-type minimum.
  - Reliability tiers:
    - on time, 15, 30, late within block
    - no session + completed
    - early/late skip
    - proactive/late move
    - non-committed ignored
    - resize doesn't reset commitment
  - Consistency: A (12 h Monday only) < B (2 h Mon–Fri); today excluded; first activity bound.
  - Recovery: next day 100, 2 days 75, Friday case, abandoned 0, unresolved-young excluded.
  - Patterns: capacity median, windows.
  - A DST-week consistency case.
  - A golden fixture for `stats-v1`.
- **SQL** `supabase/tests/rls/stat_engine.sql`:
  - Settings checks (bad day, empty array, out-of-range minutes).
  - `stat_snapshots`: A reads own; A can't insert/update; B sees nothing; anon denied.
- **E2E** `tests/e2e/progress.spec.ts`:
  - The page shows the 4 cards and the pattern section.
  - The work-standard dialog saves and persists (restoring the original afterwards).
  - A seeded domain with a finished session appears in "연습 영역".

## 7. Docs
`docs/schema.md` (settings, snapshots, stat definitions v1), ADR 0014 (live stats + nightly snapshots in the
existing job; committed/resolution rules), `docs/progress.md`.

## Out of scope
- XP, levels, practice levels, quests (E).
- AI explanations of stat changes (F).
- The capacity notice and the Today layout (D3).
