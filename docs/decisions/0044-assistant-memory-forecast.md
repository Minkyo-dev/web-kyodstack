# 0044 — Assistant P5: learning log, coach-v2, deadline forecast, time slots

- Status: accepted
- Date: 2026-10-02
- Spec: docs/superpowers/specs/2026-10-02-assistant-p5-memory-forecast-design.md

## Context
P1–P4 judge each week on its own. Nothing remembers whether an applied proposal helped, so coach-v1 can cut the
same habit twice from pre-change data, and it never keeps its own promise to "grow back once it holds". The
umbrella design asks P5 for a learning log, a forecast per 변화 and rule blocks placed at the hours that work.

## Decisions
1. **No new tables.**
   - The learning log is the applied rows of `assistant_proposals`. Their before/after results are recomputed on
     every read from `habit_checks` and `work_sessions` (`learn-v1`).
   - Only what can't be recomputed is stored (the umbrella's storage rule).
2. **`learn-v1`:**
   - It compares 28 days before the decision with up to 28 days after it.
   - It reports "지켜보는 중" until 14 days have passed.
   - The verdict is a word next to the numbers (좋아짐, 비슷함 or 줄어듦), with fixed thresholds.
   - It covers only `rule_minutes`, `habit_days` and `time_slot`. Reviews and chat tasks have nothing to measure.
3. **`coach-v2` reads the log.**
   - A target changed by an applied proposal in the last 28 days is left alone ("settling").
   - A reduced habit or rule grows back one step once the smaller version holds: ≥ 80% kept over ≥ 8 due days, or
     ≥ 4 sessions at or above the current minutes. A further step needs another 28 days.
   - Grows reuse the existing `habit_days` and `rule_minutes` kinds and the same apply path, with a `:grow` target
     key.
4. **New kind `time_slot` (`slot-v1`).**
   - The trigger: the hour that held ≥ 50% (and ≥ 3) of a rule's last-28-day timer sessions, and the rule has no
     planned block in the next 7 days.
   - Applying it creates one task and one block on the next fitting day, through `createTask` and `scheduleTask`.
     It is never a recurring series.
   - A migration widens the kind check.
5. **`forecast-v1`:**
   - It is linear, using the last 28 days' rate when that rate is trustworthy, and the average since creation
     otherwise. "Trustworthy" means the mission is at least 28 days old and has no unmet numeric criterion, because
     numeric history isn't stored.
   - It is shown with its basis. Below 14 days of age it says it is still collecting.
   - It is not a notification. The existing pace sentence and the diagnosis `goal` review already cover "behind".
6. **The chat snapshot** gains `learned` (the latest 5 log entries) and `changes[].forecast` (`chat-context-v2`).
   The prompt explains both. `chat-v2` keeps the same output schema.

## Consequences
- Proposals now carry `rules_version = 'coach-v2'`. Old rows stay valid because the payloads are unchanged.
- Forecasts are rough by design. The text always names the basis, and a far or stalled forecast says so instead of
  showing a date.
- A `time_slot` block is placed at HH:00 local and is never moved later. If the owner ignores it, it becomes
  missed like any other block.
