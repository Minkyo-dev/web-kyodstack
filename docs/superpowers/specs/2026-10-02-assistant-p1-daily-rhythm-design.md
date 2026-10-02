# Assistant P1 — daily rhythm (morning brief, evening check-in)

- Date: 2026-10-02
- Status: accepted
- Umbrella: `2026-10-02-assistant-architecture.md`. Decisions: ADR 0039.

## 1. Goal
When the owner opens the planner, one card says what matters today. In the evening the same card asks for a short
check-in. That check-in decides the next morning's "오늘의 한 가지", so each day closes the loop on the previous one.

## 2. The brief card (scheduler, top of the 오늘 panel)
The card is collapsible and opens by default. Its title changes with the local hour, using
`scheduler_settings.evening_hour`, which defaults to 18:
- **아침 브리핑** before 12:00.
- **오늘의 흐름** from 12:00 until the evening hour.
- **저녁 체크인** from the evening hour on.

Rows (each row has text and an icon, never colour alone; empty rows are hidden):
1. **Coach line** (AI, optional): one sentence of at most 90 characters built from the facts below. Generated at
   most once per local day and cached. Missing when there is no budget, no key, or an error.
2. **오늘의 한 가지**: one open task, with the reason it was chosen and [시작] / [열기] buttons. It is picked by
   the first rule that matches:
   1. the task chosen in yesterday's evening check-in (`next_task_id`), if it is still open → "어제 정한 일";
   2. an open task scheduled today that is linked to an active 변화 (directly or through its project), earliest
      block first → "변화 '…'로 가는 일";
   3. the earliest open task scheduled today → "가장 먼저 잡힌 일";
   4. an open task due today or overdue, highest priority first (priority 1 is the most important, the scheduler's convention) → "기한이 오늘";
   5. the highest-priority open task for today → "우선순위가 가장 높은 일".
3. **습관**: "오늘 n개 중 m개 완료". When a habit was due yesterday and not checked, the card says "어제 놓친 습관:
   A, B — 오늘 하면 두 번 연속은 아닙니다." It lists names only and never counts misses.
4. **작업량**: shown only when today's planned minutes are more than the 28-day capacity, as "계획 Xh / 평소 Yh — 덜
   중요한 일을 내일로 옮겨 보세요". It reuses `dailyCapacity` and the existing capacity notice.
5. **다음 변화 단계**: the first active 변화 whose blueprint is not complete, as "‘영어’ — 다음 단계: 실행 규칙", with a
   link to that 변화.
6. **Check-in**: from the evening hour, a [하루 마무리] button opens the extended dialog. After saving, the row
   reads "체크인 완료 · 내일의 한 가지: …".

## 3. Evening check-in (extends `daily_reflections`)
The existing dialog keeps mood, focus, energy and note, and adds:
- **오늘 잘한 한 가지** (`win`, at most 280 characters, optional). This is the 4th law: make it satisfying.
- **무엇이 가장 막았나요?** (`blocker`, one optional choice): 시간 부족 `time`, 에너지 `energy`, 방해·급한 일
  `interruption`, 계획 과다 `overplanned`, 다음 행동이 불분명 `unclear`, 없음 `none`.
- **내일 가장 먼저 할 한 가지** (`next_task_id`, optional): any open task from today's list or the unscheduled list.
  A deleted task leaves this empty (`on delete set null (next_task_id)`).

P2 will use blockers for coaching. In P1 they are stored and shown back only. The 하루 마무리 button in the footer
stays and opens the same dialog.

## 4. AI coach line
- Prompt `brief-line-v1`. The input is the facts as JSON with titles sanitised: phase, the one thing and its reason,
  habits done/due, yesterday's missed habit names, over capacity or not, the next 변화 step, yesterday's blocker and
  win.
- Output `{ line: string ≤ 90 }`. Lines containing a `DENY_LIST` word are dropped.
- The line is cached in `assistant_briefs(user_id, local_date)`. It is generated after the page responds
  (`after()`) when today's row is missing, so it appears on the next load or refresh. A failure writes nothing, and
  a later load tries again, at most 3 times a day (counted in `ai_calls` kind `brief_line`).
- The fake provider returns a fixed line, so tests are deterministic.

## 5. Data
- `daily_reflections` gets three columns:
  - `win text` (≤ 280);
  - `blocker text` (check: one of the six keys, or null);
  - `next_task_id uuid` with FK `(next_task_id, user_id)` → `tasks(id, user_id)` `on delete set null (next_task_id)`.
- New table `assistant_briefs`:
  - columns `(id, user_id, local_date, line, model, prompt_version, created_at)`, unique `(user_id, local_date)`;
  - RLS: own select, insert and delete. Delete exists only for E2E cleanup, as with `xp_events`. There is no
    update.
- `scheduler_settings.evening_hour smallint` (12–23, default 18) is not editable from the UI in P1.

## 6. Code layout
- `features/assistant/domain/brief.ts`: pure `buildBrief(input)` → `Brief`, with the phase, the one-thing rule,
  habit and capacity rows and the next step.
- `features/assistant/queries/brief.queries.ts`: loads what the scheduler page does not already have: yesterday's
  reflection, yesterday's habit checks, the next 변화 step and today's cached line.
- `features/assistant/services/brief-line.service.ts`: `ensureBriefLine` (budgeted, never throws).
- `features/ai/prompts/brief-line.prompt.ts` and `features/ai/schemas/brief-line.schema.ts`.
- `features/assistant/components/brief-card.tsx`: a client component inside the today panel, because it needs the
  workspace's start and open callbacks.
- The scheduler page builds the brief and passes it to the workspace.

## 7. Testing
- **Unit:** `buildBrief` (phases, every one-thing rule in order, missed-yesterday, capacity row, next step), the
  brief-line schema and `DENY_LIST` filter, and the reflection schema with the new fields.
- **SQL:** `assistant.sql`. Own rows only; the next task must be the owner's (composite FK); deleting the task
  clears `next_task_id`.
- **E2E `assistant-brief.spec.ts`:**
  1. Seed an open task.
  2. Save the evening check-in with that task as tomorrow's one thing.
  3. Move the reflection's date to yesterday in the DB.
  4. Reload the page; the brief shows the task as "어제 정한 일".
  5. [시작] starts its timer.
