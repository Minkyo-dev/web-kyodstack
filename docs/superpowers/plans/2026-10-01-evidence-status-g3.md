# Evidence & status (G3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Deterministic mission progress, pace, alignment, weekly completion, habit consistency and identity evidence
on the progress page.

**Architecture:** Pure `features/direction/domain/status.ts` (+ `status-text.ts` sentence dictionary), one loader
`queries/status.queries.ts`, one server component `components/direction-status.tsx` rendered by the progress page.
No migration.

**Spec:** `docs/superpowers/specs/2026-10-01-evidence-status-g3-design.md`

## Global Constraints
- Local days/weeks in `profiles.timezone` (use `scheduler/utils/timezone` helpers); never slice UTC strings.
- Focused minutes via `focusStats` (pauses excluded); sessions belong to the local day they ended.
- Ratios shown as text with the bar; alignment as hours, ratio only in a tooltip; hidden below 180 active minutes.
- Every sentence comes from `status-text.ts`; deny-list test.
- `direction` must not import `scheduler`/`projects` services (utils and components are fine).

## Review Focus
1. Numeric criterion with current > target counts as 1, not > 1. Test: Task 1.
2. A session on a task linked to a protocol of a retired path is aligned but off-path. Test: Task 1.
3. A habit created on Wednesday is not "scheduled" on Monday/Tuesday of that week. Test: Task 1.
4. Mission with neither criteria nor projects shows time, not 0%. Test: Task 1.

---

### Task 1: Pure status functions and sentences

**Files:** Create `src/features/direction/domain/status.ts`, `src/features/direction/domain/status-text.ts`,
`tests/unit/direction-status.test.ts`.

**Interfaces (produces):**
```ts
export const MISSION_PROGRESS_VERSION = "mission-progress-v1";
export const ALIGNMENT_VERSION = "alignment-v1";
export const IDENTITY_EVIDENCE_VERSION = "identity-evidence-v1";
export type CriterionInput = { kind: "check" | "numeric"; met_at: string | null; current_value: number | null; target_value: number | null };
export type MissionProgress = { kind: "criteria" | "projects" | "time"; ratio: number | null; basis: { done: number; total: number } | null; focusMinutes: number };
export function missionProgress(i: { criteria: CriterionInput[]; projectTasks: { status: string }[]; focusMinutes: number }): MissionProgress;
export function paceGap(i: { createdDate: string; deadline: string | null; today: string; ratio: number | null }): number | null;
export type AlignedSession = { focusedMinutes: number; missionId: string | null; protocolId: string | null; pathActive: boolean | null };
export function alignment(sessions: AlignedSession[]): { activeMinutes: number; alignedMinutes: number; onPathMinutes: number; offPathMinutes: number };
export type HabitInput = { id: string; weekdays: number[]; createdDate: string; missionId: string | null };
export function scheduledDays(h: HabitInput, from: string, to: string): string[]; // local dates, inclusive
export function habitConsistency(habits: HabitInput[], checks: { habitId: string; date: string }[], from: string, to: string): { done: number; scheduled: number };
export function identityEvidence(i: { name: string; sessions: number; done: number; scheduled: number }): { sessions: number; done: number; scheduled: number; sentence: string | null };
```
`status-text.ts` exports `STATUS_TEXT` (all sentences, functions of names/numbers) and `DENY_LIST`.

- [ ] Step 1: tests (cases from the spec §4 and Review Focus), run → FAIL (module missing).
- [ ] Step 2: implement. Date iteration with a pure `nextDate(yyyy-mm-dd)` (calendar math, as `isoWeekday`).
  `paceGap`: elapsed = clamp((today − created) / (deadline − created), 0, 1); deadline ≤ created → elapsed 1;
  ratio null → null.
- [ ] Step 3: run → PASS; tsc. Commit `G3: pure mission progress, pace, alignment, habit consistency, identity evidence`.

### Task 2: Loader

**Files:** Create `src/features/direction/queries/status.queries.ts`.

**Interfaces (produces):**
```ts
export type MissionStatusView = { id: string; title: string; deadline: string | null; progress: MissionProgress; pace: number | null; path: { title: string; approach: string } | null };
export type DirectionStatus = {
  today: string;
  missions: MissionStatusView[];          // active, deadline nulls last, max 3
  week: { activeMinutes: number; alignedMinutes: number; offPathMinutes: number; tasksDone: number; tasksTotal: number; habitsDone: number; habitsScheduled: number };
  identities: { id: string; name: string; sessions: number; done: number; scheduled: number; sentence: string | null }[];
};
export async function loadDirectionStatus(supabase: SupabaseServerClient, userId: string, now: Date): Promise<DirectionStatus>;
```
- [ ] Step 1: implement: timezone via `getSchedulerContext` (scheduler *queries* are allowed); week start = Monday
  of the local week (`isoWeekday`); 28-day window. Sessions select: `started_at, ended_at, pauses,
  task:tasks!work_sessions_task_id_user_id_fkey(mission_id, protocol_id, protocol:protocols!tasks_protocol_id_mission_id_fkey(path:paths!protocols_path_id_mission_id_fkey(status)), project:projects!tasks_project_id_user_id_fkey(mission_id))`,
  `ended_at` in [28 days ago start, now). Mission focus minutes = Σ over the 28-day sessions? No — over all time:
  a second light select of sessions joined the same way filtered client-side is too heavy; use the 28-day window
  and label it `최근 28일 집중` (ruling recorded in ADR 0022). Blocks this week: `schedule_blocks` with
  `task:tasks(status)` status ≠ cancelled, distinct task ids.
- [ ] Step 2: `npx tsc --noEmit && npx eslint src/features/direction`. Commit `G3: direction status loader`.

### Task 3: UI on the progress page

**Files:** Create `src/features/direction/components/direction-status.tsx`; modify
`src/app/(private)/scheduler/progress/page.tsx`.

Accessible names: region `<terms.mission> 현황` (plain `목표 현황`) containing heading `ACTIVE MISSION`/`목표`; each
mission `article` aria-label = title with `{pct}%` text; region `이번 주`; list `정체성 근거`.
- [ ] Step 1: component (server; receives `status` and `terms`), sections per spec §3.
- [ ] Step 2: page loads `loadDirectionStatus` (try/log; failure hides the section) and renders it after the player
  section.
- [ ] Step 3: tsc, eslint, vitest, build. Commit `G3: direction status on the progress page`.

### Task 4: E2E, docs
- [ ] `tests/e2e/direction-status.spec.ts`: create `[e2e]` mission + two check criteria via DB as the user, mark one
  met (`met_at`), open `/scheduler/progress`, the region shows the mission title and `50%`. G1 cleanup removes it.
- [ ] ADR 0022, schema metric definitions, progress checklist, architecture line.
- [ ] Full verification (tsc, eslint, vitest, build, full E2E). Commit `G3: status E2E, ADR 0022, docs`.
