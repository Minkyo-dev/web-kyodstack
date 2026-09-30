<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Next 16 differences that matter in this repo:
- `middleware.ts` is now `proxy.ts`. Here it lives at `src/proxy.ts` and exports `proxy`.
- `params`, `searchParams`, `cookies()` and `headers()` are async. Always `await` them.
- Server Action cache APIs from `next/cache`: `revalidatePath`, `updateTag` (read-your-writes) and `refresh()`. `revalidateTag` takes a second `cacheLife` argument.
- Turbopack is the default bundler. `next lint` is gone, so run `eslint` directly.

# Project

This is a personal site with a public portfolio/blog and authenticated private utilities. The first private utility is the **Work Scheduler**.

**Source of truth:** `docs/personal-work-scheduler-design.md`. Read the relevant sections before you change scheduler code. When the code and the spec disagree, follow the spec or record an ADR in `docs/decisions/`.

Other docs:
- `docs/progress.md`: the phase checklist. Update it when you finish a step.
- `docs/architecture.md`: how this repo is actually laid out.
- `docs/schema.md`: tables, invariants and metric definitions.
- `docs/decisions/`: ADRs for deviations from the spec and for non-obvious choices.

# Core invariants (do not break)

- Task ≠ ScheduleBlock ≠ WorkSession. Never put `start_at`/`end_at` on `tasks`.
- Planned time (`schedule_blocks`) and actual time (`work_sessions`) never overwrite each other.
- Every schedule block move or resize writes a `schedule_block_revisions` row in the same transaction. Do it through the DB function, not two separate client calls.
- Every user-owned table has RLS with `user_id = auth.uid()` policies. UI redirects are not authorization.
- Every mutation follows this path: Zod validation → get the authenticated user → service → typed `ActionResult`. Never accept `user_id` from the client.
- The service layer checks ownership of related IDs (project, milestone, template).
- All instants are `timestamptz`. Grouping by local day or week uses the user's `profiles.timezone` (default `America/Toronto`). Never hard-code a UTC offset.
- `task_duration_profiles` is derived data and must stay rebuildable.
- AI is advisory. Its output is Zod-validated and goes into `ai_recommendations` / `weekly_reviews`, never directly into `tasks`.
- Deterministic stats come from SQL/TypeScript, never from the LLM.
- The service role key and AI keys are server-only. Never give them a `NEXT_PUBLIC_` prefix.
- `createAdminClient()` (service role) is for `/api/internal/jobs/*` only, and every query it reaches must filter by `user_id` explicitly.
- Never return raw Supabase or provider errors to the browser. Map them to `AppError` codes.

# Code layout

```
src/app/(public)     public pages; must NOT import from src/features/scheduler
src/app/(auth)       /login
src/app/(private)    authenticated shell: /dashboard, /scheduler/*
src/features/<name>  components / actions / queries / services / schemas / domain / utils
src/lib              supabase clients, env, errors, logger
supabase/migrations  all DB changes (never edit an applied migration; add a new one)
supabase/tests/rls   SQL RLS tests
```

Dependency direction: `app → feature components → actions/queries/services → lib`. Services never import React or browser-only code. Components never make raw DB calls.

- Default to Server Components. Use `"use client"` only for interactive leaves (calendar, drag/drop, timer, dialogs).
- No Redux/Zustand. No new catch-all `utils/` folder.
- Pin exact versions (no `^`) for newly added packages.
- UI uses shadcn/ui on Base UI (`@base-ui/react`) with Tailwind v4. Keep it flat and dense, with subtle borders and radius ≤ 8px. Never show status by color alone.

# Database workflow

There is only the remote Supabase project (`xgjmfmypoadblvzlmfqh`). There is no local Docker DB.
1. Write the migration in `supabase/migrations/<timestamp>_<name>.sql`.
2. Apply it with the Supabase MCP `apply_migration`, using the same name. Then run `list_migrations` and rename the local file to the version the remote assigned, so the histories match.
3. Regenerate `src/types/database.ts` with the MCP `generate_typescript_types`.
4. Run the RLS tests in `supabase/tests/rls/`. Each one runs in a transaction and ends with `rollback`.
5. Run the MCP `get_advisors` (security) and fix any new warnings.

# Verification before claiming done

```
npx tsc --noEmit
npx eslint .
npx vitest run
npm run build
E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e   # needs NEXT_PUBLIC_* in env (source .env.local)
```
E2E data must use the `[e2e]` title prefix, so the suite's cleanup can delete it.
For UI changes, also exercise them in the browser (next-devtools / Playwright MCP) before you report them as working.

# Working style

- Implement in the order given in spec §71. Do not start AI work before the core scheduler works.
- Take small steps and update `docs/progress.md` as each one lands.
- Record every deviation from the spec as an ADR.
