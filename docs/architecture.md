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
| `/scheduler/directive?mission=` | (private) | tab "습관" (ADR 0038): vision + roles, 변화 cards with setup progress, the new-change wizard, the five-step 습관 설계도 of the selected change (first active by default), stand-alone habits |
| `/scheduler/progress` | (private) | tab "성장": 상태창, 성취 로그, achievements/titles, goal status, stats (ADR 0037) |
| `/scheduler/manual` | (private) | static user manual (`features/manual`); all `/scheduler/*` pages share the "플래너" tab bar (`scheduler/layout.tsx`) |
| `POST /api/ai/weekly-review`, `POST /api/ai/daily-recommendations` | route handlers | generation (auth via cookie, `runRoute`) |
| `/finance?mode=monthly\|yearly&year=&month=` | (private) | household finance dashboard (ADR 0025) with "재정 현황" balances (ADR 0032); without a household the finance layout shows onboarding |
| `/finance/calendar?month=yyyy-MM&date=yyyy-MM-dd` | (private) | daily totals grid + Day Drawer (date is a shallow URL update) + day panel: totals, the day's transactions, entry grid (ADR 0028) + "자산 흐름" net-worth chart and account table (ADR 0032) |
| `/finance/transactions?from&to&type&category&account&paidBy&min&max&q` | (private) | search / filter list (GET form) |
| `/finance/transactions/bulk` | (private) | bulk entry grid for expenses / income (ADR 0027) |
| `/finance/recurring` | (private) | recurring payments: plans, next due date, monthly total (ADR 0029) |
| `/finance/settings/{accounts,categories,budgets,household}` | (private) | finance settings; budgets per month `?month=yyyy-MM` (ADR 0033) |
| `/english` | (private) | 단어장 home (ADR 0046): connect card, reconnect banner, or the linked Notion DB |
| `/english/words?q&topic&level&status` | (private) | word list from the mirror (filters in the URL), quick add (write-through to Notion), drawer edit/delete, [지금 동기화]; page entry pulls in `after()` when the mirror is > 5 min old |
| `/english/words/bulk` | (private) | bulk add: paste ≤ 200 lines (`parseBulk`), duplicate flags, [AI로 빈 칸 채우기] (20 terms per call), write-through one by one with per-row results |
| `/english/review?scope=all\|topic:<name>` | (private) | FSRS flashcard session (`ReviewSession`): Space/1–4/Z/D/E/P/Esc, interval previews, recall typing with a suggested rating, TTS, in-session requeue (≤ 20 min), summary; the queue is built on the server once |
| `/english/practice?words=` | (private) | AI 연습 set builder (source: topic / today's reviews / hard words / manual; 5–10 sentences; CEFR A1–C2) and history |
| `/english/practice/[id]` | (private) | `PracticeSession`: Korean sentence → English answer → feedback (verdict, target usage, word diff, corrections, natural sentence, alternatives with nuance); ≤ 3 attempts per sentence |
| `/english/stats` | (private) | 12-week review heatmap, streak, 30-day recall rate, card states, topics (SQL `vocab_review_days` + pure `domain/stats`) |
| `/english/settings?setup&error` | (private) | Notion connection: pick a shared page → create "Kyod 단어장", schema check/repair, reconnect, disconnect |
| `GET/POST /api/internal/jobs/vocab-sync` | route handler | nightly Notion reconcile for every ready connection (full pull + deletions; service role, explicit user ids) |
| `GET /api/notion/connect`, `GET /api/notion/callback` | route handlers | Notion OAuth; `state` bound to an httpOnly cookie on `/api/notion`; the connection is always the session user's |
| `GET/POST /api/internal/jobs/{daily-planner,weekly-review,duration-profile-refresh,finance-subscriptions}` | route handlers | cron jobs (Bearer secret, service role; ADR 0010; finance-subscriptions also pays cards, ADR 0034) |

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
| `src/features/ai` | `services/provider.ts` (AiProvider; default Gemini, ADR 0041), `providers/{gemini,anthropic,fake}.ts`, prompts (versioned), schemas, `utils/{capacity,sanitize}.ts`, services (weekly review, recommendations, accept/reject), components; F1: `budget.service` (`callAi`, 30/day), classification (`classify.prompt`, `utils/classify`, `classification.service`, `proposal.service`, `ClassificationProposal`), work-log interpretation (`worklog.service` via `after()`, `WorklogInterpretation`), `ai-nightly.service`; F2: `utils/analysis` (slot, evidence check), `analysis.service` + `SystemAnalysisCard`, `quest-picker.service` (plain-data picker passed to gamification by the jobs layer) |
| `src/features/assistant` | assistant P1 (ADR 0039): `domain/brief` (pure `buildBrief`, `pickOneThing`, `toBriefTasks`), `queries/brief.queries` (yesterday's check-in and habits, next 변화 step, cached line), `services/brief-line.service` (`ensureBriefLine`, budgeted, via `after()`), `BriefCard` rendered by the today panel; P2 (ADR 0040): `domain/coach` (pure `coach-v1`), `queries/coach.queries`, `services/proposal.service` (`ensureWeeklyCoaching`, `applyProposal`, `dismissProposal`), `CoachingSection` on 주간 회고; P3 (ADR 0042): `domain/chat` (snapshot text, output schema, `normalizeChatProposals`), `queries/chat.queries` (`loadChatSnapshot`, `loadChatPanel`), `services/chat.service` (`sendChatMessage`, `clearChat`), `ChatPanel` rendered by `scheduler/layout.tsx`; P4 (ADR 0043): `domain/notify` (pure `notify-v1`), `services/{push,notify,subscription}.service`, `NotificationSettingsDialog` (scheduler ⚙ → 알림), job `/api/internal/jobs/notifications` (Supabase Cron every 5 min), `public/sw.js`, `app/manifest.ts`; P5 (ADR 0044): `domain/learning` (`learn-v1`), `domain/slot` (`slot-v1`, `pickSlotDay`), `coach-v2` in `domain/coach`, `queries/learning.queries` (`loadLearningLog`), `LearningLog` (배운 것) on 주간 회고; `direction/domain/forecast` (`forecast-v1`) in the 변화 현황 card |
| `src/features/gamification` | XP rules/level/practice level (`utils`), day-fact loader and ledger queries, `progress.service` (`evaluateProgress`, `reconcileProgress`, `enableGamification`), `ProgressNotifier`, `LevelLine`, `LevelUpEvent`, progress-page 상태창 (level, rank `rankFor`) and 성취 로그 (`utils/achievement-log`, `queries/achievement-log.queries`, `AchievementLog`; derived, ADR 0037); E2 quests (`quest-rules`, `quest.service`, `QuestPanel` passed into the scheduler as a slot), achievements/titles (`achievement.service`). Only the action layer, the app layer and the jobs service import it. Labels live in `src/lib/terms.ts` as one `TERMS` constant (ADR 0037: work vocabulary; no quest toggle, no provider). |
| `src/features/direction` | purpose → protocol hierarchy: pure `domain/{breadcrumb,link-rules}`, schemas, `direction.service` (CRUD, `switch_path` RPC, `resolveDirectionLink`), queries (directive, mission detail, picker options), directive-page components, `DirectionPicker`, `DirectionBreadcrumb`; G2 habits: pure `domain/habits`, `habit.service` (create/update, today's tick, `syncFocusChecks` on page load + nightly), `habit.queries`, `HabitSection` (directive page), `HabitPanel` (passed to the scheduler as the `habitPanel` slot); G3 status: pure `domain/status` + `status-text` (deny-listed wording), `status.queries` (`loadDirectionStatus`), `DirectionStatus` on the progress page; G4: pure `domain/diagnosis` (`diagnosis-v1`), `DiagnosisQuestion` (navigate-only choices), and the numbers-only `direction` block in the F2 analysis input (`analysis-v2`, `directionNote`). `scheduler` and `projects` services call `resolveDirectionLink`; `direction` imports neither. |
| `src/features/jobs` | `services/job-runner.ts` (users × local-time due check × ledger claim), `services/jobs.ts` (the three jobs), `utils/{job-window,claim}.ts` |
| `src/lib/notion` | Notion boundary (ADR 0046): `types.ts` (`NotionGateway`), `client-gateway.ts` (`@notionhq/client`, `Notion-Version 2026-03-11`, SDK retries), `fake-gateway.ts` (`NOTION_GATEWAY=fake`), `errors.ts` (→ `AppError`), `mapping.ts`, `token-crypto.ts` (AES-256-GCM), `oauth-state.ts`; factory `index.ts` (`getNotionGateway`, `notionTokenKey`, `notionRedirectUri`). Knows nothing about vocabulary. |
| `src/features/vocab` | 단어장 (ADR 0046, spec `2026-10-05-vocab-notion-design.md`): pure `domain/{notion-schema,connection}`, `services/connection.service` (`withNotion`: decrypt → refresh once on 401 → reauth), `services/setup.service` (create DB, inspect/repair schema), `actions/connection.actions`, components (`EnglishNav`, `ConnectCard`, `DatabaseSetup`, `ConnectionPanel`, `ReauthBanner`); V1: `domain/{word-mapping,sync}`, `services/word.service` (write-through create/update/delete, `upsertPages` → RPC `vocab_upsert_words`), `services/sync.service` (`pullChanges`, `reconcile`, `maybePull`, `reconcileAll`), `queries/word.queries`, `actions/word.actions`, `WordTable` (+ drawer), `QuickAdd`, `WordForm`, `WordFilters`, `SyncButton`, `TopicCards`. Services take `VocabCtx = { supabase, user: { id } }` and filter `user_id` explicitly so the job reuses them. V2: `domain/{srs,queue,status,answer-match}` (`srs.ts` is the only `ts-fsrs` importer), `services/{review,settings,outbox}.service` (RPCs `vocab_apply_review`, `vocab_undo_review`, `vocab_enqueue_writeback`; the outbox writes 상태/다음 복습 to Notion after a session, on page entry and nightly), `actions/review.actions`, `ReviewSession`, `TodayCard`, `StudySettingsForm`, `WritebackStatus`. V3: `domain/stats` (buckets, forecast, streak, heatmap, recall rate), `services/{stats,reminder}.service`, `DueOutlook`, `StatsView`, `ReminderForm`; the assistant's `notify-v2` adds `vocab_due` with facts from `vocabReminderFacts`. V4: `ai/enrich.{prompt,schema}` (`vocab-enrich-v1`), `domain/{enrich,bulk-parse}`, `services/enrich.service`, `WordForm` [AI 채우기] (fills empty inputs only), `BulkAdd`; `features/ai/utils/budget-pools` (`vocab.*` kinds: 60/day; others 30); `lib/notion/throttle` (334 ms per token). V5: `ai/practice.{prompt,schema}` (`vocab-practice-gen-v1`, `vocab-practice-feedback-v1`, refs `w1…` instead of ids), `domain/{cefr,practice,word-diff}`, `services/practice.service` (RPC `vocab_create_practice`), `actions/practice.actions`, `PracticeBuilder`, `PracticeSession`; the review summary links "틀린 단어로 AI 연습". V6: gamification XP rule `vocab` (facts from `vocab_reviews` in `loadXpRaw`; `finishSessionAction` runs `evaluateProgress`). |
| `src/lib/supabase/admin.ts`, `src/lib/job-route.ts` | service-role client (jobs only) and the secret-checked job endpoint wrapper |
| `src/lib/route.ts` | `runRoute()`: the Route Handler version of `runAction` (JSON + HTTP status mapping) |
| `src/features/scheduler/components` | `SchedulerWorkspace` (client state holder), `TodayTaskPanel`, `WeeklyCalendar` / `MonthlyCalendar` (FullCalendar timeGrid / dayGrid, dynamic ssr:false; `?view=month`, ADR 0024), `TaskDetailDrawer`, `TodayMetricsBar`, `WorkSessionTimer` + `StopSessionDialog`, `DailyReflectionDialog`, `ScoreInput`, `DurationInsight` |
| `src/features/finance` | household finance (ADR 0025): pure `domain/{money,period,aggregate,category-tree,bulk-entry,subscription,balances,budgets,account-groups}`, `schemas`, `queries/household.queries` (`getFinanceContext` (also records due subscription charges), `getFinanceLookups`, per-request cached) and `finance.queries` (SQL aggregates, day/recent/filtered rows), `services/{household,account,category,transaction,subscription,balance,budget,dashboard}` (household id always from the membership), one `actions/finance.actions.ts`, components (`FinanceProvider` with the lookups from the finance layout, `TransactionForm`, `TransactionDetail`, `DayDrawer`, `FinanceCalendar`, `BulkEntryGrid`, `CashFlowChart`, dashboard sections, settings) |
| `src/components/brand/logo.tsx`, `scripts/brand-assets.mjs` | brand (ADR 0045): `LogoMark` (light/dark variants); the script derives favicon, app icons and marks from `public/web-kyodstack-logo.png`; palette tokens `--brand-ink`, `--brand`, `--brand-soft` in `globals.css` |
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
