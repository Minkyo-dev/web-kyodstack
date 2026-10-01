# System analysis and AI quest candidates (F2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly SYSTEM analysis (stat explanations + qualitative assessment) at a user-chosen weekday/hour, citing only given numbers, and AI-picked daily quests from the rule-built pool with rule fallback.

**Architecture:** Pure builders/validators (`features/ai/utils/analysis.ts`, `features/gamification/utils/quest-pool.ts`) wrap `callAi`. Analysis is generated lazily on the progress page and nightly when the weekly slot has passed. Quest generation accepts an optional `picker` callback, so gamification never imports AI; the jobs layer passes the AI picker.

**Tech Stack:** Next.js 16 RSC + server actions, Supabase (RLS), Zod 4, `callAi` (Haiku 4.5 / Fake), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-system-analysis-ai-quests-design.md`

## Global Constraints
- Analysis slot = most recent local instant at `insight_weekday`/`insight_hour` ≤ now; `insight_weekday = null` → off. Defaults: `week_starts_on`, 8.
- Re-analyze at most once per local day; all AI calls through `callAi` (30/day).
- Analysis input: computed numbers only (no notes, no titles). Every number in an explanation must exist in the input; assessment lines contain no digits.
- Quest AI picks exactly 3 distinct pool keys; no duplicate metric; top-task and planned-tasks not together; focus target ≤ capacity; any failure → E2 rule quest. Only the nightly job uses the AI picker.
- Gamification code must not import `features/ai`; the jobs layer composes.
- No real AI calls in E2E.
- Stage explicit paths only.

## Review Focus
1. Slot math across DST and when today is the chosen weekday but before the hour → last week's slot. Test: Task 2 `analysisSlot`.
2. "8 sessions" style evidence with numbers that are in the input as counts → kept; a made-up percentage → dropped. Test: Task 2 `checkEvidence`.
3. The AI picks the top-task and planned-tasks candidates together → rejected → rule quest. Test: Task 4 validator.
4. Analysis due check uses `created_at ≥ slot` so a manual re-analysis after the slot also satisfies the week. Test: Task 2 `analysisDue`.
5. Weak domain equal to the top domain → no weak-domain candidate. Test: Task 4 pool.

---

### Task 1: Database

**Files:** Create `supabase/migrations/<ts>_system_insights.sql`, `supabase/tests/rls/system_insights.sql`; modify `src/types/database.ts`,
`src/features/scheduler/queries/schedule.queries.ts` and `src/features/jobs/services/job-runner.ts` (settings select lists add `insight_weekday, insight_hour`).

- [ ] **Step 1: SQL test**
```sql
-- F2: system_insights RLS, quests.generated_by 'ai' + reason, insight settings checks.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.system_insights (user_id, kind, period_start, period_end, input, content, model, prompt_version)
values ('00000000-0000-4000-a000-00000000000b', 'weekly_analysis', '2026-09-21', '2026-09-27', '{}', '{}', 'fake-1', 'analysis-v1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ begin
  insert into public.system_insights (user_id, kind, period_start, period_end, input, content, model, prompt_version)
  values ('00000000-0000-4000-a000-00000000000a', 'weekly_analysis', '2026-09-28', '2026-10-04', '{}', '{"explanations":[]}', 'fake-1', 'analysis-v1');
  assert (select count(*) from public.system_insights) = 1, 'A sees only own insight';
  begin
    insert into public.system_insights (user_id, kind, period_start, period_end, input, content)
    values ('00000000-0000-4000-a000-00000000000a', 'gossip', '2026-09-28', '2026-10-04', '{}', '{}');
    raise exception 'FAIL: unknown kind';
  exception when check_violation then null; end;
  begin
    update public.system_insights set content = '{}';
    raise exception 'FAIL: user updated an insight';
  exception when insufficient_privilege then null; end;
  -- insight settings
  update public.scheduler_settings set insight_weekday = 3, insight_hour = 21;
  update public.scheduler_settings set insight_weekday = null;
  begin
    update public.scheduler_settings set insight_hour = 24;
    raise exception 'FAIL: hour 24';
  exception when check_violation then null; end;
  -- AI quests
  perform public.create_quest('{"type":"daily","title":"집중의 날","period_start":"2026-09-30","period_end":"2026-09-30","reward_xp":50,"rules_version":"quest-v1","spare":[]}',
    '[{"position":1,"metric":"focus_minutes","params":{},"target_value":60}]');
  update public.quests set generated_by = 'ai', reason = '오후 집중이 잘 지켜져요';
  assert (select generated_by from public.quests) = 'ai', 'ai quest';
end $$;
rollback;
```
- [ ] **Step 2: Run before migration** — Expected: FAIL (`relation "public.system_insights" does not exist`).
- [ ] **Step 3: Migration**
```sql
-- F2: weekly system analysis + AI-picked daily quests.
-- Spec: docs/superpowers/specs/2026-09-30-system-analysis-ai-quests-design.md
create table public.system_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('weekly_analysis')),
  period_start date not null,
  period_end date not null,
  input jsonb not null,
  content jsonb not null,
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);
create index system_insights_user_created_idx on public.system_insights (user_id, kind, created_at desc);
alter table public.system_insights enable row level security;
create policy system_insights_select_own on public.system_insights for select to authenticated using (user_id = (select auth.uid()));
create policy system_insights_insert_own on public.system_insights for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on public.system_insights from anon;
revoke update, delete on public.system_insights from authenticated;

alter table public.scheduler_settings
  add column insight_weekday smallint check (insight_weekday between 0 and 6),
  add column insight_hour smallint not null default 8 check (insight_hour between 0 and 23);
update public.scheduler_settings set insight_weekday = week_starts_on;

alter table public.quests drop constraint quests_generated_by_check;
alter table public.quests add constraint quests_generated_by_check check (generated_by in ('system', 'ai'));
alter table public.quests add column reason text check (char_length(reason) <= 80);
```
(New users: `scheduler_settings` rows are created by the bootstrap function; `insight_weekday` stays null there → set it in the bootstrap is out of scope; treat null-on-new-account as "off" until the user picks a time. Record as a ruling.)
- [ ] **Step 4: Apply, list, rename, regenerate types; SQL test passes; advisors clean.**
- [ ] **Step 5: Settings select lists** add `insight_weekday, insight_hour` (`getSchedulerContext`, `loadJobUsers`); `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** `F2-1: system_insights, insight schedule settings, AI quest provenance`.

---

### Task 2: Pure analysis helpers

**Files:** Create `src/features/ai/utils/analysis.ts`, test `tests/unit/analysis.test.ts`.

**Interfaces:** `analysisSlot(now: Date, tz, weekday: number | null, hour: number) → Date | null`;
`analysisDue(slot: Date | null, latestCreatedAt: string | null) → boolean`;
`analysisInput({ stats: Stats, snapshots: SnapshotRow[], today, tz }) → AnalysisInput`;
`inputNumbers(input) → Set<string>`; `checkEvidence(content, input) → AnalysisContent | null`.

- [ ] **Step 1: Failing tests**
```ts
import { describe, expect, it } from "vitest";
import { analysisDue, analysisSlot, checkEvidence } from "@/features/ai/utils/analysis";

const TZ = "America/Toronto";

describe("analysisSlot", () => {
  it("most recent local weekday/hour at or before now", () => {
    // Wed 2026-09-30 21:30 Toronto (EDT) = 2026-10-01T01:30Z
    const now = new Date("2026-10-01T01:30:00Z");
    expect(analysisSlot(now, TZ, 3, 21)?.toISOString()).toBe("2026-10-01T01:00:00.000Z"); // today 21:00
    expect(analysisSlot(now, TZ, 3, 22)?.toISOString()).toBe("2026-09-24T02:00:00.000Z"); // last Wed 22:00
    expect(analysisSlot(now, TZ, 1, 8)?.toISOString()).toBe("2026-09-28T12:00:00.000Z"); // Mon 08:00
    expect(analysisSlot(now, TZ, null, 8)).toBeNull();
  });
  it("uses local time across DST (Toronto falls back on Sun 2026-11-01)", () => {
    const now = new Date("2026-11-03T15:00:00Z"); // Tue 10:00 EST
    expect(analysisSlot(now, TZ, 1, 8)?.toISOString()).toBe("2026-11-02T13:00:00.000Z"); // Mon 08:00 EST
  });
});

describe("analysisDue", () => {
  it("due when nothing was created since the slot", () => {
    const slot = new Date("2026-09-28T12:00:00Z");
    expect(analysisDue(slot, null)).toBe(true);
    expect(analysisDue(slot, "2026-09-27T12:00:00Z")).toBe(true);
    expect(analysisDue(slot, "2026-09-28T12:00:00Z")).toBe(false);
    expect(analysisDue(null, null)).toBe(false);
  });
});

describe("checkEvidence", () => {
  const input = { stats: { calibration: { now: 78, weekAgo: 72, monthAgo: null, samples: 8, bias: 0.14, biasMonthAgo: 0.31 } }, patterns: { medianSessionMinutes: 46 } };
  it("keeps explanations whose numbers are in the input (percent forms too)", () => {
    const out = checkEvidence(
      {
        explanations: [
          { stat: "calibration", headline: "예상 정확도가 72 → 78로 올랐어요", detail: "과소 예상이 +31% → +14%로 줄었어요", evidence: ["8개 작업 기준"] },
          { stat: "calibration", headline: "정확도 95", detail: "x", evidence: [] },
        ],
        assessment: { planningTendency: "조금 낙관적", workStyle: "긴 집중 세션", currentRisk: "저녁 과부하", strongPattern: "오전 실행 3회" },
      },
      input,
    );
    expect(out?.explanations).toHaveLength(1);
    expect(out?.assessment).toEqual({ planningTendency: "조금 낙관적", workStyle: "긴 집중 세션", currentRisk: "저녁 과부하", strongPattern: null });
  });
  it("returns null when nothing survives", () => {
    expect(checkEvidence({ explanations: [{ stat: "calibration", headline: "99점", detail: "", evidence: [] }], assessment: { planningTendency: "1", workStyle: "2", currentRisk: "3", strongPattern: "4" } }, input)).toBeNull();
  });
});
```
Run → FAIL.
- [ ] **Step 2: Implement** `utils/analysis.ts`:
  - `analysisSlot`: if weekday null → null. Let `today = toLocalDate(now, tz)`; for k in 0..7: `d = addLocalDays(today, -k, tz)`; if
    `new Date(d+"T12:00:00Z").getUTCDay() === weekday`, `slot = localDateTimeToIso(d, pad(hour)+":00", tz)`; return the first slot ≤ now
    (k=0 may be in the future → continue to k=7).
  - `analysisDue(slot, latest)`: `!!slot && (!latest || new Date(latest) < slot)`.
  - `analysisInput`: for each stat type: `{ now: stats[type].value, weekAgo, monthAgo, samples, need }` where weekAgo/monthAgo = value of the
    latest overall snapshot with `computed_on ≤ today−7 / today−28` (same `formula_version` not required; nulls allowed). Calibration adds
    `bias`, `typicalError`, `biasMonthAgo` (null — snapshots store bias? use `null` if not stored), `blockerCount`, `byType` values. Patterns copied.
  - `inputNumbers(input)`: walk all numbers in the JSON; for each n add `String(n)`, `String(Math.round(n))`, and when |n| ≤ 1 also the percent forms
    `String(Math.round(n*100))`; when 1 < |n| ≤ 100 also `String(n/100)`.
  - `numbersIn(text)`: regex `/[+-]?\d+(?:\.\d+)?/g` → strip signs → strings.
  - `checkEvidence(content, input)`: keep explanations whose headline/detail/evidence numbers ⊆ `inputNumbers`; assessment fields with any digit → null;
    return null if no explanation survives and every assessment field is null.
- [ ] **Step 3: Run** `npx vitest run` → pass. **Step 4: Commit** `F2-2: analysis slot, due check, input builder, evidence check`.

---

### Task 3: Analysis service, prompt, actions, settings, card

**Files:** Create `src/features/ai/prompts/analysis.prompt.ts`, `src/features/ai/schemas/analysis.schema.ts`, `src/features/ai/services/analysis.service.ts`,
`src/features/ai/actions/analysis.actions.ts`, `src/features/ai/components/system-analysis-card.tsx`, `src/features/ai/components/analysis-schedule.tsx`;
modify `src/features/ai/providers/fake.ts`, `src/app/(private)/scheduler/progress/page.tsx`, `src/features/jobs/services/jobs.ts` (via `runAiNightly`), `src/features/ai/services/ai-nightly.service.ts`.

- [ ] **Step 1:** Schema `AnalysisOutputSchema` (explanations ≤ 4 with lengths; assessment 4 strings ≤ 80; stat enum). Prompt `analysis-v1` system text:
  explain changes using only given numbers, never invent numbers, Korean, short, no judgement of the person; assessment qualitative without digits.
  Fake output with numbers from the input (read `prompt` JSON: use calibration now/weekAgo when present, else a no-number explanation).
- [ ] **Step 2:** Service:
  - `latestAnalysis(supabase, userId)` → newest `weekly_analysis` row or null.
  - `generateAnalysis(ctx, now)`: load stats (`loadStatInput` + `computeStats`), snapshots (`listSnapshots` since today−35), build input,
    `callAi(ctx, "weekly_analysis", …)`, `checkEvidence`; null → return null; insert `system_insights` (period = last 7 local days) → row.
  - `ensureAnalysis(ctx, now)`: settings → `analysisSlot`; `analysisDue(slot, latest?.created_at)` → `generateAnalysis`. Never throws (logs).
  - `reanalyze(ctx, now)`: if latest created today (local) → `AppError("CONFLICT", "오늘 이미 분석했어요.")`; else `generateAnalysis` (null → `AppError("AI_OUTPUT_INVALID")`).
  - `updateAnalysisSchedule(ctx, { weekday: number | null, hour })` → `scheduler_settings` update (own row).
- [ ] **Step 3:** Actions `reanalyzeAction()`, `updateAnalysisScheduleAction({ weekday, hour })` (Zod: weekday 0–6 nullable, hour 0–23), revalidate `/scheduler/progress`.
- [ ] **Step 4:** UI:
  - `SystemAnalysisCard` (server-rendered props, client buttons): heading "SYSTEM ANALYSIS"; explanations list (headline bold, detail, evidence mono small);
    "SYSTEM ASSESSMENT" with labels 계획 경향 / 작업 방식 / 현재 위험 / 강한 패턴 (skip nulls); footer `분석 {date time} · 다음 분석 {요일} {hh}:00` (or "자동 분석 꺼짐"),
    [다시 분석] (disabled + "오늘 이미 분석했어요" when latest is today). Empty: "다음 분석: …" + [지금 분석] (same action).
  - `AnalysisSchedule` (client): weekday select (끄기, 일…토) + hour select, [저장] → `updateAnalysisScheduleAction`.
  - Progress page: `await ensureAnalysis(ctx, now)` (ctx = `{ user, supabase }`) before reading `latestAnalysis`; render the card under the stat
    grid and `AnalysisSchedule` in its footer.
- [ ] **Step 5:** Nightly: `runAiNightly` also calls `ensureAnalysis(ctx, new Date())` (counts in its result as `analyzed: 0|1`).
- [ ] **Step 6:** `npx tsc --noEmit && npx eslint src && npx vitest run` clean. **Commit** `F2-3: weekly SYSTEM analysis (lazy + nightly), schedule setting, card`.

---

### Task 4: AI quest candidates

**Files:** Create `src/features/gamification/utils/quest-pool.ts`, `src/features/ai/prompts/quest-picker.prompt.ts`, `src/features/ai/schemas/quest-picker.schema.ts`,
`src/features/ai/services/quest-picker.service.ts`; modify `src/features/gamification/queries/quest.queries.ts` (gen context: top task, weak domain, task titles, stat values),
`src/features/gamification/services/quest.service.ts` (`picker` option), `src/features/gamification/services/progress.service.ts` (`reconcileProgress` passes picker through options),
`src/features/jobs/services/jobs.ts`, `src/features/gamification/utils/quest-view.ts` + `components/quest-panel.tsx` (reason line), `src/features/ai/providers/fake.ts`;
test `tests/unit/quest-pool.test.ts`.

**Interfaces:**
- `DailyContext` gains `topTask: { id: string; title: string } | null`, `weakDomainId: string | null`, `taskTitles: string[]`, `stats: Record<StatType, number | null>`.
- `questPool(ctx) → { key: string; label: string; draft: ObjectiveDraft; family: string }[]`
- `PickerInput = { candidates: { key; label; target }[]; capacity; plannedMinutes; plannedTasks; topTitles: string[]; stats }`; `PickerOutput = { picks: string[]; title: string; reason: string }`
- `validatePicks(pool, output, capacity) → { objectives; spare; title; reason } | null`
- `QuestPicker = (input: PickerInput) => Promise<PickerOutput | null>`; `ensureQuests(ctx, now, admin = false, opts: { picker?: QuestPicker } = {})`
- `pickQuestObjectives(ctx, input: PickerInput) → Promise<PickerOutput | null>` (features/ai; plain types only)

- [ ] **Step 1: Failing tests** `tests/unit/quest-pool.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { questPool, validatePicks } from "@/features/gamification/utils/quest-pool";
import { dailyQuest } from "@/features/gamification/utils/quest-rules";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const ctx = {
  date: "2026-09-30", capacity: 180, plannedMinutes: 240, plannedTaskIds: [id(1), id(2)], topDomainId: id(9),
  topTask: { id: id(1), title: "Snowflake RBAC 정리" }, weakDomainId: id(8), taskTitles: ["Snowflake RBAC 정리"],
  stats: { calibration: 70, reliability: 60, consistency: null, recovery: null },
};

describe("questPool", () => {
  it("adds top task and weak domain candidates with keys", () => {
    const pool = questPool(ctx);
    expect(pool.map((c) => c.key)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
    expect(pool.find((c) => c.family === "top_task")?.draft).toEqual({ metric: "complete_planned_tasks", params: { taskIds: [id(1)] }, target: 1 });
    expect(pool.find((c) => c.family === "weak_domain")?.draft).toEqual({ metric: "domain_minutes", params: { domainId: id(8) }, target: 30 });
  });
  it("drops the weak domain when it equals the top domain, and the top task without one", () => {
    const pool = questPool({ ...ctx, weakDomainId: id(9), topTask: null });
    expect(pool.some((c) => c.family === "weak_domain" || c.family === "top_task")).toBe(false);
  });
});

describe("validatePicks", () => {
  const pool = questPool(ctx);
  const key = (family: string) => pool.find((c) => c.family === family)!.key;
  it("accepts three compatible picks; the rest become spare", () => {
    const r = validatePicks(pool, { picks: [key("focus"), key("top_task"), key("weak_domain")], title: "핵심 하나", reason: "가장 중요한 일부터" }, 180);
    expect(r?.objectives.map((o) => o.metric)).toEqual(["focus_minutes", "complete_planned_tasks", "domain_minutes"]);
    expect(r?.spare.length).toBe(pool.length - 3);
    expect(r?.title).toBe("핵심 하나");
  });
  it("rejects unknown keys, repeats, duplicate metrics, the conflict pair and over-capacity focus", () => {
    expect(validatePicks(pool, { picks: ["c1", "c2", "zz"], title: "t", reason: "r" }, 180)).toBeNull();
    expect(validatePicks(pool, { picks: ["c1", "c1", "c2"], title: "t", reason: "r" }, 180)).toBeNull();
    expect(validatePicks(pool, { picks: [key("planned"), key("top_task"), key("focus")], title: "t", reason: "r" }, 180)).toBeNull();
    expect(validatePicks(pool, { picks: [key("top_domain"), key("weak_domain"), key("focus")], title: "t", reason: "r" }, 180)).toBeNull(); // same metric
    expect(validatePicks(pool, { picks: [key("focus"), key("early"), key("kept")], title: "t", reason: "r" }, 60)).toBeNull(); // focus 110 > 60
  });
  it("sanitizes title and reason", () => {
    const r = validatePicks(pool, { picks: [key("focus"), key("early"), key("kept")], title: "x".repeat(30), reason: "a\u0000b" }, 180);
    expect(r?.title).toBe("모멘텀 쌓기");
    expect(r?.reason).toBe("ab");
  });
  it("the rule quest stays the fallback", () => {
    expect(dailyQuest(ctx).objectives.length).toBe(3);
  });
});
```
Run → FAIL.
- [ ] **Step 2: Implement**
  - `questPool(ctx)`: build the E2 daily candidates in order with families `focus`, `planned` (or `any_task`), `top_domain` (or `kept`), `early`, `kept`
    (dedupe as E2 does), then `top_task` (when `topTask`), `weak_domain` (when `weakDomainId && weakDomainId !== topDomainId`); assign keys `c1…`;
    labels in Korean (`집중 {formatMinutes(target)}`, `계획한 할 일 {n}개 완료`, `가장 중요한 할 일 완료: {title}`, `{domain} 연습 30분` uses "주 영역"/"약한 영역").
    Keep `dailyQuest` unchanged; refactor it to share the candidate builder only if trivial (otherwise duplicate the 5-line pool).
  - `validatePicks(pool, out, capacity)`: 3 distinct keys in pool; metrics distinct; not both `planned` and `top_task`; focus pick target ≤ capacity when
    capacity !== null; title = sanitize ≤ 20 else default; reason = sanitize ≤ 80 else null (sanitize = strip control chars, collapse spaces).
  - `quest-picker` prompt/schema (`{ picks: z.array(z.string()).length(3), title: z.string(), reason: z.string() }`), Fake output picks the first three keys.
  - `pickQuestObjectives(ctx, input)` → `callAi(ctx, "quest_picker", …)`; any error → null.
  - Gen context: top task = among `plannedTaskIds` the one with the lowest `priority` (1 = most important), then earliest created; weak domain = root with the
    smallest positive focused minutes in 28 days; stat values from `computeStats(await loadStatInput(...))` only when a picker is given (avoid the cost otherwise).
  - `ensureQuests(..., { picker })`: when creating today's daily quest and `picker` exists: `out = await picker(input)`; `v = out && validatePicks(pool, out, capacity)`;
    if `v` → create with `generated_by 'ai'`, title, reason, objectives, spare; else the rule draft. (`create_quest` takes the quest JSON; set
    `generated_by`/`reason` with an update right after creation — or extend the function to read them: prefer the update to avoid a migration change.)
  - `reconcileProgress(ctx, now, opts)` forwards `opts.picker` to `ensureQuests`; `jobs.ts` passes `{ picker: (input) => pickQuestObjectives(ctx, input) }`.
  - Quest view: `QuestRow` selects `generated_by, reason`; `QuestView` gains `reason: string | null` (only when `generated_by === "ai"`); panel shows
    `SYSTEM 추천 · {reason}` under the daily title.
- [ ] **Step 3:** `npx tsc --noEmit && npx eslint src && npx vitest run` clean. **Commit** `F2-4: AI-picked daily quests from the rule pool (nightly), SYSTEM 추천 line`.

---

### Task 5: E2E, docs, verification
- [ ] **E2E** `tests/e2e/system-analysis.spec.ts` (no real AI):
  1. Record the settings' `insight_weekday/insight_hour`; set `insight_weekday = null` (off) so the page doesn't call the AI; seed a `system_insights` row
     with two explanations (numbers matching nothing is fine — the page renders stored content) and an assessment.
  2. Progress page: "SYSTEM ANALYSIS" shows both headlines and "계획 경향"; footer "자동 분석 꺼짐".
  3. Schedule: pick 수 / 21 → save → footer shows "다음 분석 수 21:00". Then restore the recorded settings in `finally`
     (setting a past slot would make the next page load call the AI; the restore happens before any further navigation).
  4. Gamification: enable via DB-free path as in `quests.spec.ts`? Simpler: seed `player_profiles` is not allowed for cache columns — instead insert a profile
     row with `gamification_enabled = true` (allowed columns) and a daily quest via `create_quest` RPC then `update quests set generated_by='ai', reason=...`;
     the scheduler panel shows `SYSTEM 추천 · …`. Restore the profile and delete quests created after the test start in `finally`.
- [ ] **Docs:** ADR 0019 (spec §5 + rulings), README row, progress F2 checklist, schema rows, architecture line.
- [ ] **Verification:** tsc, eslint, vitest, build (re-check tsc; fix `.next/dev` if corrupted), all E2E (16 specs), DB check, manual AI smoke suggestion in the report.
- [ ] **Commit + push** `F2-5: system analysis / AI quest E2E; ADR 0019, docs`.
