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
