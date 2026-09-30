# Architecture (as built)

The spec (`personal-work-scheduler-design.md` §5–§8) describes the target. This file records what exists now.
Update it whenever you add a route, feature module or infrastructure piece.

## Stack
Next.js 16.2 (App Router, Turbopack) · React 19.2 · TypeScript strict · Tailwind v4 + shadcn/ui (Base UI)
· Supabase (Auth + Postgres + RLS; remote project only, see ADR 0002) · Zod 4 · date-fns 4 + @date-fns/tz
· FullCalendar 6.1 · Vitest.

## Request flow
```
browser ──► src/proxy.ts ──► lib/supabase/proxy.ts  (refresh session cookie, optimistic redirect)
        ──► (private)/layout.tsx ──► lib/auth.requireUserOrRedirect()   (verified via getClaims)
        ──► page (Server Component) ──► features/*/queries  ──► lib/supabase/server (RLS as the user)
        ──► client leaf ──► features/*/actions ("use server") ──► Zod ──► requireUser() ──► services ──► Supabase
```
Authorization comes from RLS. The proxy redirect is only a UX convenience.

## Routes
| Path | Group | Notes |
|---|---|---|
| `/`, `/about`, `/blog`, `/blog/[slug]`, `/projects`, `/projects/[slug]` | (public) | mock content for now |
| `/login` | (auth) | email + password (ADR 0003) |
| `/dashboard` | (private) | links to utilities |
| `/scheduler?week=yyyy-MM-dd` | (private) | Today list + week calendar + task drawer |
| `/scheduler/projects` | (private) | project list with progress |
| `/scheduler/projects/[id]` | (private) | milestones, tasks, progress, settings, AI suggestions |
| `/scheduler/review?week=` | (private) | deterministic weekly metrics + AI interpretation |
| `POST /api/ai/weekly-review`, `POST /api/ai/daily-recommendations` | route handlers | generation (auth via cookie, `runRoute`) |
| `GET/POST /api/internal/jobs/{daily-planner,weekly-review,duration-profile-refresh}` | route handlers | cron jobs (Bearer secret, service role; ADR 0010) |

Private prefixes enforced in `lib/supabase/proxy.ts`: `/dashboard`, `/scheduler`, `/finance`, `/english`.

## Modules
| Path | Purpose |
|---|---|
| `src/lib/env.ts` / `env.server.ts` | Zod-validated env; the server file imports `server-only` |
| `src/lib/errors.ts` | `AppError`, `ErrorCode`, `ActionResult`, `fromDbError` (never leaks DB detail) |
| `src/lib/logger.ts` | structured JSON logs (spec §48) |
| `src/lib/auth.ts` | `getUser` (cached per request), `requireUser`, `requireUserOrRedirect` |
| `src/lib/supabase/*` | browser, server and proxy clients |
| `src/features/auth` | login/logout actions and form |
| `src/lib/action.ts` | `runAction()` = the Server Action pipeline below (Zod → auth → service → ActionResult + log) |
| `src/features/scheduler/domain` | types and constants (status labels, fallbacks) |
| `src/features/scheduler/utils` | pure, client-safe: `timezone.ts` (TZDate, DST-safe), `duration.ts`, `calendar.ts` |
| `src/features/scheduler/queries` | server reads (`listTodayTasks`, `listBlocksInRange`, `getSchedulerContext`) |
| `src/features/scheduler/services` | business rules (template find-or-create, delete protection, block sizing, RPC calls) |
| `src/features/scheduler/actions` | thin `"use server"` wrappers → `runAction` + `revalidatePath("/scheduler")` |
| `src/features/scheduler/services/work-session.service.ts` | start (RPC) / stop / manual (overlap check) / delete |
| `src/features/scheduler/queries/session.queries.ts`, `analytics.queries.ts` | sessions in range, active session, reflection, `task_plan_actual` |
| `src/features/scheduler/utils/estimator.ts` | pure duration estimator, shared by the server block sizing, the drag preview and the explanation |
| `src/features/scheduler/services/duration-profile.service.ts` | load profiles; refresh a template's profile (quietly after history changes) |
| `src/features/projects` | domain, pure `utils/progress.ts`, schemas, `project.service` (incl. `resolveTaskLink`), queries (overview, options), components |
| `src/features/ai` | `services/provider.ts` (AiProvider), `providers/{anthropic,fake}.ts`, prompts (versioned), schemas, `utils/{capacity,sanitize}.ts`, services (weekly review, recommendations, accept/reject), components |
| `src/features/jobs` | `services/job-runner.ts` (users × local-time due check × ledger claim), `services/jobs.ts` (the three jobs), `utils/{job-window,claim}.ts` |
| `src/lib/supabase/admin.ts`, `src/lib/job-route.ts` | service-role client (jobs only) and the secret-checked job endpoint wrapper |
| `src/lib/route.ts` | `runRoute()`: the Route Handler version of `runAction` (JSON + HTTP status mapping) |
| `src/features/scheduler/components` | `SchedulerWorkspace` (client state holder), `TodayTaskPanel`, `WeeklyCalendar` (FullCalendar, dynamic ssr:false), `TaskDetailDrawer`, `TodayMetricsBar`, `WorkSessionTimer` + `StopSessionDialog`, `DailyReflectionDialog`, `ScoreInput`, `DurationInsight` |
| `archive/legacy-scaffold` | parked admin/resume code; not built (ADR 0001) |

## Calendar data flow
- The page computes the local week in the profile timezone and fetches blocks for week ± 1 day, the Today tasks and the templates in parallel.
- `WeeklyCalendar` keeps a local copy of the blocks for optimistic updates. Every action calls `revalidatePath`, and the fresh server props replace the local copy.
- Drop: the temporary FC event is shown → `scheduleTaskAction` (the server sizes the block) → the temp event is replaced with the saved block, or removed with a toast on error.
- Move/resize: `moveScheduleBlockAction` → `info.revert()` on failure. Overlaps show a warning toast, never an error.

## Server Action contract
```ts
export async function doThingAction(input: unknown) {
  return runAction("thing.do", thingSchema, input, async (data, ctx) => {
    const result = await thingService.doThing(ctx, data); // throws AppError
    revalidatePath("/scheduler");
    return result;
  });
}
```
