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
| `/finance?mode=monthly\|yearly&year=&month=` | (private) | household finance dashboard (ADR 0025) with "재정 현황" balances (ADR 0032); without a household the finance layout shows onboarding |
| `/finance/calendar?month=yyyy-MM&date=yyyy-MM-dd` | (private) | daily totals grid + Day Drawer (date is a shallow URL update) + day panel: totals, the day's transactions, entry grid (ADR 0028) + "자산 흐름" net-worth chart and account table (ADR 0032) |
| `/finance/transactions?from&to&type&category&account&paidBy&min&max&q` | (private) | search / filter list (GET form) |
| `/finance/transactions/bulk` | (private) | bulk entry grid for expenses / income (ADR 0027) |
| `/finance/recurring` | (private) | recurring payments: plans, next due date, monthly total (ADR 0029) |
| `/finance/settings/{accounts,categories,household}` | (private) | finance settings |
| `GET/POST /api/internal/jobs/{daily-planner,weekly-review,duration-profile-refresh,finance-subscriptions}` | route handlers | cron jobs (Bearer secret, service role; ADR 0010) |

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
| `src/features/ai` | `services/provider.ts` (AiProvider), `providers/{anthropic,fake}.ts`, prompts (versioned), schemas, `utils/{capacity,sanitize}.ts`, services (weekly review, recommendations, accept/reject), components; F1: `budget.service` (`callAi`, 30/day), classification (`classify.prompt`, `utils/classify`, `classification.service`, `proposal.service`, `ClassificationProposal`), work-log interpretation (`worklog.service` via `after()`, `WorklogInterpretation`), `ai-nightly.service`; F2: `utils/analysis` (slot, evidence check), `analysis.service` + `SystemAnalysisCard`, `quest-picker.service` (plain-data picker passed to gamification by the jobs layer) |
| `src/features/gamification` | XP rules/level/practice level (`utils`), day-fact loader and ledger queries, `progress.service` (`evaluateProgress`, `reconcileProgress`, `enableGamification`), `ProgressNotifier`, `LevelLine`, `LevelUpEvent`, progress-page player section; E2 quests (`quest-rules`, `quest.service`, `QuestPanel` passed into the scheduler as a slot), achievements/titles (`achievement.service`). Only the action layer, the app layer and the jobs service import it. Terms live in `src/lib/terms.ts` + `src/hooks/use-terms.ts` (`TermsProvider` in the private layout). |
| `src/features/direction` | purpose → protocol hierarchy: pure `domain/{breadcrumb,link-rules}`, schemas, `direction.service` (CRUD, `switch_path` RPC, `resolveDirectionLink`), queries (directive, mission detail, picker options), directive-page components, `DirectionPicker`, `DirectionBreadcrumb`; G2 habits: pure `domain/habits`, `habit.service` (create/update, today's tick, `syncFocusChecks` on page load + nightly), `habit.queries`, `HabitSection` (directive page), `HabitPanel` (passed to the scheduler as the `habitPanel` slot); G3 status: pure `domain/status` + `status-text` (deny-listed wording), `status.queries` (`loadDirectionStatus`), `DirectionStatus` on the progress page; G4: pure `domain/diagnosis` (`diagnosis-v1`), `DiagnosisQuestion` (navigate-only choices), and the numbers-only `direction` block in the F2 analysis input (`analysis-v2`, `directionNote`). `scheduler` and `projects` services call `resolveDirectionLink`; `direction` imports neither. |
| `src/features/jobs` | `services/job-runner.ts` (users × local-time due check × ledger claim), `services/jobs.ts` (the three jobs), `utils/{job-window,claim}.ts` |
| `src/lib/supabase/admin.ts`, `src/lib/job-route.ts` | service-role client (jobs only) and the secret-checked job endpoint wrapper |
| `src/lib/route.ts` | `runRoute()`: the Route Handler version of `runAction` (JSON + HTTP status mapping) |
| `src/features/scheduler/components` | `SchedulerWorkspace` (client state holder), `TodayTaskPanel`, `WeeklyCalendar` / `MonthlyCalendar` (FullCalendar timeGrid / dayGrid, dynamic ssr:false; `?view=month`, ADR 0024), `TaskDetailDrawer`, `TodayMetricsBar`, `WorkSessionTimer` + `StopSessionDialog`, `DailyReflectionDialog`, `ScoreInput`, `DurationInsight` |
| `src/features/finance` | household finance (ADR 0025): pure `domain/{money,period,aggregate,category-tree,bulk-entry,subscription,balances,account-groups}`, `schemas`, `queries/household.queries` (`getFinanceContext` (also records due subscription charges), `getFinanceLookups`, per-request cached) and `finance.queries` (SQL aggregates, day/recent/filtered rows), `services/{household,account,category,transaction,subscription,balance,dashboard}` (household id always from the membership), one `actions/finance.actions.ts`, components (`FinanceProvider` with the lookups from the finance layout, `TransactionForm`, `TransactionDetail`, `DayDrawer`, `FinanceCalendar`, `BulkEntryGrid`, `CashFlowChart`, dashboard sections, settings) |
| `archive/legacy-scaffold` | parked admin/resume code; not built (ADR 0001) |

## Calendar data flow
- The page computes the local week in the profile timezone and fetches blocks for week ± 1 day, the Today tasks and the templates in parallel.
- Page help: `src/lib/page-help.ts` (texts, terminology-aware) + `src/components/layout/page-help.tsx` (hover/click popover) next to each private page title.
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
