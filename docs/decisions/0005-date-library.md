# 0005. date-fns v4 + @date-fns/tz for timezone math
- Status: accepted
- Date: 2026-09-29

## Context
Spec §9 suggests date-fns / date-fns-tz. date-fns v4 ships first-party timezone support
through `@date-fns/tz` (`TZDate`), which replaces date-fns-tz.

## Decision
Use `date-fns` v4 + `@date-fns/tz`. All local-day and week boundaries are computed with `TZDate` in the user's
`profiles.timezone`, then sent to the DB as ISO instants.
