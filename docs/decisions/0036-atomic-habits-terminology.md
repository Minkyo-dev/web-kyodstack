# 0036 — Planner terminology follows Atomic Habits

- Status: superseded by ADR 0037 (labels and the quest toggle; the Atomic Habits concepts stay)
- Date: 2026-10-01
- Supersedes: the labels in ADR 0017 (quest terms), ADR 0020 §2 (UI names) and ADR 0021 §6 (SYSTEM QUEST label)

## Context
The planner (scheduler, direction, projects, review, progress) is now one "플래너" menu with tabs. Its labels mixed
planning words (목적, 전략, 실행 방식) that did not tell the user how the layers relate. The direction layer already
has the shape of Atomic Habits: identity first, outcomes vs. systems, concrete cues, small repeated habits.

## Decisions
1. **Labels only.** Code and DB names (`purpose`, `identity`, `mission`, `path`, `protocol`, `habit`) are unchanged;
   `src/lib/terms.ts` is the single mapping.

   | domain | plain (before → after) | quest mode (before → after) | Atomic Habits idea |
   |---|---|---|---|
   | purpose | 목적 → 신념 | SYSTEM DIRECTIVE → CORE BELIEF | identity layer = what you believe |
   | identity | 정체성 | IDENTITY | identity-based habits |
   | first identity | 대표 정체성 → 핵심 정체성 | CLASS → CORE IDENTITY | |
   | mission | 목표 → 결과 목표 | MISSION → OUTCOME | outcome layer |
   | path | 전략 → 시스템 | PATH → SYSTEM | "fall to the level of your systems" |
   | protocol | 실행 방식 → 실행 의도 | PROTOCOL → INTENTION | implementation intention (when · where · what) |
   | habit | 습관 | DAILY QUEST | |
   | metric daily quest | 오늘의 목표 → 오늘의 1% | SYSTEM QUEST → 1% QUEST | 1% better every day |
   | 성장 / 유지 | unchanged | unchanged | |

2. **Tabs:** 방향 → 정체성 (start with identity), 주간 리뷰 → 주간 회고 (review and reflection), 진행 → 추적
   (habit tracking; 4th law, make it satisfying). Routes are unchanged.
3. **Copy:** page help explains the chain (belief → identity → outcome → system → intention → habit), the two-minute
   rule, "never miss twice", and actions as votes for an identity. Diagnosis texts use the new names and stay neutral
   (DENY_LIST still applies).
4. Generic words stay: 목표일 / 목표값 / 목표 시간 (target date / value / minutes) and quest objectives (목표).

## Consequences
- E2E selectors that used the old labels were updated (directive, habits, progress, page-help, quests).
- "SYSTEM" now names both the path layer and the AI persona (SYSTEM QUESTION / analysis); context keeps them apart.
