# Personal assistant (비서) — overall design

- Date: 2026-10-02
- Status: accepted; P1–P5 implemented (ADR 0039, 0040, 0042, 0043, 0044), each with its own design spec
- Related: ADR 0009 (AI provider, guardrails), 0018 (AI budget, proposals), 0022/0023 (status, diagnosis), 0037/0038
  (vocabulary, 습관 tab), `2026-10-01-ai-direction-setup-design.md` (to be folded into P3)

## 1. Intent
Turn the planner from "a place where I record things" into a tool that works the owner's routine with them toward
their 변화 (changes) and projects. Three things are missing today:
- **Initiative:** nothing reaches out first.
- **A conversation:** there is no way to ask or tell the system something in plain words.
- **Continuity:** what worked last week is not carried into the next suggestion.

## 2. Principles (unchanged project rules, restated for the assistant)
1. **Code decides, AI words.** Selection, scoring, thresholds and every number come from SQL/TypeScript. The LLM
   only phrases things or picks from a list the code built.
2. **Proposals, never writes.** Anything the assistant wants to change arrives as a proposal the owner applies or
   dismisses. Reads are free.
3. **Bounded.** Every LLM call goes through `callAi` (30 calls per local day). Notifications have a daily cap. Any
   AI part can fail without breaking the screen.
4. **Neutral tone.** `DENY_LIST` applies. Never shame, never score the person. "Never miss twice" over streak
   pressure.
5. **Timezone-correct.** Every "today", "yesterday" and "evening" uses `profiles.timezone`.

## 3. Capabilities and phases

| Phase | Capability | Summary |
|---|---|---|
| **P1** | Daily rhythm | Morning brief card on the scheduler (오늘의 한 가지, habits, missed-yesterday, capacity, next 변화 step, one AI coach line). Evening check-in extends 하루 마무리 (잘한 한 가지, what blocked, tomorrow's one thing), which feeds the next morning's brief. |
| P2 | Proposal inbox + weekly coaching | One `assistant_proposals` flow (kind, payload, evidence, status) shared by every AI suggestion. The weekly review ends with "one 1% change for next week", picked from the diagnosis layer and applied with one click. |
| P3 | Chat assistant | A panel available on every planner tab. Read tools (today, stats, changes, diagnosis) answer directly. Write tools only create P2 proposals. The AI direction-setup wizard becomes "AI로 초안 채우기" inside the 새 변화 wizard. |
| P4 | Proactive notifications | Web push (PWA). Rule-based triggers: block starts in 10 min, a habit was missed yesterday, a streak is at risk, a 변화 has been flat for 2 weeks, behind pace for its deadline. Daily cap and quiet hours. |
| P5 | Memory and forecasts | A learning log made of accepted coaching items, read by later suggestions. A deadline forecast for each 변화 (at the current pace the 달성 기준 are met by date X). Rule blocks suggested in the hours that historically hold. |

Order rationale:
- P1 creates the daily habit of opening the app, and everything it needs already exists.
- P2 gives every later phase a single, auditable channel for changes.
- P3 and P4 reuse that channel.
- P5 needs weeks of data.

## 4. Shared building blocks
- `features/assistant/`: domain (pure selection rules), queries, services, components. Pages compose it the same
  way the scheduler composes the habit and quest panels.
- **AI:** the existing `AiProvider`, `callAi`, versioned prompts in `features/ai/prompts`, Zod output schemas and
  canned fake outputs for tests.
- **Storage:** only what cannot be recomputed is stored, such as AI text, the owner's answers and proposals.
  Briefs and their facts are always computed live.
