# AI classification proposals and work-log interpretation (sub-project F1) — design

- Date: 2026-09-30
- Sources:
  - `docs/improve-requirements-2.md` §36–43, §45
  - Umbrella `docs/superpowers/specs/2026-09-30-growth-system-architecture.md` §4 (F), §9, §13, §14
  - Existing AI layer (`features/ai`: provider boundary, Zod-validated output, Fake provider, Haiku 4.5 default)
  - D1 (task types, practice domains, tags), D2 (Calibration)
- First part of F. F2 (stat explanations, system assessment, AI quest candidates) follows.

## Goal
Use the LLM only for semantic features: propose a task's type, practice domain, complexity and skills, and interpret
work-log notes (delay reason, blocker). Nothing the AI says changes a task or a stat until the user accepts or
confirms it; stats stay deterministic and versioned.

## Decisions made with the user
1. F is split into **F1** (shared AI foundation, classification proposals, work-log interpretation + blocker weight)
   and **F2** (explanations, assessment, quest candidates).
2. Classification runs as a **nightly batch plus an on-demand button** in the task drawer.

## 1. Shared foundation

### `task_features`
`id, user_id, task_id, feature_type task_type|domain|complexity|skills, feature_value jsonb, source ai|user|system,
status proposed|accepted|rejected, confidence numeric null, model text null, prompt_version text null, created_at,
decided_at`.
- Composite FK `(task_id, user_id)` → `tasks(id, user_id)` on delete cascade.
- Partial unique index: one `proposed` row per `(task_id, feature_type)`.
- Accept as is → `status accepted, source ai`; accept after editing → `status accepted, source user, confidence 1.0`
  (requirements §43); ignore → `rejected`. A task with a rejected proposal of a feature type is not proposed that type
  again.
- RLS: select/insert/update own; no delete (cascade only).

### `ai_calls` (cost ledger and cap)
`id, user_id, kind text, model text null, ok boolean, created_at`.
- **Cap: 30 calls per user per local day**, across all AI features (weekly review, recommendations, classification,
  interpretation). `assertAiBudget(ctx)` counts today's rows (local day) and throws a new `AppError("AI_BUDGET_EXCEEDED")` code
  ("오늘 AI 사용량을 다 썼어요. 내일 다시 시도해 주세요."); `recordAiCall(ctx, kind, model, ok)` appends.
- Existing AI services (weekly review, daily recommendations) adopt the same two calls.
- Prompt and response text are never stored or logged.
- RLS: select/insert own.

### Input sanitizing
`sanitizeForPrompt(text, max)`: strip control characters, collapse whitespace, cap length (titles 200, descriptions
500, notes 1000). Prompts are versioned constants.

## 2. Classification proposals (`classify-v1`)

### Input and output
- Input: up to 20 tasks `{ id, title, description }`, the 12 task types, the user's practice domains
  `{ id, name, parent }`, and the user's tag names (as preferred skill spellings).
- Output (Zod): `{ items: { taskId, taskType?: TaskType, domainId?: uuid, complexity?: 1–5, skills: string[] ≤ 5,
  confidence: 0–1 }[] }`.
- Validator (pure): drops items for unknown task ids, task types outside the 12, domain ids not in the user's list,
  complexity outside 1–5; trims, lowercases and dedupes skills, keeps ≤ 5, each 1–30 chars.

### What becomes a proposal
- `task_type` and `domain`: only when the task's field is empty and no rejected proposal of that type exists.
- `complexity`: only when the proposed value differs from the task's current value (the column always has a value).
- `skills`: only skills not already on the task as tags.
- Each becomes one `task_features` row (`proposed`, `source ai`, the item's confidence, the serving model, the prompt
  version). Existing open proposals of the same type are replaced.

### When
- **Nightly** (existing `duration_profile_refresh` job): up to 20 open tasks (not completed/cancelled) that are missing a
  type or domain and have no open proposal, oldest first; at most one call per user per night.
- **Button** "분류 제안 받기" in the task drawer: that task only, immediately (respects the cap).

### Applying
- Chip row "SYSTEM 제안" in the drawer (and a small `SYSTEM` marker on the task row) e.g.
  `유형 디버깅 · 영역 데이터 엔지니어링 · 복잡도 4 · #airflow #dbt · 신뢰도 88%`, with [적용] [수정] [무시].
- [적용]: the task gets the proposed type/domain/complexity; skills become tags (existing tag by name, else created);
  rows → `accepted, source ai`. Goes through the normal task update service (validation, ownership).
- [수정]: the drawer fields are pre-filled with the proposal; saving marks the touched proposals
  `accepted, source user, confidence 1.0`, untouched ones `rejected`.
- [무시]: all open proposals of the task → `rejected`.
- Complexity is stored as a feature only; it never becomes a stat and does not change duration recommendations in F1
  (§40, §45).

## 3. Work-log interpretation (`worklog-v1`)

### When and input
- After a session stop or a note save, when the work-log note has ≥ 20 characters, run after the response
  (`after()` from `next/server`), within the cap.
- Nightly catch-up: notes ≥ 20 chars from the last 2 local days without an interpretation, at most 5 per user.
- Input: the sanitized note and computed numbers for the task (estimate, actual so far, actual/estimate ratio). The
  model never computes numbers.
- Output (Zod): `{ delayReason: environment_issue|scope_change|underestimate|interruption|unclear_requirements|none,
  scopeChanged: boolean, unexpectedBlocker: boolean, blockerType: technical|external|personal|none,
  confidence: 0–1 }`.

### Storage
`work_logs` gains `ai_interpretation jsonb null`, `interpretation_model text null`, `interpretation_version text null`,
`confirmed_blocker boolean null` (null = not answered).

### Confirmation (§42)
- Asked only when `unexpectedBlocker && blockerType ∈ {technical, external} && confidence ≥ 0.6`: in the task drawer's
  work-log row, "SYSTEM · {reason label}로 늦어진 것 같아요. 외부 방해로 표시할까요?" [표시] [아니요].
- [표시] → `confirmed_blocker = true`; [아니요] → `false`; both can be changed later. Unanswered changes nothing.
- The interpretation line (`SYSTEM 해석 · 환경 문제 · 범위 변경 없음`) is shown under the note regardless.

## 4. Stat effect (`stats-v2`)
- **Calibration** becomes a weighted mean: a completed task with any work log `confirmed_blocker = true` counts with
  weight **0.3**, others 1.0. Sample count still counts tasks; bias and typical error (medians) are unchanged.
  Per-type Calibration uses the same weights.
- `STATS_VERSION = "stats-v2"`; trend lines already break across versions.
- Reliability, Consistency and Recovery are unchanged (deferred, ADR).
- The progress page's Calibration card adds `외부 방해 N건은 가중치 0.3` when N > 0.

## 5. Errors
- AI failure, cap exceeded or Zod failure: nothing stored except the `ai_calls` row (`ok=false`), logged without
  content. The button shows the mapped `AppError` message; nightly/after() paths stay silent.
- Proposal actions follow Zod → user → service → `ActionResult` with ownership checks.

## 6. Testing
- **Unit:** classification validator (unknown ids/types/domains dropped, skills normalized and capped, complexity
  range); proposal rules (no proposal for filled fields, rejected types, unchanged complexity, existing tags);
  confirmation condition; Calibration weighted mean with 0.3 and a golden check that `stats-v1` examples give the same
  values without blockers; local-day cap counting; `sanitizeForPrompt`.
- **SQL:** RLS on `task_features` and `ai_calls`; one open proposal per (task, feature type).
- **E2E (`ai-classification.spec.ts`, Fake provider):** button → chips → [적용] updates type/domain/tags; another task →
  [무시] → no chips; stop a session with a 20+ char note → interpretation line and question → [표시] → the Calibration
  card notes the weight. No real API calls.
- Existing suites keep passing (the Fake provider returns deterministic outputs for the new tasks).

## 7. Deviations (ADR 0018)
- Daily cap of 30 calls per user across all AI features.
- Skills map to tags.
- Interpretation runs via `after()` for notes ≥ 20 chars; nightly catches up (≤ 5 per user, last 2 days).
- Blocker weight 0.3 applies to Calibration only (`stats-v2`).
- Complexity proposals only when different from the current value; complexity is a stored feature only.
- Embedding similarity deferred (requirements Phase 5).

## Out of scope (F2)
Stat explanations, system assessment, AI quest candidates.
