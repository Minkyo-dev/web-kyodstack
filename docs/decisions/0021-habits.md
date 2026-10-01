# 0021 — Habits and daily checks

- Status: accepted
- Date: 2026-10-01
- Spec: docs/superpowers/specs/2026-10-01-habits-g2-design.md (umbrella: …-direction-layer-architecture.md)

## Context
improve-requirements-3 §17–18 and §21: a habit is the execution rule that repeats a tactic (protocol), and the daily
screen shows `DAILY QUESTS`. E2 already uses "daily quest" for its rule-generated metric quest.

## Decisions
1. **Two rules:** `check` (ticked by hand) or `focus` (met when today's focused timer minutes on tasks linked to the
   habit's protocol reach `target_minutes`). `focus` needs a protocol; the path's status is irrelevant.
2. **Optional protocol.** A linked habit carries the protocol's mission (composite FK `(protocol_id, mission_id)`);
   an unlinked habit is maintenance. Archiving a protocol or switching a path never changes habits.
3. **Schedule = ISO weekdays** (`smallint[]`, 1–7). No times; the calendar stays the plan.
4. **Checks are rows** (`habit_checks`, one per habit per local day) and are the evidence G3 reads. Users tick only
   *today*. Focus checks are written by the server, lazily on scheduler page load (today) and in the nightly job
   (yesterday and today), and never removed.
5. **XP rule `habit`:** +10 per check, 30 per local day (`xp-v1` extended; existing rules unchanged). Unticking
   deletes the check and its XP row, so toggling can't farm XP and leaves no orphan.
6. **Labels:** habits are `DAILY QUESTS` / `습관`; E2's metric daily quest becomes `SYSTEM QUEST` / `오늘의 목표`.
   Habits work with gamification off.
7. **Dependency:** the scheduler page composes `<HabitPanel>` and passes it as the `habitPanel` slot.

## Consequences
- No backfill of checks; habit XP from before enabling gamification is picked up by the enable backfill.
- A focus check reflects the minutes when it was recorded; deleting a session later does not undo it.
