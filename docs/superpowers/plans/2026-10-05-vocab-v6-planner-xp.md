# 단어장 V6 — planner XP for vocab review days Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** For users who opted into planner gamification (ADR 0016), a local day with at least 10 flashcard reviews
earns +20 XP once (rule `vocab`, label "단어 복습"). It is evaluated by the same `evaluateDay`, after a review
session (the `finishSessionAction` progress hook) and in the nightly reconcile like every other rule.

**Spec:** §14 V6, ADR 0016 rules.

## Global Constraints
- XP stays derived and capped per rule per day (`DAY_CAP.vocab = 20`). The source is the day's first review id, and
  the per-day cap stops a second award when that review is undone.
- Nothing changes for users without gamification.

## Review Focus
1. **9 reviews.** Expected: no XP. **10 reviews.** Expected: +20 once. **A second session the same day.**
   Expected: nothing more. Test: `evaluateDay`.
2. **Reviews just after local midnight** count for the new local day. Test: `buildDayFacts` with the timezone.

### Task 1: DB — `xp_events.rule` accepts `vocab`.
### Task 2: Rules + facts (`XP_RULES`, label, `DayFacts.vocabReviews`, `evaluateDay`, `buildDayFacts`, `loadXpRaw`) with tests.
### Task 3: Hook `finishSessionAction` into `evaluateProgress`; docs.
