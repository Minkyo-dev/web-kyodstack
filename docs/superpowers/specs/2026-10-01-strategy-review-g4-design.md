# Strategy review (sub-project G4) — design

- Date: 2026-10-01
- Sources: `docs/improve-requirements-3.md` §24–27, §34 (SYSTEM as advisor); umbrella
  `2026-09-30-direction-layer-architecture.md` decision 7, §4 (diagnosis-v1); ADR 0019 (F2 analysis), 0022 (G3)
- Last part of G. Builds on G3's loader and numbers.

## Goal
When a mission stalls, the SYSTEM checks the layers from the bottom up and names the *suspected* layer with its
evidence, asks that layer's SYSTEM QUESTION, and offers choices that only navigate (nothing changes automatically).
The weekly AI analysis may phrase the diagnosis in one sentence; without AI a template sentence is shown.

Decisions taken for the user (ADR 0023):
1. **`diagnosis-v1`** per active mission over the last 28 local days. Signals (all evidence numbers kept):
   | layer | fires when |
   |---|---|
   | goal | pace gap ≥ 0.25 |
   | strategy | mission habit completion ≥ 0.7 (≥ 5 scheduled days) and progress did not rise over the window (`ratio now − ratio 28 days ago ≤ 0`, needs a ratio) |
   | tactic | median focused minutes of sessions on active-path protocol tasks < 0.6 × that protocol's `intended_minutes` (≥ 3 sessions), or mission habit completion < 0.5 (≥ 5 scheduled days) |
   | planning | ≥ 5 mission blocks in the window and (missed + skipped) / non-cancelled ≥ 0.4 |
   | execution | ≥ 5 mission work logs and confirmed-blocker share ≥ 0.3 |
   | recovery | overall Recovery stat < 50 |
   The **suspected** layer is the lowest firing one (order goal → strategy → tactic → planning → execution →
   recovery; "check the lower layer before blaming the upper one"). Fewer than 5 mission sessions in the window →
   no diagnosis, "데이터 수집 중 n/5".
2. **Progress 28 days ago** (strategy signal): criteria → checks met before the window start count 1, numeric
   criteria count 1 only if `met_at` is before the window (their past partial value is unknown, so 0); projects →
   tasks completed before the window over today's non-cancelled tasks. Deterministic, slightly conservative.
3. **SYSTEM QUESTION + choices** per layer (template dictionary, deny-listed like G3):
   goal "이 결과가 여전히 추구할 가치가 있나요?" → [목표 다시 보기] (directive mission);
   strategy "이 접근 방식이 효과가 있나요?" → [전략 교체하기] (directive mission);
   tactic "이 행동을 지속할 수 있나요?" → [실행 방식 조정하기] (directive mission);
   planning "실제 가용 시간에 맞나요?" → [캘린더 보기] (`/scheduler`);
   execution "무엇이 실행을 막았나요?" → [작업 기록 보기] (`/scheduler`);
   recovery "얼마나 빨리 다시 시작할 수 있나요?" → [오늘 할 일 보기] (`/scheduler`).
   Each also has [유지] which hides that question for that mission until next Monday (per-browser localStorage
   key `kyod.diagnosis.keep.<missionId>.<layer>.<weekStart>`, read in try/catch). Nothing is written to the DB.
4. **Observation sentences** are templates with the evidence numbers, e.g. tactic: "현재 실행 방식은 한 번에 60분을
   전제로 합니다. 최근 실제 세션은 보통 22분입니다. 의지보다 실행 방식의 지속 가능성을 먼저 살펴볼 만합니다."
5. **AI (F2 extension):** `analysisInput` gains `direction: [{ suspected, signals: { layer: numbers } }]` (no titles,
   numbers only), the prompt becomes `analysis-v2` and asks for an optional `directionNote` (≤ 200 chars, Korean,
   neutral, numbers only from the input). The F2 evidence check drops a note citing unknown numbers. The SYSTEM
   ANALYSIS card shows the note when present. Mission cards always show the template observation.

Out of scope: purpose-layer diagnosis (no signal), storing [유지] choices server-side, auto-changes, AI per mission.

## 1. Pure domain (`src/features/direction/domain/diagnosis.ts`)
- `DIAGNOSIS_VERSION = "diagnosis-v1"`, `LAYERS = ["goal","strategy","tactic","planning","execution","recovery"]`.
- `DiagnosisInput = { missionSessions, pace, ratioNow, ratioBefore, habit: {done, scheduled}, protocolSessions:
  { medianMinutes, intendedMinutes, count } | null, blocks: { total, missedOrSkipped }, logs: { total, blockers },
  recovery: number | null }`.
- `diagnose(input) → { collecting: { n: number; need: 5 } | null; signals: Signal[]; suspected: Layer | null }`
  where `Signal = { layer, evidence: Record<string, number> }`.
- `median(values)` helper. Text: `DIAGNOSIS_TEXT` in `status-text.ts` (observation(layer, evidence), question,
  choice label); deny-list test covers them.

## 2. Loader
`loadDirectionStatus(supabase, userId, now, opts?: { recovery?: number | null })` additionally loads, for the 28-day
window: mission blocks (`schedule_blocks` with `task(mission_id, project(mission_id))`, status), mission work logs
(`work_logs` with `task(...)`, `confirmed_blocker`), protocols (`id, intended_minutes, path(status)`), tasks completed
before the window for the mission projects, and computes `diagnosis` per mission view. The progress page passes the
Recovery stat it already computes.

## 3. UI
- Mission card (G3) gains a `SYSTEM QUESTION` block when `suspected` is set and not kept: observation, question,
  primary choice link, [유지] button (client leaf `DiagnosisQuestion`). Collecting state shows "데이터 수집 중 n/5".
- `SystemAnalysisCard` shows `content.directionNote` under the explanations when present.

## 4. Tests
- Unit `tests/unit/direction-diagnosis.test.ts`: the requirement example (60-min protocol, 22-min sessions → tactic);
  lowest layer wins when several fire; collecting below 5 sessions; strategy needs a ratio; planning/execution
  minimum counts; recovery threshold; every template passes the deny-list.
- Unit (F2): `analysisInput` includes the direction block; `checkEvidence` drops a `directionNote` with an unknown
  number and keeps a clean one.
- E2E: not added (a diagnosis needs ≥ 5 sessions over days); the G3 E2E keeps passing (collecting state).

## 5. Docs
ADR 0023; `docs/schema.md` diagnosis-v1 definition; progress checklist "Improvement G4"; architecture line.
