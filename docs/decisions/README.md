# Architecture Decision Records

Add a new file `NNNN-short-title.md` for each decision that deviates from
`docs/personal-work-scheduler-design.md` or that isn't obvious from the code.
Never rewrite an accepted ADR. Supersede it with a new one instead.

Template:

```
# NNNN. Title
- Status: accepted | superseded by NNNN
- Date: YYYY-MM-DD

## Context
## Decision
## Consequences
```

| # | Title | Status |
|---|---|---|
| 0001 | Restructure routes to the spec and rename portfolio tables | accepted |
| 0002 | Remote-only Supabase with SQL RLS tests | accepted |
| 0003 | Email + password auth, single owner, no public signup | accepted |
| 0004 | Atomic schedule mutations via Postgres functions | accepted |
| 0005 | date-fns v4 + @date-fns/tz for timezone math | accepted |
| 0006 | Clamp auto-sized blocks to the focus-block limits | accepted |
| 0007 | Tasks with logged work cannot be hard-deleted | accepted |
| 0008 | Recommended durations round up to 5 minutes | accepted |
| 0009 | AI provider, contracts and guardrails | accepted |
| 0010 | Scheduled jobs via Vercel Cron + job ledger | accepted |
| 0011 | Focus pauses and work logs | accepted |
| 0012 | Missed blocks and rescheduling | accepted |
| 0013 | Classification axes, tags and estimator v2 | accepted |
| 0014 | Stat engine: live stats, nightly snapshots, commitment rules | accepted |
| 0015 | Today view, week summary, capacity notice | accepted |
| 0016 | XP ledger, level and opt-in backfill | accepted |
| 0017 | Quests, achievements, titles and quest terminology | accepted |
| 0018 | AI feature proposals, work-log interpretation and the AI budget | accepted |
| 0019 | Weekly SYSTEM analysis and AI-picked daily quests | accepted |
| 0020 | Direction layer: purpose, identities, missions, paths, protocols | accepted |
| 0021 | Habits and daily checks | accepted |
| 0022 | Direction status: mission progress, alignment, identity evidence | accepted |
| 0023 | Strategy review: layer diagnosis and SYSTEM QUESTION | accepted |
| 0024 | Project archive folder and the scheduler month view | accepted |
| 0025 | Household finance service | accepted |
| 0026 | Visual refresh: tinted neutrals, indigo accent, native select styling | accepted |
| 0027 | Logical category delete and the bulk entry grid | accepted |
| 0028 | The finance calendar's day panel | accepted |
| 0029 | Recurring payments (subscriptions) | accepted |
| 0030 | Korean webfont (Pretendard) | accepted |
| 0031 | A dedicated E2E user | accepted |
| 0032 | Account balances by reconciling, net worth, asset flow | accepted |
| 0033 | Monthly category budgets | accepted |
| 0034 | Credit card payment day | accepted |
