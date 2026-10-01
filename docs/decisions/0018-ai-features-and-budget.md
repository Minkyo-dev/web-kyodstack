# 0018. AI feature proposals, work-log interpretation and the AI budget
- Status: accepted
- Date: 2026-09-30

## Context
Requirements 2 (§36–43) use the LLM only for semantic features: task classification and work-log interpretation,
with provenance, user confirmation and deterministic stats. F1
(`docs/superpowers/specs/2026-09-30-ai-classification-worklog-design.md`) builds them on the existing provider layer.

## Decision
- **Budget:** every AI call (weekly review, recommendations, classification, interpretation) goes through
  `callAi`: at most **30 calls per user per local day**, recorded in `ai_calls` (kind, model, ok — never prompt or
  response text). Over the cap → `AI_BUDGET_EXCEEDED`.
- **Proposals, not writes:** classification output becomes `task_features` rows (`proposed`, provenance: source,
  confidence, model, prompt version). The task changes only on [적용] (`accepted, source ai`) or a saved [수정]
  (`accepted, source user, confidence 1.0`). [무시] rejects; a rejected type is not proposed again. Superseded open
  proposals are closed with `source = system` and don't count as rejections.
- **What is proposed:** type/domain only when empty (domain only from the user's list); complexity only when it differs
  from the current value (the column always has one); skills map to **tags**, only those not already on the task.
  Complexity is stored as a feature only — it is not a stat and doesn't change duration recommendations yet.
- **Timing:** classification runs in the nightly job (≤ 20 tasks, one call per user) and on the drawer button.
  Work-log interpretation runs via `after()` when a stop or note save leaves a note ≥ 20 chars; the nightly job
  catches up (≤ 5 per user, last 2 local days).
- **Blockers:** the interpretation is a label. Only a user-confirmed blocker (`work_logs.confirmed_blocker = true`)
  changes a stat: that task's Calibration sample weighs **0.3** (`stats-v2`, weighted mean; medians unchanged).
  Reliability/Consistency/Recovery are unchanged (Recovery weighting deferred).
- **E2E** seeds proposals and interpretations directly (no LLM cost or nondeterminism); the request path is covered
  by unit tests of the validators and rules.
- Embedding similarity is deferred (requirements Phase 5).

## Consequences
- AI cost per user is bounded and visible in `ai_calls`.
- Calibration snapshots switch to `stats-v2`; trend lines break at the version change.
