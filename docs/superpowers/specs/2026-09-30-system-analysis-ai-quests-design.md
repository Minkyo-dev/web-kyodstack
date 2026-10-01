# System analysis and AI quest candidates (sub-project F2) — design

- Date: 2026-09-30
- Sources:
  - `docs/improve-requirements-2.md` §48–50, §52
  - Umbrella `docs/superpowers/specs/2026-09-30-growth-system-architecture.md` §4 (F), §9
  - F1 (`callAi`, 30/day budget, provenance, prompt sanitizing), D2 (stats, snapshots, patterns), E2 (daily quest pool,
    swap, evaluation)
- Last part of F.

## Goal
"Algorithm calculates, AI explains." Once a week, at a time the user picks, the SYSTEM explains how the deterministic
stats moved and gives a short qualitative profile, citing only numbers it was given. The daily quest can be picked by
the AI from the rule-built candidate pool, validated by rules, with the rule quest as fallback.

## Decisions made with the user
1. AI quest candidates are used **when the daily quest is generated**: the AI picks 3 objectives from the catalog-based
   pool; a rule validator checks them; any failure falls back to the rule quest.
2. The weekly analysis runs at a **weekday and hour the user chooses**.

## 1. System analysis

### Settings
- `scheduler_settings.insight_weekday smallint null` (0–6; null = automatic analysis off) and `insight_hour smallint`
  (0–23), both local time. Defaults: the user's `week_starts_on` and 8.
- Edited in a "SYSTEM 분석" row of the progress page (weekday select incl. "끄기", hour select).

### When it is generated
- **Slot:** `analysisSlot(now, tz, weekday, hour)` = the most recent local instant with that weekday and hour at or
  before `now` (null when off).
- **Due** when a slot exists and there is no `weekly_analysis` insight created at or after the slot.
- **Lazy:** the progress page checks "due" on load and generates (within the cap). The Vercel crons are daily only,
  so exact-hour delivery is not available; the first visit after the slot generates it.
- **Nightly catch-up:** the existing `duration_profile_refresh` job runs the same check.
- **[다시 분석]:** at most once per local day (any analysis created today blocks it), within the cap.
- Failures (AI, cap, validation) leave the previous analysis in place and are logged without content.

### Input (computed numbers only)
`analysisInput(statsNow, snapshots, patterns)`:
- For each of the four stats: value now, value ~7 days ago and ~28 days ago from `stat_snapshots` (nearest snapshot
  on or before the day; null when missing), sample count and minimum.
- Calibration bias and typical error (now and 28 days ago), per-type Calibration values, blocker count.
- Patterns: typical session, daily capacity, reliable and frequently rescheduled windows.
- No notes, no task titles.

### Output (Zod) and validation
- `explanations`: ≤ 4 × `{ stat: calibration|reliability|consistency|recovery, headline ≤ 60, detail ≤ 200,
  evidence: string[] ≤ 4, each ≤ 60 }`.
- `assessment`: `{ planningTendency, workStyle, currentRisk, strongPattern }`, each ≤ 80 chars, qualitative.
- **Evidence check (pure):** every number appearing in `headline`, `detail` or `evidence` (integers, decimals,
  percentages, ±) must equal a number in the input (percent values compared both as fraction and as percent); an
  explanation that cites an unknown number is dropped. Assessment sentences must contain no digits (digits → line
  dropped).
- If nothing survives, the analysis is not stored.

### Storage
`system_insights(id, user_id, kind 'weekly_analysis', period_start date, period_end date, input jsonb, content
jsonb, model, prompt_version, created_at)`. RLS: select/insert own. The newest is shown; history is kept.

### UI
A "SYSTEM ANALYSIS" card below the four stat cards (separate from the numeric cards, §49):
- Each explanation: headline, detail, evidence as small mono text.
- "SYSTEM ASSESSMENT": four labeled lines (계획 경향, 작업 방식, 현재 위험, 강한 패턴).
- Footer: `분석 {local date time} · 다음 분석 {weekday} {hh}:00` and [다시 분석] (disabled with "오늘 이미 분석했어요" when used).
- Before any analysis: "다음 분석: {weekday} {hh}:00" and [지금 분석].

## 2. AI quest candidates

### Pool
The E2 daily candidates (focus, planned tasks or any task, top domain or kept commitment, early session, kept
commitment) plus:
- **Top task:** `complete_planned_tasks` with the highest-priority planned task (priority 1 = most important, ADR 0015),
  target 1, label "가장 중요한 할 일 완료: {title}".
- **Weak domain:** `domain_minutes` ≥ 30 in the domain with the least focused minutes among domains with activity in
  the last 28 days (only when it differs from the top domain).
Each candidate gets a key `c1`…`cN` and a Korean label. No new metrics: E2 evaluation, swap and clearing apply as is.

### AI step
- Input: the pool (key, label, target), capacity, today's planned minutes and task count, top-priority task titles
  (sanitized, ≤ 5), the four stat values.
- Output (Zod): `{ picks: string[3], title ≤ 20, reason ≤ 80 }`.
- **Validator (pure):** exactly 3 distinct keys from the pool; no duplicate metric; "top task" and "planned tasks" not
  together; when capacity exists, a picked focus target ≤ capacity. Title/reason sanitized; invalid title → default
  "모멘텀 쌓기", invalid reason → null. Unpicked candidates become `spare`. Any failure → the E2 rule quest.

### When
- Only the nightly job creates today's daily quest with AI (local early morning). The scheduler page never waits on
  AI: if today's daily quest doesn't exist at load time, the rule quest is created as in E2.
- Weekly and recovery quests stay rule-based.

### Storage and UI
- `quests.generated_by` allows `'ai'`; `quests.reason text null`.
- In the quest panel, an AI-built daily quest shows one small line `SYSTEM 추천 · {reason}` under its title.

## 3. Errors
- All AI paths go through `callAi` (cap, ledger). Failures log kind/code only; pages render with existing data.
- Actions (re-analyze, settings) follow Zod → user → service → `ActionResult`.

## 4. Testing
- **Unit:** `analysisSlot` (weekday/hour, local time, a DST week, off); evidence check (unknown numbers dropped, known
  kept, percent forms, digits in assessment dropped); `analysisInput` (snapshot picking, nulls); quest pool (top task,
  weak domain, keys); quest validator (pool membership, duplicates, conflict pair, capacity, sanitizing); fallback
  equals the E2 rule quest.
- **SQL:** RLS on `system_insights`; `generated_by = 'ai'` allowed; settings range checks.
- **E2E (`system-analysis.spec.ts`, no real AI):** seeded insight → card shows explanations and assessment; change the
  analysis time → "다음 분석" updates; seeded AI daily quest → "SYSTEM 추천" line in the panel.
- Real AI paths: unit-tested pure parts plus a manual smoke run (2 Haiku calls).

## 5. Deviations (ADR 0019)
- User-chosen analysis time, delivered lazily (page load + nightly) because crons are daily.
- [다시 분석] once per local day.
- Evidence numbers must come from the input.
- AI quests pick only from the catalog-based pool; created only by the nightly job; rule fallback.
- Weekly/recovery quests stay rule-based.

## Out of scope
Embedding similarity, AI-generated weekly quests, free-form AI objectives, chat with the SYSTEM.
