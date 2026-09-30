# Stat Engine + Progress Page (Sub-project D2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute Calibration / Reliability / Consistency / Recovery and patterns deterministically from raw data.
Show them live on `/scheduler/progress` with 8-week trends from nightly snapshots. Let the user set their work
standards.

**Architecture:**
- **Engine.** Pure `computeStats(input)` in `src/features/analytics/utils/stats.ts`. `loadStatInput` reads the
  bounded raw rows with explicit `user_id` filters.
- **Where it runs.** The page computes live. The existing nightly `duration_profile_refresh` job upserts
  `stat_snapshots` through the same function.

**Tech Stack:** Next.js 16, React 19, Supabase (remote via MCP), Zod 4, Vitest, Playwright, date-fns tz utils.

**Spec:** `docs/superpowers/specs/2026-09-30-stat-engine-progress-design.md`. Read it first. Formulas there are binding.

## Global Constraints

- `AGENTS.md` rules. Remote DB via MCP: apply → `list_migrations` → rename → types → SQL tests → advisors.
- Mutations: Zod → `runAction` → service → `ActionResult`. The admin client is only in jobs, and every query filters `user_id`.
- Stats are deterministic TS. The LLM never computes them. Store `formula_version` with every snapshot.
- Local days via `profiles.timezone` and the tz utils (never fixed offsets). Focused minutes = wall − pauses
  (`focusedMinutesInWindow`).
- Copy is factual and never judgmental; text carries meaning, not color alone. UI is in Korean.
- Stage explicit paths only (`AGENTS.md` is the user's). Before each commit: `npx tsc --noEmit && npx eslint . && npx vitest run`.
- The final task runs `npm run build` and the full E2E (dev server :3000; restart it if the build killed it).

## Review Focus

1. **A block moved with a length change** is recorded as `resized`, yet its start changed. The commitment must
   follow start changes, not the change type. → Task 2 test "resized revision that moves the start counts as a move".
2. **A brand-new account (no rows)** must render every card as "데이터 수집 중" without NaN.
   → Task 2 test "empty input".
3. **A session that crosses midnight during a DST change** must count per day correctly in Consistency.
   → Task 2 DST test.
4. **Unresolved young misses** (< 14 days, not recovered) must not pull Recovery down. → Task 2 test.
5. **Saving work standards with no days** must be rejected before the DB. → Task 3 schema test (unit) + SQL check.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_stat_engine.sql` | settings columns + checks, `stat_snapshots` + RLS/grants |
| `supabase/tests/rls/stat_engine.sql` | SQL tests |
| `src/features/analytics/domain/stats.types.ts` | `STATS_VERSION`, `StatInput`, `Stats`, labels, `STAT_MIN` |
| `src/features/analytics/utils/stats.ts` | pure engine |
| `src/features/analytics/queries/stat-input.queries.ts` | `loadStatInput` |
| `src/features/analytics/queries/snapshots.queries.ts` | `listSnapshots` |
| `src/features/analytics/services/snapshot.service.ts` | `writeDailySnapshot` (job) |
| `src/features/analytics/schemas/work-standards.schema.ts`, `actions/work-standards.actions.ts`, `services/work-standards.service.ts` | settings save |
| `src/features/analytics/components/*` | `StatCard`, `Sparkline`, `PatternList`, `DomainBars`, `WorkStandardsDialog` |
| `src/app/(private)/scheduler/progress/page.tsx` | page |
| `src/components/layout/private-nav.tsx` | nav item "진행" |
| scheduler settings menu/workspace, `task.types.ts`, `schedule.queries.ts`, `job-runner.ts`, `jobs.ts` | wiring |
| `tests/unit/stats.test.ts`, `tests/unit/work-standards.test.ts`, `tests/e2e/progress.spec.ts` | tests |
| docs: `schema.md`, ADR 0014, README, `progress.md` | docs |

---

### Task 1: Migration — work standards + stat snapshots

**Files:** `supabase/tests/rls/stat_engine.sql`, `supabase/migrations/20260930180000_stat_engine.sql`, `src/types/database.ts`

- [ ] **Step 1: SQL test**

```sql
-- Stat engine: work-standard checks, stat_snapshots RLS (read own; writes only by the service role).
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

-- service role writes one snapshot for A and one for B
insert into public.stat_snapshots (user_id, computed_on, stat_type, scope, value, sample_count, window_start, window_end, formula_version)
values
  ('00000000-0000-4000-a000-00000000000a', '2026-09-30', 'calibration', 'overall', 82, 9, '2026-09-02', '2026-09-30', 'stats-v1'),
  ('00000000-0000-4000-a000-00000000000b', '2026-09-30', 'calibration', 'overall', 70, 9, '2026-09-02', '2026-09-30', 'stats-v1');
do $$ begin
  begin
    insert into public.stat_snapshots (user_id, computed_on, stat_type, scope, sample_count, window_start, window_end, formula_version)
    values ('00000000-0000-4000-a000-00000000000a', '2026-09-30', 'calibration', 'overall', 0, '2026-09-02', '2026-09-30', 'stats-v1');
    raise exception 'FAIL: duplicate snapshot';
  exception when unique_violation then null; end;
  begin
    insert into public.stat_snapshots (user_id, computed_on, stat_type, scope, sample_count, window_start, window_end, formula_version)
    values ('00000000-0000-4000-a000-00000000000a', '2026-09-30', 'focus', 'overall', 0, '2026-09-02', '2026-09-30', 'stats-v1');
    raise exception 'FAIL: unknown stat type';
  exception when check_violation then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare n int; begin
  assert (select count(*) from public.stat_snapshots) = 1, 'A reads only own snapshot';
  begin
    insert into public.stat_snapshots (user_id, computed_on, stat_type, scope, sample_count, window_start, window_end, formula_version)
    values ('00000000-0000-4000-a000-00000000000a', '2026-10-01', 'calibration', 'overall', 0, '2026-09-03', '2026-10-01', 'stats-v1');
    raise exception 'FAIL: user inserted snapshot';
  exception when insufficient_privilege then null; end;
  update public.stat_snapshots set value = 1; get diagnostics n = row_count;
  assert n = 0 or true, 'update revoked';
  -- work standards: defaults and checks
  assert (select planned_work_days from public.scheduler_settings) = '{1,2,3,4,5}', 'default work days';
  assert (select min_meaningful_minutes from public.scheduler_settings) = 30, 'default min';
  assert (select commit_lead_minutes from public.scheduler_settings) = 120, 'default lead';
  begin update public.scheduler_settings set planned_work_days = '{}'; raise exception 'FAIL: empty days';
  exception when check_violation then null; end;
  begin update public.scheduler_settings set planned_work_days = '{1,7}'; raise exception 'FAIL: day 7';
  exception when check_violation then null; end;
  begin update public.scheduler_settings set min_meaningful_minutes = 2; raise exception 'FAIL: min 2';
  exception when check_violation then null; end;
  begin update public.scheduler_settings set commit_lead_minutes = 2000; raise exception 'FAIL: lead 2000';
  exception when check_violation then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.stat_snapshots; raise exception 'FAIL: anon read';
  exception when insufficient_privilege then null; end;
end $$;
select 'PASS stat_engine' as result;
rollback;
```
Replace the weak `update … assert n = 0 or true` with a real check once you know the grant behavior. If `update` is
revoked, the statement raises `insufficient_privilege`, so wrap it in `begin … exception when
insufficient_privilege then null; end;` and expect that path.

- [ ] **Step 2: Run to verify it fails** (`relation "public.stat_snapshots" does not exist`).

- [ ] **Step 3: Migration**

```sql
-- Stat engine + progress (sub-project D2).
-- Spec: docs/superpowers/specs/2026-09-30-stat-engine-progress-design.md

alter table public.scheduler_settings
  add column planned_work_days smallint[] not null default '{1,2,3,4,5}'
    check (cardinality(planned_work_days) between 1 and 7 and planned_work_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  add column min_meaningful_minutes integer not null default 30 check (min_meaningful_minutes between 5 and 480),
  add column commit_lead_minutes integer not null default 120 check (commit_lead_minutes between 0 and 1440);

create table public.stat_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  computed_on date not null,
  stat_type text not null check (stat_type in ('calibration', 'reliability', 'consistency', 'recovery')),
  scope text not null default 'overall',
  value numeric,
  bias numeric,
  typical_error numeric,
  sample_count integer not null check (sample_count >= 0),
  window_start date not null,
  window_end date not null,
  formula_version text not null,
  created_at timestamptz not null default now(),
  unique (user_id, computed_on, stat_type, scope)
);
create index stat_snapshots_user_day_idx on public.stat_snapshots (user_id, computed_on);

alter table public.stat_snapshots enable row level security;
create policy stat_snapshots_select_own on public.stat_snapshots
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.stat_snapshots from anon;
revoke insert, update, delete on public.stat_snapshots from authenticated;
```

- [ ] **Step 4: Apply, rename, regenerate the types.** Then run the SQL test (expected `PASS stat_engine`) and
  `get_advisors` (no new warnings).
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<version>_stat_engine.sql supabase/tests/rls/stat_engine.sql src/types/database.ts
git commit -m "D2-1: work standards settings and stat snapshots"
```

---

### Task 2: Pure stat engine

**Files:** `src/features/analytics/domain/stats.types.ts`, `src/features/analytics/utils/stats.ts`, `tests/unit/stats.test.ts`

**Interfaces (produced):**
```ts
export const STATS_VERSION = "stats-v1";
export const STAT_MIN = { calibration: 8, calibrationByType: 5, reliability: 10, consistency: 15, recovery: 5 } as const;
export type StatInput = {
  now: string;                       // ISO
  timezone: string;
  settings: { planned_work_days: number[]; min_meaningful_minutes: number; commit_lead_minutes: number };
  firstActivityDate: string | null;  // local yyyy-MM-dd
  blocks: { id: string; task_id: string; starts_at: string; ends_at: string; status: string; created_at: string; updated_at: string }[];
  revisions: { block_id: string; change_type: string; previous_starts_at: string | null; new_starts_at: string | null; created_at: string }[];
  sessions: { id: string; task_id: string; schedule_block_id: string | null; started_at: string; ended_at: string | null; pauses: { paused_at: string; resumed_at: string | null }[]; focus_score: number | null }[];
  tasks: { id: string; status: string; task_type: string | null; practice_domain_id: string | null }[];
  calibration: { task_id: string; task_type: string | null; completed_at: string; estimate: number | null; firstSessionStart: string | null; actualMinutes: number; planBlocks: { starts_at: string; ends_at: string; status: string; created_at: string }[] }[];
  domains: { id: string; name: string; parent_id: string | null }[];
  domainTotals: Record<string, number>;   // all-time focused minutes per domain (own, before roll-up)
};
export type StatValue = { value: number | null; sampleCount: number; need: number };
export type Stats = { … exactly as the spec §2 Output … };
export function computeStats(input: StatInput): Stats;
// helpers exported for tests:
export function calibrationScore(planned: number, actual: number): number;
export function commitments(input: StatInput): Commitment[];
export type Commitment = { blockId: string; taskId: string; kind: "move" | "final"; slotStart: string; resolvedAt: string; score: number };
```

- [ ] **Step 1: Types** `stats.types.ts`

```ts
import type { TaskType } from "@/features/classification/domain/classification.types";

export const STATS_VERSION = "stats-v1";
export const STAT_MIN = { calibration: 8, calibrationByType: 5, reliability: 10, consistency: 15, recovery: 5 } as const;
export const STAT_TYPES = ["calibration", "reliability", "consistency", "recovery"] as const;
export type StatType = (typeof STAT_TYPES)[number];
export const STAT_LABEL: Record<StatType, { name: string; meaning: string }> = {
  calibration: { name: "예상 정확도", meaning: "작업 시간을 얼마나 정확히 예상하는지" },
  reliability: { name: "계획 이행", meaning: "미리 잡은 일정을 얼마나 지키는지" },
  consistency: { name: "꾸준함", meaning: "근무일마다 의미 있게 일했는지" },
  recovery: { name: "회복력", meaning: "놓친 뒤 얼마나 빨리 다시 시작하는지" },
};

export type PauseLike = { paused_at: string; resumed_at: string | null };
export type StatInput = {
  now: string;
  timezone: string;
  settings: { planned_work_days: number[]; min_meaningful_minutes: number; commit_lead_minutes: number };
  firstActivityDate: string | null;
  blocks: { id: string; task_id: string; starts_at: string; ends_at: string; status: string; created_at: string; updated_at: string }[];
  revisions: { block_id: string; change_type: string; previous_starts_at: string | null; new_starts_at: string | null; created_at: string }[];
  sessions: {
    id: string;
    task_id: string;
    schedule_block_id: string | null;
    started_at: string;
    ended_at: string | null;
    pauses: PauseLike[];
    focus_score: number | null;
  }[];
  tasks: { id: string; status: string; task_type: string | null; practice_domain_id: string | null }[];
  calibration: {
    task_id: string;
    task_type: string | null;
    completed_at: string;
    estimate: number | null;
    firstSessionStart: string | null;
    actualMinutes: number;
    planBlocks: { starts_at: string; ends_at: string; status: string; created_at: string }[];
  }[];
  domains: { id: string; name: string; parent_id: string | null }[];
  domainTotals: Record<string, number>;
};

export type StatValue = { value: number | null; sampleCount: number; need: number };
export type Stats = {
  version: typeof STATS_VERSION;
  calibration: StatValue & {
    bias: number | null;
    typicalError: number | null;
    byType: Partial<Record<TaskType, StatValue & { bias: number | null }>>;
  };
  reliability: StatValue;
  consistency: StatValue & { successDays: number; workDays: number };
  recovery: StatValue;
  patterns: {
    medianSessionMinutes: number | null;
    pauseRatio: number | null;
    averageFocus: number | null;
    dailyCapacityMinutes: number | null;
    reliableWindow: { start: string; end: string } | null;
    rescheduleWindow: { start: string; end: string } | null;
  };
  domains: { id: string; name: string; parentId: string | null; recentMinutes: number; totalMinutes: number }[];
};
```

- [ ] **Step 2: Failing tests** `tests/unit/stats.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { calibrationScore, commitments, computeStats } from "@/features/analytics/utils/stats";
import type { StatInput } from "@/features/analytics/domain/stats.types";

const TZ = "America/Toronto"; // EDT (UTC−4) until 2026-11-01
const NOW = "2026-10-30T16:00:00.000Z"; // Fri 12:00 local
const base = (over: Partial<StatInput> = {}): StatInput => ({
  now: NOW,
  timezone: TZ,
  settings: { planned_work_days: [1, 2, 3, 4, 5], min_meaningful_minutes: 30, commit_lead_minutes: 120 },
  firstActivityDate: "2026-09-01",
  blocks: [],
  revisions: [],
  sessions: [],
  tasks: [],
  calibration: [],
  domains: [],
  domainTotals: {},
  ...over,
});
/** Local wall time → ISO (EDT fixture helper; fixtures stay before the DST change unless noted). */
const L = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-04:00`).toISOString();
const session = (id: string, task: string, start: string, end: string | null, block: string | null = null) => ({
  id,
  task_id: task,
  schedule_block_id: block,
  started_at: start,
  ended_at: end,
  pauses: [],
  focus_score: null,
});

describe("calibrationScore (requirements §23)", () => {
  it.each([
    [60, 60, 100],
    [60, 66, 91],
    [60, 75, 80],
    [60, 90, 67],
    [60, 120, 50],
  ])("planned %i actual %i → %i", (p, a, s) => expect(calibrationScore(p, a)).toBe(s));
});

describe("empty input", () => {
  it("every stat collects data; no NaN", () => {
    const s = computeStats(base());
    expect(s.calibration).toMatchObject({ value: null, sampleCount: 0, need: 8 });
    expect(s.reliability.value).toBeNull();
    expect(s.consistency.value).toBeNull();
    expect(s.recovery.value).toBeNull();
    expect(JSON.stringify(s)).not.toContain("NaN");
  });
});

describe("calibration", () => {
  const sample = (i: number, estimate: number, actual: number, type: string | null = "coding") => ({
    task_id: `t${i}`,
    task_type: type,
    completed_at: L("2026-10-20", "12:00"),
    estimate,
    firstSessionStart: L("2026-10-20", "09:00"),
    actualMinutes: actual,
    planBlocks: [],
  });
  it("mean score, bias and typical error over ≥ 8 samples", () => {
    const cal = Array.from({ length: 8 }, (_, i) => sample(i, 60, 66));
    const s = computeStats(base({ calibration: cal }));
    expect(s.calibration.value).toBe(91);
    expect(s.calibration.bias).toBe(0.1);
    expect(s.calibration.typicalError).toBe(0.1);
    expect(s.calibration.byType.coding).toMatchObject({ value: 91, sampleCount: 8 });
  });
  it("P is the plan made before the first session (blocks created later don't count)", () => {
    const c = {
      ...sample(1, 30, 60),
      planBlocks: [
        { starts_at: L("2026-10-20", "09:00"), ends_at: L("2026-10-20", "10:00"), status: "completed", created_at: L("2026-10-19", "20:00") },
        { starts_at: L("2026-10-20", "13:00"), ends_at: L("2026-10-20", "15:00"), status: "planned", created_at: L("2026-10-20", "11:00") },
      ],
    };
    const cal = [c, ...Array.from({ length: 7 }, (_, i) => sample(i + 2, 60, 60))];
    const s = computeStats(base({ calibration: cal }));
    // c: P = 60 (first block only), A = 60 → 100; all 100 → 100
    expect(s.calibration.value).toBe(100);
  });
  it("outside the 28-day window or without A is ignored", () => {
    const old = { ...sample(1, 60, 60), completed_at: L("2026-09-20", "12:00") };
    const none = { ...sample(2, 60, 0) };
    expect(computeStats(base({ calibration: [old, none] })).calibration.sampleCount).toBe(0);
  });
});

describe("commitments / reliability", () => {
  const blk = (over: Partial<StatInput["blocks"][number]> = {}) => ({
    id: "b1",
    task_id: "t1",
    starts_at: L("2026-10-28", "10:00"),
    ends_at: L("2026-10-28", "11:00"),
    status: "planned",
    created_at: L("2026-10-27", "20:00"),
    updated_at: L("2026-10-27", "20:00"),
    ...over,
  });
  const score = (input: StatInput) => commitments(input).map((c) => [c.kind, c.score]);
  it.each([
    [L("2026-10-28", "09:55"), 1],
    [L("2026-10-28", "10:15"), 0.9],
    [L("2026-10-28", "10:30"), 0.75],
    [L("2026-10-28", "10:45"), 0.5],
  ])("session starting %s → %f", (start, expected) => {
    const s = base({ blocks: [blk()], sessions: [session("s", "t1", start, L("2026-10-28", "11:30"), "b1")] });
    expect(score(s)).toEqual([["final", expected]]);
  });
  it("no session: missed 0, completed-by-user 1", () => {
    expect(score(base({ blocks: [blk()] }))).toEqual([["final", 0]]);
    expect(score(base({ blocks: [blk({ status: "completed" })] }))).toEqual([["final", 1]]);
  });
  it("skip ≥ lead before start 0.85; later 0", () => {
    expect(score(base({ blocks: [blk({ status: "skipped", updated_at: L("2026-10-28", "07:00") })] }))).toEqual([["final", 0.85]]);
    expect(score(base({ blocks: [blk({ status: "skipped", updated_at: L("2026-10-28", "09:30") })] }))).toEqual([["final", 0]]);
  });
  it("not committed (created 1h before) → no commitment", () => {
    expect(commitments(base({ blocks: [blk({ created_at: L("2026-10-28", "09:00") })] }))).toEqual([]);
  });
  it("proactive move 0.85; the new slot is its own commitment", () => {
    const b = blk({ starts_at: L("2026-10-29", "10:00"), ends_at: L("2026-10-29", "11:00") });
    const rev = { block_id: "b1", change_type: "moved", previous_starts_at: L("2026-10-28", "10:00"), new_starts_at: L("2026-10-29", "10:00"), created_at: L("2026-10-28", "07:00") };
    const s = base({ blocks: [b], revisions: [rev], sessions: [session("s", "t1", L("2026-10-29", "10:00"), L("2026-10-29", "11:00"), "b1")] });
    expect(score(s)).toEqual([["move", 0.85], ["final", 1]]);
  });
  it("late move 0.5; resized revision that moves the start counts as a move", () => {
    const b = blk({ starts_at: L("2026-10-28", "15:00"), ends_at: L("2026-10-28", "15:30") });
    const rev = { block_id: "b1", change_type: "resized", previous_starts_at: L("2026-10-28", "10:00"), new_starts_at: L("2026-10-28", "15:00"), created_at: L("2026-10-28", "09:30") };
    // new slot set at 09:30 for 15:00 → committed (≥ 120 min)
    expect(score(base({ blocks: [b], revisions: [rev] }))).toEqual([["move", 0.5], ["final", 0]]);
  });
  it("a resize that keeps the start doesn't reset commitment", () => {
    const rev = { block_id: "b1", change_type: "resized", previous_starts_at: L("2026-10-28", "10:00"), new_starts_at: L("2026-10-28", "10:00"), created_at: L("2026-10-28", "09:59") };
    expect(score(base({ blocks: [blk()], revisions: [rev] }))).toEqual([["final", 0]]);
  });
  it("future final slot is unresolved", () => {
    const b = blk({ starts_at: L("2026-10-30", "13:00"), ends_at: L("2026-10-30", "14:00"), created_at: L("2026-10-29", "10:00") });
    expect(commitments(base({ blocks: [b] }))).toEqual([]);
  });
  it("reliability needs 10 commitments", () => {
    const blocks = Array.from({ length: 10 }, (_, i) => blk({ id: `b${i}`, status: "completed" }));
    expect(computeStats(base({ blocks })).reliability).toMatchObject({ value: 100, sampleCount: 10 });
  });
});

describe("consistency (requirements §29)", () => {
  const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"];
  it("steady 2h every work day beats one 12h Monday", () => {
    const steady = days.map((d, i) => session(`s${i}`, "t", L(d, "09:00"), L(d, "11:00")));
    const burst = [session("m", "t", L("2026-10-19", "08:00"), L("2026-10-19", "20:00"))];
    const window = { firstActivityDate: "2026-10-19" };
    const a = computeStats(base({ ...window, sessions: burst })).consistency;
    const b = computeStats(base({ ...window, sessions: steady })).consistency;
    expect(a.workDays).toBe(9); // Mon 19 … Thu 29, today (Fri 30) excluded
    expect(a.successDays).toBe(1);
    expect(b.successDays).toBe(9);
    expect(a.value).toBeNull(); // < 15 days
  });
  it("value once ≥ 15 work days", () => {
    const s = computeStats(base({ firstActivityDate: "2026-10-01" })).consistency;
    expect(s.workDays).toBe(21);
    expect(s.value).toBe(0);
  });
  it("DST week: a session across local midnight Nov 1 splits by local day", () => {
    const now = "2026-11-06T17:00:00.000Z"; // Fri Nov 6, EST
    const late = session("x", "t", "2026-11-02T04:40:00.000Z", "2026-11-02T05:40:00.000Z"); // Sun 23:40 → Mon 00:40 EST
    const s = computeStats(base({ now, firstActivityDate: "2026-11-02", sessions: [late] })).consistency;
    expect(s.workDays).toBe(4); // Mon–Thu
    expect(s.successDays).toBe(1); // Monday has 40 min (00:00–00:40)
  });
});

describe("recovery", () => {
  const missed = (id: string, day: string) => ({
    id,
    task_id: `task-${id}`,
    starts_at: L(day, "10:00"),
    ends_at: L(day, "11:00"),
    status: "missed",
    created_at: L(day, "07:00"),
    updated_at: L(day, "07:00"),
  });
  const work = (task: string, day: string) => session(`w-${task}-${day}`, task, L(day, "14:00"), L(day, "15:00"));
  it("next work day 100, 2 days 75, 3 days 50, later 25", () => {
    const blocks = [missed("a", "2026-10-05"), missed("b", "2026-10-05"), missed("c", "2026-10-05"), missed("d", "2026-10-05"), missed("e", "2026-10-02")];
    const sessions = [
      work("task-a", "2026-10-06"), // Tue: 1 work day → 100
      work("task-b", "2026-10-07"), // 2 → 75
      work("task-c", "2026-10-08"), // 3 → 50
      work("task-d", "2026-10-13"), // 6 → 25
      work("task-e", "2026-10-02"), // same day after the block → 100
    ];
    const s = computeStats(base({ blocks, sessions })).recovery;
    expect(s).toMatchObject({ sampleCount: 5, value: 70 }); // (100+75+50+25+100)/5
  });
  it("abandoned (no work within 14 days) → 0; young unresolved excluded", () => {
    const blocks = [missed("old", "2026-10-05"), missed("young", "2026-10-26")];
    const s = computeStats(base({ blocks })).recovery;
    expect(s.sampleCount).toBe(1); // only "old"
  });
});

describe("patterns and domains", () => {
  it("capacity = median focused minutes of meaningful work days; domains roll up", () => {
    const sessions = [
      session("1", "t1", L("2026-10-26", "09:00"), L("2026-10-26", "10:00")),
      session("2", "t1", L("2026-10-27", "09:00"), L("2026-10-27", "12:00")),
      session("3", "t1", L("2026-10-28", "09:00"), L("2026-10-28", "09:10")), // below 30 → not a meaningful day
    ];
    const s = computeStats(
      base({
        sessions,
        tasks: [{ id: "t1", status: "in_progress", task_type: "coding", practice_domain_id: "child" }],
        domains: [
          { id: "parent", name: "Data Eng", parent_id: null },
          { id: "child", name: "Snowflake", parent_id: "parent" },
        ],
        domainTotals: { child: 500 },
      }),
    );
    expect(s.patterns.dailyCapacityMinutes).toBe(120); // median of 60, 180
    expect(s.patterns.medianSessionMinutes).toBe(60);
    const parent = s.domains.find((d) => d.id === "parent")!;
    expect(parent).toMatchObject({ recentMinutes: 250, totalMinutes: 500 });
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npx vitest run tests/unit/stats.test.ts` → module not found.

- [ ] **Step 4: Implement** `src/features/analytics/utils/stats.ts`

```ts
/**
 * Behavior stats v1 (D2 spec §2). Pure and deterministic: the page and the nightly snapshot call
 * the same function, and the LLM never computes these numbers.
 */
import { addLocalDays, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { focusedMinutesInWindow } from "@/features/scheduler/utils/focus";
import { median } from "@/features/scheduler/utils/estimator";
import { TASK_TYPES, type TaskType } from "@/features/classification/domain/classification.types";
import { STAT_MIN, STATS_VERSION, type StatInput, type Stats, type StatValue } from "../domain/stats.types";

const MIN = 60_000;
const t = (iso: string) => new Date(iso).getTime();
const round2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const stat = (values: number[], need: number): StatValue => ({
  value: values.length >= need ? Math.round(mean(values)!) : null,
  sampleCount: values.length,
  need,
});

export function calibrationScore(planned: number, actual: number): number {
  return Math.round(100 * Math.min(actual / planned, planned / actual));
}

/** Weekday (0 = Sunday) of a local calendar date, independent of zone. */
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

function workDays(from: string, toExclusive: string, planned: number[], tz: string): string[] {
  const out: string[] = [];
  for (let d = from; d < toExclusive; d = addLocalDays(d, 1, tz)) if (planned.includes(weekday(d))) out.push(d);
  return out;
}

type Session = StatInput["sessions"][number];
function focusedOnDay(sessions: Session[], date: string, tz: string, now: number, after?: number): number {
  const r = localDayRange(date, tz);
  const from = Math.max(t(r.start), after ?? -Infinity);
  return sessions.reduce((sum, s) => sum + focusedMinutesInWindow(s, s.pauses, from, t(r.end), now), 0);
}

export type Commitment = {
  blockId: string;
  taskId: string;
  kind: "move" | "final";
  slotStart: string;
  resolvedAt: string;
  score: number;
};

/** Every resolved commitment of every block (spec §2 Reliability). */
export function commitments(input: StatInput): Commitment[] {
  const lead = input.settings.commit_lead_minutes * MIN;
  const now = t(input.now);
  const out: Commitment[] = [];
  for (const b of input.blocks) {
    const revs = input.revisions
      .filter((r) => r.block_id === b.id)
      .sort((x, y) => x.created_at.localeCompare(y.created_at));
    let setAt = t(b.created_at);
    // Start changes (moved, or resized with a new start) resolve the previous slot.
    for (const r of revs) {
      if (!r.previous_starts_at || !r.new_starts_at || r.previous_starts_at === r.new_starts_at) continue;
      if (r.change_type !== "moved" && r.change_type !== "resized") continue;
      const prev = t(r.previous_starts_at);
      if (setAt <= prev - lead) {
        out.push({
          blockId: b.id,
          taskId: b.task_id,
          kind: "move",
          slotStart: r.previous_starts_at,
          resolvedAt: r.created_at,
          score: t(r.created_at) <= prev - lead ? 0.85 : 0.5,
        });
      }
      setAt = t(r.created_at);
    }
    const start = t(b.starts_at);
    if (setAt > start - lead) continue; // final slot not committed

    const closedAt = (status: string) =>
      status === "cancelled"
        ? (revs.find((r) => r.change_type === "cancelled")?.created_at ?? b.updated_at)
        : b.updated_at;
    if (b.status === "skipped" || b.status === "cancelled") {
      const at = closedAt(b.status);
      out.push({ blockId: b.id, taskId: b.task_id, kind: "final", slotStart: b.starts_at, resolvedAt: at, score: t(at) <= start - lead ? 0.85 : 0 });
      continue;
    }
    const first = input.sessions
      .filter(
        (s) =>
          s.schedule_block_id === b.id ||
          (s.task_id === b.task_id && t(s.started_at) >= start - 30 * MIN && t(s.started_at) < t(b.ends_at)),
      )
      .sort((x, y) => x.started_at.localeCompare(y.started_at))[0];
    if (first) {
      const late = t(first.started_at) - start;
      const score = late <= 0 ? 1 : late <= 15 * MIN ? 0.9 : late <= 30 * MIN ? 0.75 : 0.5;
      out.push({ blockId: b.id, taskId: b.task_id, kind: "final", slotStart: b.starts_at, resolvedAt: first.started_at, score });
    } else if (b.status === "completed") {
      out.push({ blockId: b.id, taskId: b.task_id, kind: "final", slotStart: b.starts_at, resolvedAt: b.ends_at, score: 1 });
    } else if (t(b.ends_at) <= now) {
      out.push({ blockId: b.id, taskId: b.task_id, kind: "final", slotStart: b.starts_at, resolvedAt: b.ends_at, score: 0 });
    }
  }
  return out;
}

function threeHourWindow(entries: { at: string; value: number }[], tz: string, pick: "mean" | "count") {
  const buckets = new Map<number, number[]>();
  for (const e of entries) {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }).format(new Date(e.at))) % 24;
    const w = Math.floor(hour / 3);
    buckets.set(w, [...(buckets.get(w) ?? []), e.value]);
  }
  let best: { w: number; score: number } | null = null;
  for (const [w, vs] of buckets) {
    if (vs.length < 3) continue;
    const score = pick === "mean" ? mean(vs)! : vs.length;
    if (!best || score > best.score) best = { w, score };
  }
  if (!best) return null;
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return { start: pad(best.w * 3), end: pad(best.w * 3 + 3) };
}

export function computeStats(input: StatInput): Stats {
  const tz = input.timezone;
  const now = t(input.now);
  const today = toLocalDate(input.now, tz);
  const since28 = addLocalDays(today, -28, tz);
  const since42 = addLocalDays(today, -42, tz);
  const since28Ms = t(localDayRange(since28, tz).start);
  const since42Ms = t(localDayRange(since42, tz).start);
  const min = input.settings.min_meaningful_minutes;
  const planned = input.settings.planned_work_days;

  // Calibration
  const calSamples: { type: string | null; score: number; ratio: number }[] = [];
  for (const c of input.calibration) {
    if (t(c.completed_at) < since28Ms || !(c.actualMinutes > 0)) continue;
    const before = c.firstSessionStart ? t(c.firstSessionStart) : Infinity;
    const P0 = c.planBlocks
      .filter((b) => b.status !== "cancelled" && t(b.created_at) < before)
      .reduce((sum, b) => sum + (t(b.ends_at) - t(b.starts_at)) / MIN, 0);
    const P = P0 > 0 ? P0 : (c.estimate ?? 0);
    if (!(P > 0)) continue;
    calSamples.push({ type: c.task_type, score: calibrationScore(P, c.actualMinutes), ratio: c.actualMinutes / P - 1 });
  }
  const bias = median(calSamples.map((s) => s.ratio));
  const typicalError = median(calSamples.map((s) => Math.abs(s.ratio)));
  const calOk = calSamples.length >= STAT_MIN.calibration;
  const byType: Stats["calibration"]["byType"] = {};
  for (const type of TASK_TYPES) {
    const xs = calSamples.filter((s) => s.type === type);
    if (xs.length === 0) continue;
    const st = stat(xs.map((s) => s.score), STAT_MIN.calibrationByType);
    const b = median(xs.map((s) => s.ratio));
    byType[type as TaskType] = { ...st, bias: st.value !== null && b !== null ? round2(b) : null };
  }

  // Reliability
  const all = commitments(input);
  const recent = all.filter((c) => t(c.resolvedAt) >= since28Ms && t(c.resolvedAt) <= now);
  const reliability = stat(recent.map((c) => c.score * 100), STAT_MIN.reliability);

  // Consistency
  const first = input.firstActivityDate && input.firstActivityDate > since42 ? input.firstActivityDate : since42;
  const days = workDays(first, today, planned, tz);
  const success = days.filter((d) => focusedOnDay(input.sessions, d, tz, now) >= min);
  const consistency = {
    ...stat(days.map((d) => (success.includes(d) ? 100 : 0)), STAT_MIN.consistency),
    successDays: success.length,
    workDays: days.length,
  };

  // Recovery
  const taskStatus = new Map(input.tasks.map((x) => [x.id, x.status]));
  const recoveryScores: number[] = [];
  for (const c of all) {
    if (c.kind !== "final" || c.score !== 0) continue;
    const block = input.blocks.find((b) => b.id === c.blockId)!;
    const endMs = t(block.ends_at);
    if (endMs < since42Ms) continue;
    const eventDay = toLocalDate(block.ends_at, tz);
    const deadline = addLocalDays(eventDay, 14, tz);
    const own = input.sessions.filter((s) => s.task_id === c.taskId);
    let recovered: string | null = null;
    for (let d = eventDay; d <= deadline && d <= today; d = addLocalDays(d, 1, tz)) {
      if (focusedOnDay(own, d, tz, now, d === eventDay ? endMs : undefined) >= min) {
        recovered = d;
        break;
      }
    }
    if (recovered) {
      const between = workDays(addLocalDays(eventDay, 1, tz), addLocalDays(recovered, 1, tz), planned, tz).length;
      recoveryScores.push(between <= 1 ? 100 : between === 2 ? 75 : between === 3 ? 50 : 25);
    } else if (taskStatus.get(c.taskId) === "cancelled" || deadline < today) {
      recoveryScores.push(0);
    }
    // otherwise: young and unresolved → excluded
  }
  const recovery = stat(recoveryScores, STAT_MIN.recovery);

  // Patterns (last 28 days)
  const finished = input.sessions.filter((s) => s.ended_at && t(s.ended_at) >= since28Ms);
  const sessionMinutes = finished
    .map((s) => focusedMinutesInWindow(s, s.pauses, t(s.started_at), t(s.ended_at!), now))
    .filter((m) => m >= 1);
  const elapsed = finished.reduce((a, s) => a + (t(s.ended_at!) - t(s.started_at)) / MIN, 0);
  const focusedTotal = finished.reduce((a, s) => a + focusedMinutesInWindow(s, s.pauses, t(s.started_at), t(s.ended_at!), now), 0);
  const scores = finished.map((s) => s.focus_score).filter((x): x is number => x !== null);
  const capacityDays = workDays(since28, today, planned, tz)
    .map((d) => focusedOnDay(input.sessions, d, tz, now))
    .filter((m) => m >= min);
  const moves = input.revisions.filter(
    (r) =>
      r.previous_starts_at &&
      r.new_starts_at &&
      r.previous_starts_at !== r.new_starts_at &&
      t(r.created_at) >= since28Ms,
  );

  // Practice domains (recent from sessions, total from input), rolled up to parents.
  const domainOf = new Map(input.tasks.map((x) => [x.id, x.practice_domain_id]));
  const recentBy = new Map<string, number>();
  for (const s of finished) {
    const d = domainOf.get(s.task_id);
    if (!d) continue;
    recentBy.set(d, (recentBy.get(d) ?? 0) + focusedMinutesInWindow(s, s.pauses, t(s.started_at), t(s.ended_at!), now));
  }
  const parentOf = new Map(input.domains.map((d) => [d.id, d.parent_id]));
  const rollUp = (own: Map<string, number>) => {
    const out = new Map<string, number>();
    for (const [id, m] of own) {
      for (let cur: string | null | undefined = id, g = 0; cur && g < 20; cur = parentOf.get(cur), g++) {
        out.set(cur, (out.get(cur) ?? 0) + m);
      }
    }
    return out;
  };
  const recentRolled = rollUp(recentBy);
  const totalRolled = rollUp(new Map(Object.entries(input.domainTotals)));

  return {
    version: STATS_VERSION,
    calibration: {
      ...stat(calSamples.map((s) => s.score), STAT_MIN.calibration),
      bias: calOk && bias !== null ? round2(bias) : null,
      typicalError: calOk && typicalError !== null ? round2(typicalError) : null,
      byType,
    },
    reliability,
    consistency,
    recovery,
    patterns: {
      medianSessionMinutes: sessionMinutes.length ? Math.round(median(sessionMinutes)!) : null,
      pauseRatio: elapsed > 0 ? round2(1 - focusedTotal / elapsed) : null,
      averageFocus: scores.length ? Math.round(mean(scores)! * 10) / 10 : null,
      dailyCapacityMinutes: capacityDays.length ? Math.round(median(capacityDays)!) : null,
      reliableWindow: threeHourWindow(recent.map((c) => ({ at: c.slotStart, value: c.score })), tz, "mean"),
      rescheduleWindow: threeHourWindow(moves.map((r) => ({ at: r.previous_starts_at!, value: 1 })), tz, "count"),
    },
    domains: input.domains
      .map((d) => ({
        id: d.id,
        name: d.name,
        parentId: d.parent_id,
        recentMinutes: Math.round(recentRolled.get(d.id) ?? 0),
        totalMinutes: Math.round(totalRolled.get(d.id) ?? 0),
      }))
      .filter((d) => d.recentMinutes > 0 || d.totalMinutes > 0)
      .sort((a, b) => b.recentMinutes - a.recentMinutes || b.totalMinutes - a.totalMinutes),
  };
}
```
Adjust expectations only when a test disagrees with the **spec**. If the code is wrong, fix the code
(systematic-debugging). Numeric checks worth confirming before running:
- Calibration 66/60: the ratio is 0.1, so bias and error are 0.10 and the score is 91.
- Consistency window: Oct 19 → Oct 30 (today excluded) gives the work days 19–23 and 26–29, i.e. 9.
- `firstActivityDate` Oct 1 → Oct 30 gives 21 work days in Oct 1–29.
- Recovery "e": the block ended 11:00 on Oct 2 and work ran 14:00–15:00 the same day → 100.
- Recovery "d": missed on Mon Oct 5, work on Tue Oct 13 → work days in (Oct 5, Oct 13] = 6/7/8/9/12/13 = 6 → 25.

The fixture for "old" in the abandoned test: the missed block on Oct 5 has no session; its deadline (Oct 19) is
< today (Oct 30) → 0 and counted. "young" (Oct 26) has deadline Nov 9 > today → excluded.

- [ ] **Step 5: Run to verify it passes**; also `npx tsc --noEmit`.
- [ ] **Step 6: Commit**

```bash
git add src/features/analytics/domain/stats.types.ts src/features/analytics/utils/stats.ts tests/unit/stats.test.ts
git commit -m "D2-2: pure stat engine (calibration, reliability, consistency, recovery, patterns)"
```

---

### Task 3: Loader, snapshots, job, work-standard settings

**Files:**
- Create:
  - `src/features/analytics/queries/stat-input.queries.ts`
  - `src/features/analytics/queries/snapshots.queries.ts`
  - `src/features/analytics/services/snapshot.service.ts`
  - `src/features/analytics/schemas/work-standards.schema.ts`
  - `src/features/analytics/services/work-standards.service.ts`
  - `src/features/analytics/actions/work-standards.actions.ts`
  - `tests/unit/work-standards.test.ts`
- Modify:
  - `src/features/scheduler/domain/task.types.ts`
  - `src/features/scheduler/queries/schedule.queries.ts`
  - `src/features/jobs/services/job-runner.ts`
  - `src/features/jobs/services/jobs.ts`

**Interfaces:**
```ts
export async function loadStatInput(supabase: SupabaseServerClient, userId: string, now: Date): Promise<StatInput>;
export async function listSnapshots(supabase: SupabaseServerClient, userId: string, sinceDate: string): Promise<SnapshotRow[]>;
export type SnapshotRow = { computed_on: string; stat_type: StatType; scope: string; value: number | null; formula_version: string };
export async function writeDailySnapshot(ctx: ActionContext, now: Date): Promise<number>; // rows upserted
export const workStandardsSchema: z.ZodObject<{ plannedWorkDays: number[] (1–7 unique ints 0–6), minMeaningfulMinutes: 5–480, commitLeadMinutes: 0–1440 }>;
export async function updateWorkStandardsAction(input: unknown): Promise<ActionResult<void>>;
```

- [ ] **Step 1: Failing schema test** `tests/unit/work-standards.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { workStandardsSchema } from "@/features/analytics/schemas/work-standards.schema";

describe("workStandardsSchema", () => {
  it("accepts a valid set and de-duplicates days", () => {
    expect(workStandardsSchema.parse({ plannedWorkDays: [1, 1, 2], minMeaningfulMinutes: 30, commitLeadMinutes: 120 }).plannedWorkDays).toEqual([1, 2]);
  });
  it("rejects no days, day 7 and out-of-range minutes", () => {
    expect(workStandardsSchema.safeParse({ plannedWorkDays: [], minMeaningfulMinutes: 30, commitLeadMinutes: 120 }).success).toBe(false);
    expect(workStandardsSchema.safeParse({ plannedWorkDays: [7], minMeaningfulMinutes: 30, commitLeadMinutes: 120 }).success).toBe(false);
    expect(workStandardsSchema.safeParse({ plannedWorkDays: [1], minMeaningfulMinutes: 2, commitLeadMinutes: 120 }).success).toBe(false);
    expect(workStandardsSchema.safeParse({ plannedWorkDays: [1], minMeaningfulMinutes: 30, commitLeadMinutes: 2000 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then implement:

```ts
import { z } from "zod";

export const workStandardsSchema = z.object({
  plannedWorkDays: z
    .array(z.coerce.number().int().min(0).max(6))
    .transform((d) => [...new Set(d)].sort((a, b) => a - b))
    .refine((d) => d.length >= 1, "근무 요일을 하나 이상 골라 주세요."),
  minMeaningfulMinutes: z.coerce.number().int().min(5).max(480),
  commitLeadMinutes: z.coerce.number().int().min(0).max(1440),
});
export type WorkStandardsInput = z.infer<typeof workStandardsSchema>;
```
Service: `update scheduler_settings set planned_work_days, min_meaningful_minutes, commit_lead_minutes where
user_id`. The action uses `runAction` + `revalidatePath("/scheduler", "layout")`.

- [ ] **Step 3: Settings in context**

Add `"planned_work_days" | "min_meaningful_minutes" | "commit_lead_minutes"` to the `SchedulerSettings` Pick, and
append them to the settings select literal in `getSchedulerContext` and in `job-runner.ts` `loadJobUsers`.

- [ ] **Step 4: `loadStatInput`**

- Every query uses `.eq("user_id", userId)`.
- The window start is `localDayRange(addLocalDays(today, -42, tz), tz).start`. The blocks' window is widened by 14
  days, because Recovery events are within 42 days and their recovery can take up to 14 more.

```ts
const [ctx, blocks, sessions, completed, tasks, domains, firstTask] = await Promise.all([
  getSchedulerContext(supabase, userId),
  supabase.from("schedule_blocks").select("id, task_id, starts_at, ends_at, status, created_at, updated_at")
    .eq("user_id", userId).gte("ends_at", windowStart).limit(5000),
  supabase.from("work_sessions").select("id, task_id, schedule_block_id, started_at, ended_at, pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at), work_log:work_logs!work_logs_session_id_user_id_fkey(focus_score)")
    .eq("user_id", userId).or(`ended_at.gte.${windowStart},ended_at.is.null`).limit(5000),
  supabase.from("task_plan_actual").select("task_id, task_type:template_id, user_estimated_minutes, completed_at, actual_minutes") … // see note
  supabase.from("tasks").select("id, status, task_type, practice_domain_id, created_at").eq("user_id", userId).limit(5000),
  supabase.from("practice_domains").select("id, name, parent_id").eq("user_id", userId),
  supabase.from("tasks").select("created_at").eq("user_id", userId).order("created_at").limit(1).maybeSingle(),
]);
```
Completed tasks for Calibration (a separate sequence after the first batch):
1. `tasks` where `status = completed` and `completed_at ≥ since28`: `id, task_type, user_estimated_minutes, completed_at`.
2. For those ids:
   - `task_plan_actual` `task_id, actual_minutes`
   - `work_sessions` `task_id, started_at`, ordered ascending, to get the first start per task
   - `schedule_blocks` `task_id, starts_at, ends_at, status, created_at` (any date)
3. Build `calibration[]`.

Revisions: `schedule_block_revisions` `schedule_block_id as block_id, change_type, previous_starts_at,
new_starts_at, created_at` for the loaded block ids, chunked into `.in()` batches of 200.

Domain totals (all time): `tasks` with `practice_domain_id` not null (`id, practice_domain_id`), then
`task_plan_actual` `task_id, actual_minutes` for those ids (chunked). Sum per domain.

Map sessions to `{ ..., pauses: s.pauses ?? [], focus_score: log?.focus_score ?? null }`, where `log` is normalized
from an array or an object as in `session.queries.ts`.

- [ ] **Step 5: Snapshots**

`listSnapshots`: `stat_snapshots` `computed_on, stat_type, scope, value, formula_version` where
`computed_on ≥ sinceDate` and `.eq("user_id", userId)`, ordered by `computed_on`.

`writeDailySnapshot(ctx, now)`:
```ts
const input = await loadStatInput(ctx.supabase, ctx.user.id, now);
const s = computeStats(input);
const day = toLocalDate(input.now, input.timezone);
const w28 = addLocalDays(day, -28, input.timezone);
const w42 = addLocalDays(day, -42, input.timezone);
const row = (stat_type: StatType, v: StatValue, window_start: string, extra: { bias?: number | null; typical_error?: number | null; scope?: string } = {}) => ({
  user_id: ctx.user.id, computed_on: day, stat_type, scope: extra.scope ?? "overall",
  value: v.value, bias: extra.bias ?? null, typical_error: extra.typical_error ?? null,
  sample_count: v.sampleCount, window_start, window_end: day, formula_version: s.version,
});
const rows = [
  row("calibration", s.calibration, w28, { bias: s.calibration.bias, typical_error: s.calibration.typicalError }),
  row("reliability", s.reliability, w28),
  row("consistency", s.consistency, w42),
  row("recovery", s.recovery, w42),
  ...Object.entries(s.calibration.byType)
    .filter(([, v]) => v!.value !== null)
    .map(([type, v]) => row("calibration", v!, w28, { scope: type, bias: v!.bias })),
];
const { error } = await ctx.supabase.from("stat_snapshots").upsert(rows, { onConflict: "user_id,computed_on,stat_type,scope" });
if (error) throw fromDbError(error);
return rows.length;
```

- [ ] **Step 6: Job**

In `runDurationProfileRefresh`, after `rebuildDurationGroups`, add
`const snapshots = await writeDailySnapshot(ctx, now);` and put it into `detail`.

- [ ] **Step 7: Verify and commit**

Run `npx tsc --noEmit && npx eslint . && npx vitest run`. Then check the loader against the real DB with a one-off
node script, or through the progress page in Task 4. The page will exercise it.
```bash
git add <explicit paths>
git commit -m "D2-3: stat input loader, daily snapshots in the nightly job, work-standard settings"
```

---

### Task 4: Progress page, components, nav, work-standards dialog

**Files:**
- Create:
  - `src/app/(private)/scheduler/progress/page.tsx`
  - `src/features/analytics/components/stat-card.tsx` (contains `StatCard` and `Sparkline`)
  - `pattern-list.tsx`, `domain-bars.tsx`, `work-standards-dialog.tsx` (same folder)
- Modify: `src/components/layout/private-nav.tsx`, `src/features/scheduler/components/scheduler-settings-menu.tsx`,
  `scheduler-workspace.tsx`

**Page** (server component):
```tsx
export const metadata: Metadata = { title: "진행", robots: { index: false } };
export default async function ProgressPage() {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const now = new Date();
  const input = await loadStatInput(supabase, user.id, now);
  const stats = computeStats(input);
  const today = toLocalDate(now, input.timezone);
  const snapshots = await listSnapshots(supabase, user.id, addLocalDays(today, -56, input.timezone));
  const series = (type: StatType) => snapshots.filter((r) => r.stat_type === type && r.scope === "overall");
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">진행</h1>
        <WorkStandardsDialog settings={input.settings} />
      </header>
      <section aria-labelledby="stats-heading" className="space-y-3">
        <h2 id="stats-heading" className="text-lg font-semibold">행동 지표</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard type="calibration" stat={stats.calibration} detail={biasText(stats.calibration.bias, stats.calibration.typicalError)} series={series("calibration")} />
          <StatCard type="reliability" stat={stats.reliability} detail={`약속 블록 ${stats.reliability.sampleCount}개`} series={series("reliability")} />
          <StatCard type="consistency" stat={stats.consistency} detail={`근무일 ${stats.consistency.successDays}/${stats.consistency.workDays}일`} series={series("consistency")} />
          <StatCard type="recovery" stat={stats.recovery} detail={`회복 사건 ${stats.recovery.sampleCount}건`} series={series("recovery")} />
        </div>
        <CalibrationByType byType={stats.calibration.byType} />
      </section>
      <PatternList patterns={stats.patterns} calibrationBias={stats.calibration.bias} />
      <DomainBars domains={stats.domains} />
    </div>
  );
}
```
`biasText(bias, err)`:
- `null` → "편향 계산 전".
- `|bias| ≤ 0.05` → "±5% 이내".
- `> 0` → "보통 N% 더 걸려요".
- `< 0` → "보통 N% 덜 걸려요".
- If `err` is present, append " · 오차 ±M%".

`CalibrationByType` can live in `stat-card.tsx`. It renders a `table` with `caption` "유형별 예상 정확도", rows
only for types whose value ≠ null, and columns 유형 / 점수 / 편향 / 표본.

`StatCard({ type, stat, detail, series })`:
- An `article` with `aria-labelledby`.
- Name and meaning from `STAT_LABEL`.
- The value, or "데이터 수집 중 · {sampleCount}/{need}".
- `detail`.
- `<Sparkline points={series} />`.

`Sparkline({ points })`:
- An SVG 120×32 with segments split where `formula_version` or a null value breaks the line.
- `role="img"` with `aria-label` "최근 추이: 첫 값 A → 마지막 값 B" (or "추이 데이터가 아직 없습니다").
- Render nothing when there are fewer than 2 non-null points, apart from the text.

`PatternList`: a `dl` with 보통 세션, 쉼 비율, 스스로 매긴 집중도, 하루 작업량, 계획 편향, 잘 지켜지는 시간대,
자주 미뤄지는 시간대. Missing values show "—" plus a reason (for example "완료한 세션이 없습니다").

`DomainBars`:
- Heading "연습 영역". Up to 8 rows, each with the name (indented if it has a parent), a bar
  (`width = recent / maxRecent`), and "최근 4주 {formatMinutes} · 전체 {formatMinutes}".
- Empty state: "할 일에 영역(@영역)을 붙이면 영역별 연습 시간이 쌓입니다."

`WorkStandardsDialog({ settings })`:
- A trigger button "작업 기준" and a `Dialog` titled "작업 기준".
- Content:
  - A `fieldset` "근무 요일" with 7 checkboxes (일–토, value 0–6).
  - "의미 있게 일한 날의 최소 작업 시간(분)" (min 5, max 480).
  - "약속 블록 기준: 시작 몇 분 전까지 잡힌 일정(분)" (0–1440).
  - A one-line explanation under each field.
- Submit calls `updateWorkStandardsAction` with success "저장했습니다." and closes. The page re-renders through
  revalidation.
- Workspace: the ⚙ menu adds the item "작업 기준". The simplest way is to render `WorkStandardsDialog` in the
  workspace with an `open`/`onOpenChange` control, and give the menu an `onOpenWorkStandards` prop. Support both an
  uncontrolled trigger (progress page) and controlled use (workspace).

Nav: add `{ href: "/scheduler/progress", label: "진행", icon: BarChart3, exact: false }` after 주간 리뷰
(import `BarChart3` from lucide).

- [ ] Implement, then verify with `tsc`, `eslint` and `vitest`, and take a screenshot of the page at 1400 and 390 px.
- [ ] Commit `D2-4: progress page (stats, trends, patterns, practice domains) and work standards`.

---

### Task 5: E2E, docs, final verification

**Files:** `tests/e2e/progress.spec.ts`, `docs/decisions/0014-stat-engine.md`, `docs/decisions/README.md`, `docs/schema.md`, `docs/progress.md`

- [ ] **E2E**

```ts
import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

test.describe("progress", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("stat cards, patterns, practice domain, work standards persist", async ({ page }) => {
    const db = await dbAsUser();
    const { data: me } = await db.auth.getUser();
    const uid = me.user!.id;
    const stamp = Date.now();
    const domain = `E2E도메인${stamp}`;
    const { data: d } = await db.from("practice_domains").insert({ user_id: uid, name: domain }).select("id").single();
    const { data: task } = await db
      .from("tasks")
      .insert({ user_id: uid, title: `${E2E_PREFIX} 영역 작업 ${stamp}`, practice_domain_id: d!.id })
      .select("id")
      .single();
    const start = Date.now() - 3 * 86_400_000;
    await db.from("work_sessions").insert({
      user_id: uid, task_id: task!.id, source: "manual",
      started_at: new Date(start).toISOString(), ended_at: new Date(start + 45 * 60_000).toISOString(),
    });
    const { data: before } = await db
      .from("scheduler_settings")
      .select("planned_work_days, min_meaningful_minutes, commit_lead_minutes")
      .single();

    try {
      await login(page);
      await page.getByRole("link", { name: "진행" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "진행" })).toBeVisible();
      for (const name of ["예상 정확도", "계획 이행", "꾸준함", "회복력"]) {
        await expect(page.getByRole("article", { name })).toBeVisible();
      }
      await expect(page.getByRole("heading", { name: "나의 패턴" })).toBeVisible();
      const domains = page.getByRole("region", { name: "연습 영역" });
      await expect(domains).toContainText(domain);
      await expect(domains).toContainText("45m");

      await page.getByRole("button", { name: "작업 기준" }).click();
      const dialog = page.getByRole("dialog", { name: "작업 기준" });
      await dialog.getByLabel("토").check();
      await dialog.getByLabel(/최소 작업 시간/).fill("45");
      await dialog.getByRole("button", { name: "저장" }).click();
      await expect
        .poll(async () => (await db.from("scheduler_settings").select("min_meaningful_minutes, planned_work_days").single()).data)
        .toMatchObject({ min_meaningful_minutes: 45 });
      const { data: after } = await db.from("scheduler_settings").select("planned_work_days").single();
      expect(after!.planned_work_days).toContain(6);
    } finally {
      await db.from("scheduler_settings").update(before!).eq("user_id", uid);
    }
  });
});
```
The domain cleanup relies on the `E2E` prefix (the helper deletes `E2E%` domains). The Korean domain name must start
with `E2E`, as above.

- [ ] **Docs**
- ADR 0014 records:
  - Live stats plus nightly snapshots written by the existing `duration_profile_refresh` job (no new cron).
  - Commitment rules: start changes via moved or resized; skip/cancel timing; completed-without-session = 1.0.
  - Recovery events and exclusion.
  - Snapshots are service-role-only writes.
- Add the README row.
- `schema.md`: work-standard settings, `stat_snapshots`, and the stat definitions `stats-v1` table.
- `progress.md`: a D2 checklist.

- [ ] **Full verification**

Run `tsc`, `eslint`, `vitest`, `build`, and all E2E (11 specs). Also run the SQL `stat_engine.sql` PASS and check
the DB is clean.

- [ ] **Commit and push**: `D2-5: progress E2E; ADR 0014, docs`.
