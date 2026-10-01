# Strategy review (G4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `diagnosis-v1` per active mission (suspected layer + evidence), SYSTEM QUESTION with navigate-only choices
on the progress page, and an optional AI `directionNote` in the weekly analysis.

**Spec:** `docs/superpowers/specs/2026-10-01-strategy-review-g4-design.md`

## Global Constraints
- Pure diagnosis; thresholds as named constants; every sentence from `status-text.ts` (deny-list test).
- Choices only navigate or hide (localStorage, try/catch). No DB writes, no automatic changes.
- AI input carries numbers only (no titles); the F2 evidence check applies to `directionNote`.
- No migration.

## Review Focus
1. Several layers fire → the lowest (closest to execution) is suspected. Test: Task 1.
2. < 5 mission sessions → no signals/suspected, collecting n/5. Test: Task 1.
3. A `directionNote` with a number not in the input is dropped; the rest of the analysis survives. Test: Task 3.

### Task 1: Pure diagnosis + texts
**Files:** create `src/features/direction/domain/diagnosis.ts`, `tests/unit/direction-diagnosis.test.ts`; modify
`src/features/direction/domain/status-text.ts`, `tests/unit/direction-status.test.ts` (deny-list over diagnosis texts).
- [ ] Tests first (spec §4), RED, implement, GREEN, tsc. Commit `G4: pure diagnosis-v1 and SYSTEM QUESTION texts`.

### Task 2: Loader + UI
**Files:** modify `src/features/direction/queries/status.queries.ts`, `src/features/direction/components/direction-status.tsx`,
`src/app/(private)/scheduler/progress/page.tsx`; create `src/features/direction/components/diagnosis-question.tsx`.
- [ ] Loader: 28-day mission blocks, work logs, protocols, pre-window completions; `MissionStatusView.diagnosis`.
  Validate new selects with the PostgREST relationship check (42501 vs PGRST2xx).
- [ ] UI: `DiagnosisQuestion` client leaf (observation, question, primary `Link`, [유지]); collecting text.
- [ ] Page passes `{ recovery: stats.recovery.value }`.
- [ ] tsc, eslint, vitest, build; G3 E2E. Commit `G4: diagnosis on mission cards`.

### Task 3: F2 analysis extension
**Files:** modify `src/features/ai/utils/analysis.ts`, `src/features/ai/schemas/analysis.schema.ts`,
`src/features/ai/prompts/analysis.prompt.ts`, `src/features/ai/services/analysis.service.ts`,
`src/features/ai/components/system-analysis-card.tsx`, `tests/unit/analysis.test.ts`.
- [ ] Tests: `analysisInput({..., direction})` includes it; `checkEvidence` keeps/drops `directionNote`. RED.
- [ ] `AnalysisContent.directionNote?: string | null`; schema `directionNote: z.string().trim().max(200).nullable().default(null)`;
  prompt `analysis-v2` + instruction; service loads the diagnosis (via `loadDirectionStatus`) and passes
  `direction` numbers; card renders the note. GREEN; full unit suite. Commit `G4: diagnosis in the weekly analysis (analysis-v2)`.

### Task 4: Docs + verification
- [ ] ADR 0023, schema `diagnosis-v1`, progress "Improvement G4", architecture line.
- [ ] tsc, eslint, vitest, build, full E2E (idle machine), advisors (no DDL → skip, ledger it). Commit `G4: ADR 0023, docs`.
