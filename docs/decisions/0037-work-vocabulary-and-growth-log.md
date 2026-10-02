# 0037 — Work vocabulary for structure, Solo Leveling for tracking

- Status: accepted
- Date: 2026-10-02
- Supersedes: the label table in ADR 0036 and the quest terminology toggle in ADR 0017. The 1% QUEST label in ADR
  0036 is also replaced.

## Context
After ADR 0036 the planner used two metaphors on the same objects. Atomic Habits labels (신념 · 결과 목표 · 시스템 ·
실행 의도 · 습관 · 오늘의 1%) named the structure. The optional "quest terminology" toggle then renamed those same
objects to Solo Leveling words (메인 퀘스트, OUTCOME, DAILY QUESTS, 1% QUEST). As a result the 정체성 tab and the
프로젝트 tab each showed a mix of both vocabularies. A "결과 목표" with a deadline also looked like a project, so it
was unclear which object to use. The owner asked for three things: keep the Atomic Habits concepts, name them in
work terms (project, milestone, task), and make Solo Leveling the layer that keeps tracking achievements.

## Decisions
1. **Two layers, one vocabulary each.**
   - *Structure* (what you work on) uses work terms only. The Atomic Habits idea stays under each term (help text,
     manual).
   - *Tracking* (what you have achieved) uses Solo Leveling terms only: 상태창, 레벨, 랭크, XP, 퀘스트, 업적, 칭호,
     성취 로그. Solo Leveling words never name a structure object again.
2. **Structure labels** (`src/lib/terms.ts` is still the single mapping; code and DB names are unchanged):

   | domain | ADR 0036 label | new label | Atomic Habits idea it carries |
   |---|---|---|---|
   | purpose | 신념 | 비전 | belief: why you work |
   | identity / first identity | 정체성 / 핵심 정체성 | 역할 / 주 역할 | identity-based habits: "나는 ~하는 사람" |
   | mission | 결과 목표 | 목표 | outcome |
   | mission criteria | 성공 기준 | 핵심 결과 | how the outcome is measured |
   | path | 시스템 | 프로세스 | system: the repeated process that produces results |
   | protocol | 실행 의도 | 실행 규칙 | implementation intention (when · where · what) |
   | project / milestone / task | 프로젝트 / 마일스톤 / 할 일 | unchanged | work bundle, checkpoint, one action |
   | habit | 습관 | 루틴 | a small repeated action (two-minute rule, never miss twice) |

   The chain reads 비전 → 역할 → 목표 → (프로세스 · 실행 규칙) → 프로젝트 → 마일스톤 → 할 일, with 루틴 as the
   repeated work.
3. **The quest terminology toggle is removed.** `termsFor()`, `QUEST_TERMS`, `TermsProvider` and `useTerms` are
   deleted, and every caller uses the `TERMS` constant. The `player_profiles.quest_terminology` column stays in the
   DB and is ignored, so no data migration runs and the column can be dropped later.
4. **Tracking labels.** The rule-generated daily quest is `DAILY QUEST` / "일일 퀘스트" (it was 1% QUEST / 오늘의
   1%). Habits no longer use the word "quest". The `habit` XP rule label becomes "루틴".
5. **Tabs:** 스케줄러 · 목표 · 프로젝트 · 주간 회고 · 성장 · 매뉴얼. 정체성 → 목표 and 추적 → 성장. Routes are
   unchanged (`/scheduler/directive`, `/scheduler/progress`). No tab is deleted:
   - 목표 owns direction (vision, roles, goals, processes, rules, routines).
   - 프로젝트 owns the work units.
   - 주간 회고 is a separate weekly ritual with its own week navigation.
   - 매뉴얼 was just requested.

   The overlap came from the labels, not from the number of tabs.
6. **성장 tab = the Solo Leveling status window.** It shows the following, in this order:
   - 상태창: level, rank, equipped title, XP bar, XP by rule this week, and active quests. The enable card is shown
     while gamification is off.
   - 성취 로그 (always shown, see 7).
   - 업적 and 칭호.
   - 목표 현황, then the behaviour stats with the SYSTEM analysis, then patterns and domains.
7. **성취 로그 (achievement log)** is derived. It has no table and is rebuilt on every page load. It contains:
   - 목표 달성: `missions.closed_at` where `status = achieved`.
   - 프로젝트 완료 and 마일스톤 완료: new `completed_at` columns, see 8.
   - 루틴 연속 기록: 7 / 30 / 100 checks in a row on scheduled days. The streak uses the routine's current
     weekdays, and the event time is that check's `created_at`.
   - 퀘스트 클리어: `quests.cleared_at`.
   - 업적 달성: `user_achievements.unlocked_at`.
   - 레벨 업: `xp_events` summed in `created_at` order.

   Quest, achievement and level entries exist only while gamification is on, because their sources only exist
   then. Work entries always show. The newest 40 entries are shown.
8. **`completed_at` on projects and milestones.** A `before insert or update` trigger sets it the first time status
   becomes `completed`, keeps it while status stays `completed`, and clears it when status leaves `completed`.
   Rows that were already completed are backfilled from `updated_at`, which is the best available signal.
9. **Rank** comes from the level (pure function `rankFor`): E 1–9, D 10–19, C 20–29, B 30–39, A 40–49, S 50+. It
   names activity, not ability, like XP (ADR 0016).
10. **Achievements `ach-v2`.** It adds work achievements: FIRST CHECKPOINT (1 milestone), MILESTONE RUNNER (10
    milestones, title PATHFINDER), PROJECT CLEAR (1 project, title FINISHER), GOAL ACHIEVED (1 goal, title
    ACHIEVER), ROUTINE x7 (7-check routine streak), and IRON ROUTINE (30-check streak, title IRON ROUTINE). They
    give no XP and are never re-locked (ADR 0017). Existing keys are unchanged.

## Consequences
- E2E selectors and unit tests that used the ADR 0036 labels were updated.
- Words like 목표일, 목표값 and 목표 시간 still mean target date, value and minutes. A goal is now also called "목표",
  so goal-related text always gives the object, for example "목표 달성" or "연결된 목표".
- Because the log is derived, it reflects the data as it is now. For example, if a project is reopened, its
  "프로젝트 완료" entry disappears.
