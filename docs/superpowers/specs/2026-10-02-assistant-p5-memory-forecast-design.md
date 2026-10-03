# Assistant P5 — memory and forecasts

- Date: 2026-10-02
- Status: accepted
- Umbrella: `2026-10-02-assistant-architecture.md`. Decisions: ADR 0044.

## 1. Goal
The assistant remembers what was tried and whether it helped, and looks ahead:
- **Learning log:** every applied coaching proposal becomes a record, with a before/after result once there is enough data.
- **Continuity:** the weekly coaching reads that log. It gives a change time to work, and it grows a habit or rule back
  once the smaller version holds.
- **Deadline forecast:** for each active 변화, "at the current pace the 달성 기준 are met around date X".
- **Time slots:** a rule's block is suggested at the hour when its sessions have actually happened.

Everything is deterministic (code decides, AI words). No new tables: the log is the applied rows of
`assistant_proposals` plus live data, and every result is recomputed on read.

## 2. Learning log `learn-v1` (pure, `features/assistant/domain/learning.ts`)
- **Entries:** applied proposals of kind `rule_minutes`, `habit_days` or `time_slot`, decided in the last 180 days,
  newest first, at most 12. `review` and `create_task` are not logged; they have no measurable target.
- **Windows,** in local days around the decision day D: before = [D − 28, D), after = [D, min(today, D + 28)).
  Today is excluded.
- **Watching:** while the after window is shorter than 14 days, the entry reads "지켜보는 중".
- **Measures:**
  - `habit_days`: the completion rate. Before uses the `from` weekdays, after uses the `to` weekdays, and neither
    counts days before the habit was created. The result needs at least 4 due days on each side; otherwise it reads
    "기록 부족".
  - `rule_minutes` and `time_slot`: timer sessions per week on the protocol's tasks, before vs after.
- **Verdict:**
  - Rates: a change of +0.15 or more is 좋아짐, −0.15 or less is 줄어듦, and anything between is 비슷함.
  - Sessions per week: after ≥ 1.25 × before and at least +0.5/week is 좋아짐. after ≤ 0.75 × before is 줄어듦.
    Otherwise 비슷함. A before of 0 and an after above 0 is 좋아짐.
  - The verdict is always shown in words next to the numbers, never by color alone.
- **Where it shows:**
  - The 주간 회고 page, under 코칭, in a "배운 것" list.
  - The chat snapshot, as `learned` (the latest 5 entries).

## 3. Coaching `coach-v2` (extends `coach-v1`)
1. **Settling:** a target with an applied coaching proposal decided within the last 28 days gets no new
   `rule_minutes`, `habit_days` or `time_slot` proposal. The targets are the protocol and its carried habits for
   `rule_minutes`, the habit for `habit_days`, and the protocol for `time_slot`. This lets a change work before it
   is judged, and it stops the old pre-change data from proposing the same cut twice.
2. **Grow back** (the promise in the coach-v1 reasons, "자리가 잡히면 다시 늘려요"):
   - **Habit days.** Conditions:
     - The latest applied reduction on the habit removed weekdays.
     - The habit's current weekdays are a strict subset of that reduction's `from`.
     - The last applied proposal on the habit was decided ≥ 28 days ago.
     - In the 28-day window the habit was kept ≥ 80% with ≥ 8 due days.

     Then propose `habit_days` adding back one removed weekday (the lowest ISO number), with target key
     `<habit>:grow`.
   - **Rule minutes.** Conditions:
     - The latest applied reduction on the protocol lowered the minutes.
     - The current intended minutes are below that reduction's `from`.
     - The last applied proposal on the protocol was decided ≥ 28 days ago.
     - There were ≥ 4 sessions in the window with a median ≥ the current minutes.

     Then propose `rule_minutes` to min(from, max(current + 5, median rounded to 5)), carrying focus habits whose
     target equals the current minutes. The target key is `<protocol>:grow`.
   - Each grow step is one weekday or one rounded step. A later grow needs another 28 quiet days.
3. **Time slot** `slot-v1` (new kind `time_slot`):
   - **Applies to** an active protocol on an active path, with intended minutes, ≥ 4 timer sessions in the window,
     and no planned block on its tasks in the next 7 days.
   - **The hour:** it is the local start hour holding the most of those sessions. It needs ≥ 3 sessions there and a
     share of ≥ 0.5.
   - **Payload:** `{ protocolId, missionId, hour, minutes, weekdays }`. The weekdays are the union of the protocol's
     active focus habits' weekdays; empty means any day.
   - **Apply** (`slot-apply-v1`):
     - It picks the first local day from today through 7 days ahead that is on one of those weekdays and whose
       HH:00 start is at least 5 minutes away.
     - It creates the task (the protocol's title, linked to the protocol, with that target date and estimate)
       through `createTask`.
     - It creates the block through `scheduleTask`, so the usual checks and the block RPC apply.
     - If the protocol is no longer active, the proposal is closed as stale.
4. **Order:** reductions (`rule_minutes`, then `habit_days`), then grows, then time slots, then reviews. There are
   at most 3; the first is the focus.

## 4. Deadline forecast `forecast-v1` (pure, `features/direction/domain/forecast.ts`)
- **Input:** the progress ratio (`mission-progress-v1`), the ratio 28 days ago (`missionProgressBefore`), the
  creation day, the deadline, today, and whether any numeric criterion is still unmet.
- **States:**
  - `none`: there is no ratio, so nothing is shown.
  - `done`: the ratio is ≥ 1.
  - `collecting`: the mission is less than 14 days old.
  - `stalled`: the rate is ≤ 0.
  - `far`: the ETA is more than 730 days away.
  - `eta`: the forecast date. With a deadline it also gives the difference in days (late > 0).
- **Rate:** it uses the last 28 days, (now − before) / 28, when the mission is at least 28 days old and every numeric
  criterion is already met. Otherwise it uses the average since creation, ratio / age. A numeric criterion's past
  partial value is unknown, so a 28-day delta would overstate it. The basis is shown, as "최근 4주 속도" or
  "시작 이후 평균".
- **ETA:** today + ⌈(1 − ratio) / rate⌉ days.
- **Shown:**
  - on the 성장 tab's 변화 현황 card, as one line under the progress bar;
  - in the chat snapshot, as `changes[].forecast`.

## 5. Testing
- **Unit:**
  - `learn-v1`: windows, watching, too little data, and the verdict thresholds.
  - `coach-v2`: settling, both grow rules and their guards, time slot selection, and ordering.
  - `forecast-v1`: every state and the rate basis switch.
  - The slot date picker: weekdays and the 5-minute lead.
- **SQL:** the kind check accepts `time_slot`.
- **E2E `assistant-learning.spec.ts`:**
  - Seed an applied `habit_days` proposal decided 20 days ago, with checks, and see it in "배운 것" with its verdict.
  - Seed an open `time_slot` proposal, apply it, and see the task and its block in the scheduler.
