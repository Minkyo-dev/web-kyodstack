# 0038 — 습관 tab: "변화" instead of "목표", and a guided habit builder

- Status: accepted
- Date: 2026-10-02
- Amends: ADR 0037 §2 (the mission, criteria and habit labels and the tab name). The rest of 0037 stands.

## Context
After ADR 0037 the owner still found two problems:
- "목표" (mission) and "프로젝트" read as the same thing. Both have a deadline, a status and progress.
- The direction page was hard to use. It was a stack of loose forms: purpose, identity chips, a habit form with
  every field on one line, a mission list, and then criteria, path and protocol forms in `<details>`. Nothing
  showed the order to fill things in, what was missing, or how a protocol turns into a daily habit.

The owner asked to rename the tab to 습관 and to rebuild the screen for entering roles, goals, processes and rules.

## Decisions
1. **Labels** (`src/lib/terms.ts`; code and DB names unchanged):

   | domain | ADR 0037 | now | why |
   |---|---|---|---|
   | directive tab | 목표 | 습관 | the tab is about building habits (Atomic Habits) |
   | mission | 목표 | 변화 | "만들고 싶은 변화": a change in how you work or live. It is not a deliverable, so it can't be mistaken for a project |
   | mission criteria | 핵심 결과 | 달성 기준 | how you know the change happened |
   | habit | 루틴 | 습관 | the tab is named 습관, so the items it holds are too |

   비전 · 역할 · 프로세스 · 실행 규칙 · 프로젝트 · 마일스톤 · 할 일 are unchanged. The rule for picking one:
   - **프로젝트**: something that ends with a result (a deliverable).
   - **변화**: something you keep doing until it becomes who you are.

   A project can be linked to a 변화. Its work then counts as 성장, and 성장 / 유지 is unchanged.
2. **Page layout (`/scheduler/directive`, title 습관):**
   - *나는 어떤 사람이 되고 싶은가*: the vision sentence and the role chips. Roles can be renamed inline, reordered
     and archived. The first role is the 주 역할.
   - *변화* list (left): one card per change. Each card shows its setup progress as text (for example "설계 3/5
     단계"), its roles, its 달성 기준 count and its habits. "+ 새 변화" opens the wizard.
   - *습관 설계도* (right): the selected change as five numbered steps. Each step shows a text status (완료 / 다음
     단계 / 비어 있음, never colour alone). An empty step opens its form with a guiding question and an example. A
     filled step shows a summary and an 편집 button. The steps are:
     1. 변화: name, why, roles, deadline, status.
     2. 달성 기준.
     3. 프로세스: set or edit it; switching keeps history as before.
     4. 실행 규칙: built as a sentence.
     5. 습관: the habits linked to this change's rules. Quick add is prefilled from a rule.

     Linked projects are listed under the steps as "이 변화를 위한 프로젝트".
   - *다른 습관*: habits not linked to any rule (maintenance), with their own add form, below the change list.
3. **New-change wizard.** A four-step dialog:
   1. Which change, and which roles it serves (deadline optional).
   2. How you will know (달성 기준). Optional.
   3. Which process you will repeat. Optional.
   4. When, where and what (실행 규칙). Optional. It can also create a habit for that rule on chosen weekdays.

   Any step after the first can be skipped. One server action (`createChangePlanAction`) runs the existing
   services in order: mission → criteria → path → protocol → habit. These writes are **not one transaction**. If a
   later write fails, the change already exists with the steps that succeeded. The error is shown, and the
   blueprint marks the missing steps as 비어 있음 so they can be filled in place. Every service keeps its
   validation and ownership checks.
4. **Rule sentence builder.** 실행 규칙 is written as 언제 (cue) / 어디서 (place, optional) / 무엇을 (action) /
   몇 분. The pure function `composeRule` joins the parts into the protocol title: "출근 후 커피를 내리면, 책상에서
   25분 쉐도잉". The title is still limited to 80 characters, and the inputs are capped so the parts fit. The parts
   are not stored separately. Editing a rule edits the whole sentence, so no schema change is needed.
5. **Progress steps** come from a pure function, `planSteps`: a change, at least one criterion, an active path, at
   least one active protocol, at least one active habit linked to the change. Its output is shown on the cards
   and in the blueprint.
6. Components that were replaced and deleted: `directive-header`, `mission-forms`, `habit-section`,
   `protocol-list`. `criteria-list` and `path-panel` are restyled into steps.
7. Achievement copy follows the labels: GOAL ACHIEVED → CHANGE ACHIEVED. Keys are unchanged.

## Consequences
- E2E selectors on the directive page were rewritten (`directive.spec.ts`, `habits.spec.ts`), and a wizard spec
  was added.
- A failed wizard can leave a partial change. This is acceptable because every piece can be edited in place, and
  it is visible.
