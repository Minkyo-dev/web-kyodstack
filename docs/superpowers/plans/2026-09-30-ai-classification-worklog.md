# AI classification proposals and work-log interpretation (F1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI proposes task features (type, domain, complexity, skills) and interprets work-log notes; nothing changes a task or a stat until the user accepts/confirms; a confirmed blocker weights Calibration 0.3 (`stats-v2`); all AI calls share a 30/day cap.

**Architecture:** A budgeted wrapper `callAi(ctx, kind, req)` (cap check → provider → ledger) is used by every AI feature. Pure validators turn model output into proposal rows (`task_features`) or a work-log interpretation. Proposal actions apply values through ownership-checked updates. Interpretation runs in `after()` from the stop/note actions and nightly. The stat engine reads `confirmed_blocker` for weights.

**Tech Stack:** Next.js 16 server actions + `after()`, Supabase Postgres (RLS), Zod 4, existing `AiProvider` (Anthropic Haiku 4.5 / Fake), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-ai-classification-worklog-design.md`

## Global Constraints
- Cap: 30 AI calls per user per local day across all AI features; exceeding → `AppError("AI_BUDGET_EXCEEDED")` "오늘 AI 사용량을 다 썼어요. 내일 다시 시도해 주세요."
- Prompt/response text is never stored or logged; `ai_calls` holds kind, model, ok only.
- Task types: the 12 `TASK_TYPES`; domains only from the user's list; skills ≤ 5, 1–30 chars, lowercase.
- Proposals: `task_type`/`domain` only when empty and not previously rejected; `complexity` only when different; skills only those not already tags.
- Interpretation: notes ≥ 20 chars; ask to confirm only when `unexpectedBlocker && blockerType ∈ {technical, external} && confidence ≥ 0.6`.
- Calibration weight 0.3 for completed tasks with a `confirmed_blocker = true` log; `STATS_VERSION = "stats-v2"`.
- AI output never writes `tasks` directly; only user actions apply proposals.
- Fake provider in E2E/CI; no real API calls.
- Stage explicit paths only.

## Review Focus
1. Cap counted by the user's local day, not UTC. Test: Task 1 `localDayStartIso` used by the counter (unit on the pure range helper).
2. Model returns a domain id from another user / unknown → dropped. Test: Task 2 validator.
3. Applying a proposal must re-check domain ownership server-side. Test: Task 3 service rejects a domain id not in the user's list (unit via pure `applyPlan`).
4. Interpretation `after()` failures never affect the stop/note action. Covered by design (wrapped try/catch + log) and E2E.
5. `stats-v2` equals `stats-v1` results when no blockers exist. Test: Task 5 golden check.

---

### Task 1: DB + AI budget wrapper + input sanitizer

**Files:**
- Create: `supabase/migrations/<ts>_ai_features.sql`, `supabase/tests/rls/ai_features.sql`, `src/features/ai/services/budget.service.ts`, `src/features/ai/utils/prompt-input.ts`
- Modify: `src/lib/errors.ts` (code `AI_BUDGET_EXCEEDED`), `src/types/database.ts`, `src/features/ai/services/weekly-review.service.ts`, `src/features/ai/services/task-recommendation.service.ts`
- Test: `tests/unit/prompt-input.test.ts`

**Interfaces:**
- Produces: tables `task_features`, `ai_calls`; `work_logs.ai_interpretation/interpretation_model/interpretation_version/confirmed_blocker`;
  `AI_DAILY_CAP = 30`; `callAi<T>(ctx, kind, req: StructuredRequest<T>) → Promise<StructuredResult<T>>`;
  `sanitizeForPrompt(text: string | null, max: number) → string`.

- [ ] **Step 1: SQL test** `supabase/tests/rls/ai_features.sql`
```sql
-- F1: task_features / ai_calls RLS, one open proposal per (task, feature type), work_logs columns.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.tasks (id, user_id, title) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000a', 'A task'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-00000000000b', 'B task');
insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status)
values ('00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-b000-000000000002', 'task_type', '"coding"', 'ai', 'proposed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ begin
  insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status, confidence, model, prompt_version)
  values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000001', 'task_type', '"debugging"', 'ai', 'proposed', 0.9, 'fake-1', 'classify-v1');
  begin
    insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000001', 'task_type', '"coding"', 'ai', 'proposed');
    raise exception 'FAIL: two open proposals';
  exception when unique_violation then null; end;
  update public.task_features set status = 'rejected', decided_at = now() where task_id = '00000000-0000-4000-b000-000000000001';
  insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status)
  values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000001', 'task_type', '"coding"', 'ai', 'proposed');
  assert (select count(*) from public.task_features) = 2, 'A sees only own rows';
  begin
    insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000002', 'domain', '"x"', 'ai', 'proposed');
    raise exception 'FAIL: proposal on another user''s task';
  exception when foreign_key_violation or insufficient_privilege then null; end;
  begin
    insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000001', 'mood', '1', 'ai', 'proposed');
    raise exception 'FAIL: unknown feature type';
  exception when check_violation then null; end;
  insert into public.ai_calls (user_id, kind, model, ok) values ('00000000-0000-4000-a000-00000000000a', 'classify', 'fake-1', true);
  assert (select count(*) from public.ai_calls) = 1, 'own ai_calls';
  begin
    insert into public.ai_calls (user_id, kind, ok) values ('00000000-0000-4000-a000-00000000000b', 'classify', true);
    raise exception 'FAIL: ai_calls for another user';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'work_logs'
          and column_name in ('ai_interpretation', 'interpretation_model', 'interpretation_version', 'confirmed_blocker')) = 4, 'work_logs columns';
end $$;
rollback;
```

- [ ] **Step 2: Run before migration** — Expected: FAIL (`relation "public.task_features" does not exist`).

- [ ] **Step 3: Migration** `supabase/migrations/<ts>_ai_features.sql`
```sql
-- F1: AI feature provenance, call ledger (daily cap), work-log interpretation.
-- Spec: docs/superpowers/specs/2026-09-30-ai-classification-worklog-design.md

create table public.task_features (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null,
  feature_type text not null check (feature_type in ('task_type', 'domain', 'complexity', 'skills')),
  feature_value jsonb not null,
  source text not null check (source in ('ai', 'user', 'system')),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);
create unique index task_features_one_open on public.task_features (task_id, feature_type) where status = 'proposed';
create index task_features_user_task_idx on public.task_features (user_id, task_id);

alter table public.task_features enable row level security;
create policy task_features_select_own on public.task_features for select to authenticated using (user_id = (select auth.uid()));
create policy task_features_insert_own on public.task_features for insert to authenticated with check (user_id = (select auth.uid()));
create policy task_features_update_own on public.task_features for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.task_features from anon;
revoke delete on public.task_features from authenticated;

create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  model text,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index ai_calls_user_created_idx on public.ai_calls (user_id, created_at);
alter table public.ai_calls enable row level security;
create policy ai_calls_select_own on public.ai_calls for select to authenticated using (user_id = (select auth.uid()));
create policy ai_calls_insert_own on public.ai_calls for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on public.ai_calls from anon;
revoke update, delete on public.ai_calls from authenticated;

alter table public.work_logs
  add column ai_interpretation jsonb,
  add column interpretation_model text,
  add column interpretation_version text,
  add column confirmed_blocker boolean;
```
(`tasks(id, user_id)` is already unique — the composite FKs elsewhere rely on it.)

- [ ] **Step 4: Apply, list, rename, regenerate types; run the SQL test (Expected: completes); advisors (Expected: only known warnings).**

- [ ] **Step 5: Failing unit test** `tests/unit/prompt-input.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { sanitizeForPrompt } from "@/features/ai/utils/prompt-input";

describe("sanitizeForPrompt", () => {
  it("strips control characters, collapses whitespace and caps length", () => {
    expect(sanitizeForPrompt("a\u0000b\u0007  c\n\n d", 100)).toBe("ab c d");
    expect(sanitizeForPrompt("x".repeat(250), 200)).toHaveLength(200);
    expect(sanitizeForPrompt(null, 10)).toBe("");
  });
});
```
Run → FAIL (module not found).

- [ ] **Step 6: Implement**

`src/features/ai/utils/prompt-input.ts`
```ts
/** User text going into a prompt: no control characters, single spaces, bounded length. */
export function sanitizeForPrompt(text: string | null, max: number): string {
  if (!text) return "";
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
```

`src/lib/errors.ts`: add `"AI_BUDGET_EXCEEDED"` to `ERROR_CODES` and `AI_BUDGET_EXCEEDED: "오늘 AI 사용량을 다 썼어요. 내일 다시 시도해 주세요."` to `DEFAULT_MESSAGES`.

`src/features/ai/services/budget.service.ts`
```ts
import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { localDayRange, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { getAiProvider, type StructuredRequest, type StructuredResult } from "./provider";

export const AI_DAILY_CAP = 30;

/** Calls made today (user's local day). Explicit user_id so it also works under the service role. */
export async function aiCallsToday(ctx: ActionContext, now = new Date()): Promise<number> {
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const start = localDayRange(todayLocalDate(timezone, now), timezone).start;
  const { count, error } = await ctx.supabase
    .from("ai_calls")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .gte("created_at", start);
  if (error) throw fromDbError(error);
  return count ?? 0;
}

/** Budgeted AI call: cap check → provider → ledger row (ok or not). Never logs prompt content. */
export async function callAi<T>(ctx: ActionContext, kind: string, req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  if ((await aiCallsToday(ctx)) >= AI_DAILY_CAP) throw new AppError("AI_BUDGET_EXCEEDED");
  const provider = await getAiProvider();
  try {
    const result = await provider.generateStructured(req);
    await ctx.supabase.from("ai_calls").insert({ user_id: ctx.user.id, kind, model: result.model, ok: true });
    return result;
  } catch (error) {
    await ctx.supabase.from("ai_calls").insert({ user_id: ctx.user.id, kind, model: null, ok: false });
    throw error;
  }
}
```
Weekly review / recommendations: replace `const provider = await getAiProvider(); … provider.generateStructured({ … })` with `callAi(ctx, "weekly_review", { … })` / `callAi(ctx, "task_recommendations", { … })` (drop the now-unused `getAiProvider` import).

- [ ] **Step 7: Run** `npx tsc --noEmit && npx vitest run` — Expected: clean.

- [ ] **Step 8: Commit**
```bash
git add supabase/migrations/<version>_ai_features.sql supabase/tests/rls/ai_features.sql src/types/database.ts src/lib/errors.ts src/features/ai/services/budget.service.ts src/features/ai/utils/prompt-input.ts src/features/ai/services/weekly-review.service.ts src/features/ai/services/task-recommendation.service.ts tests/unit/prompt-input.test.ts
git commit -m "F1-1: task_features, ai_calls, work-log interpretation columns; budgeted AI calls; prompt input sanitizer"
```

---

### Task 2: Classification — prompt, schema, validator, proposal rules, service

**Files:**
- Create: `src/features/ai/prompts/classify.prompt.ts`, `src/features/ai/schemas/classify.schema.ts`, `src/features/ai/utils/classify.ts`, `src/features/ai/services/classification.service.ts`
- Modify: `src/features/ai/providers/fake.ts` (canned `classify_tasks`)
- Test: `tests/unit/classify.test.ts`

**Interfaces:**
- Produces:
  - `ClassifyOutputSchema` (`{ items: { taskId, taskType?, domainId?, complexity?, skills, confidence }[] }`)
  - `validateClassification(output, ctx: { taskIds: Set<string>; domainIds: Set<string> }) → ClassifyItem[]`
  - `proposalRows(item, task: { task_type; practice_domain_id; complexity; tagNames: string[]; rejected: Set<FeatureType> }) → { feature_type; feature_value }[]`
  - `classifyTasks(ctx, taskIds: string[]) → Promise<number>` (rows created), `FeatureType`

- [ ] **Step 1: Failing test** `tests/unit/classify.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { proposalRows, validateClassification } from "@/features/ai/utils/classify";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

describe("validateClassification", () => {
  const ctx = { taskIds: new Set([id(1), id(2)]), domainIds: new Set([id(9)]) };
  it("drops unknown tasks, types and foreign domains; normalizes skills", () => {
    const items = validateClassification(
      { items: [
        { taskId: id(1), taskType: "debugging", domainId: id(9), complexity: 4, skills: [" Airflow", "dbt", "airflow", "x".repeat(31), "a", "b", "c", "d"], confidence: 0.88 },
        { taskId: id(2), taskType: "dancing" as never, domainId: id(8), complexity: 9 as never, skills: [], confidence: 0.5 },
        { taskId: id(3), taskType: "coding", skills: [], confidence: 1 },
      ] },
      ctx,
    );
    expect(items).toEqual([
      { taskId: id(1), taskType: "debugging", domainId: id(9), complexity: 4, skills: ["airflow", "dbt", "a", "b", "c"], confidence: 0.88 },
      { taskId: id(2), taskType: null, domainId: null, complexity: null, skills: [], confidence: 0.5 },
    ]);
  });
});

describe("proposalRows", () => {
  const item = { taskId: id(1), taskType: "debugging" as const, domainId: id(9), complexity: 4, skills: ["airflow", "dbt"], confidence: 0.9 };
  it("proposes only empty fields, changed complexity and new skills", () => {
    expect(proposalRows(item, { task_type: null, practice_domain_id: null, complexity: 3, tagNames: ["dbt"], rejected: new Set() })).toEqual([
      { feature_type: "task_type", feature_value: "debugging" },
      { feature_type: "domain", feature_value: id(9) },
      { feature_type: "complexity", feature_value: 4 },
      { feature_type: "skills", feature_value: ["airflow"] },
    ]);
  });
  it("skips filled fields, rejected types, same complexity and known skills", () => {
    expect(proposalRows(item, { task_type: "coding", practice_domain_id: null, complexity: 4, tagNames: ["airflow", "dbt"], rejected: new Set(["domain"]) })).toEqual([]);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

`src/features/ai/schemas/classify.schema.ts`
```ts
import { z } from "zod";

// Loose on purpose: the validator drops what doesn't fit the user's lists instead of failing the whole batch.
export const ClassifyOutputSchema = z.object({
  items: z.array(
    z.object({
      taskId: z.string(),
      taskType: z.string().nullable().optional(),
      domainId: z.string().nullable().optional(),
      complexity: z.number().nullable().optional(),
      skills: z.array(z.string()).default([]),
      confidence: z.number().min(0).max(1),
    }),
  ).max(20),
});
export type ClassifyOutput = z.infer<typeof ClassifyOutputSchema>;
```

`src/features/ai/utils/classify.ts`
```ts
import { TASK_TYPES, type TaskType } from "@/features/classification/domain/classification.types";
import type { ClassifyOutput } from "../schemas/classify.schema";

export type FeatureType = "task_type" | "domain" | "complexity" | "skills";
export type ClassifyItem = { taskId: string; taskType: TaskType | null; domainId: string | null; complexity: number | null; skills: string[]; confidence: number };

export function validateClassification(out: ClassifyOutput, ctx: { taskIds: Set<string>; domainIds: Set<string> }): ClassifyItem[] {
  return out.items
    .filter((i) => ctx.taskIds.has(i.taskId))
    .map((i) => {
      const skills: string[] = [];
      for (const raw of i.skills) {
        const s = raw.trim().toLowerCase();
        if (s.length >= 1 && s.length <= 30 && !skills.includes(s) && skills.length < 5) skills.push(s);
      }
      return {
        taskId: i.taskId,
        taskType: i.taskType && (TASK_TYPES as readonly string[]).includes(i.taskType) ? (i.taskType as TaskType) : null,
        domainId: i.domainId && ctx.domainIds.has(i.domainId) ? i.domainId : null,
        complexity: Number.isInteger(i.complexity) && i.complexity! >= 1 && i.complexity! <= 5 ? i.complexity! : null,
        skills,
        confidence: i.confidence,
      };
    });
}

export function proposalRows(
  item: ClassifyItem,
  task: { task_type: string | null; practice_domain_id: string | null; complexity: number; tagNames: string[]; rejected: Set<FeatureType> },
): { feature_type: FeatureType; feature_value: unknown }[] {
  const rows: { feature_type: FeatureType; feature_value: unknown }[] = [];
  if (item.taskType && !task.task_type && !task.rejected.has("task_type")) rows.push({ feature_type: "task_type", feature_value: item.taskType });
  if (item.domainId && !task.practice_domain_id && !task.rejected.has("domain")) rows.push({ feature_type: "domain", feature_value: item.domainId });
  if (item.complexity !== null && item.complexity !== task.complexity && !task.rejected.has("complexity"))
    rows.push({ feature_type: "complexity", feature_value: item.complexity });
  const known = new Set(task.tagNames.map((n) => n.toLowerCase()));
  const skills = item.skills.filter((s) => !known.has(s));
  if (skills.length && !task.rejected.has("skills")) rows.push({ feature_type: "skills", feature_value: skills });
  return rows;
}
```

`src/features/ai/prompts/classify.prompt.ts`
```ts
import { TASK_TYPES } from "@/features/classification/domain/classification.types";

export const CLASSIFY_PROMPT_VERSION = "classify-v1";
export const CLASSIFY_SYSTEM = [
  "You label personal work tasks with structured features. You never judge the person.",
  `taskType must be one of: ${TASK_TYPES.join(", ")} (or null if unclear).`,
  "domainId must be one of the given domain ids (or null). Never invent ids.",
  "complexity: 1 routine, 2 simple, 3 moderate, 4 complex, 5 highly ambiguous.",
  "skills: up to 5 short lowercase tool/topic names (prefer the user's existing tag spellings).",
  "confidence: 0-1 for the whole item. Return one item per given task id.",
].join("\n");

export function classifyPrompt(input: {
  tasks: { id: string; title: string; description: string }[];
  domains: { id: string; name: string; parent: string | null }[];
  tags: string[];
}): string {
  return `Classify these tasks. Input JSON:\n${JSON.stringify(input)}`;
}
```

Fake provider: add
```ts
  classify_tasks: (prompt) => {
    const input = JSON.parse(prompt.slice(prompt.indexOf("{"))) as { tasks: { id: string }[]; domains: { id: string }[] };
    return {
      items: input.tasks.map((t) => ({ taskId: t.id, taskType: "debugging", domainId: input.domains[0]?.id ?? null, complexity: 4, skills: ["airflow", "dbt"], confidence: 0.88 })),
    };
  },
```

`src/features/ai/services/classification.service.ts`
```ts
import "server-only";
import type { ActionContext } from "@/lib/action";
import { fromDbError } from "@/lib/errors";
import { CLASSIFY_PROMPT_VERSION, CLASSIFY_SYSTEM, classifyPrompt } from "../prompts/classify.prompt";
import { ClassifyOutputSchema } from "../schemas/classify.schema";
import { proposalRows, validateClassification, type FeatureType } from "../utils/classify";
import { sanitizeForPrompt } from "../utils/prompt-input";
import { callAi } from "./budget.service";

/** Ask for features of up to 20 tasks and store them as proposals. Returns the number of proposal rows. */
export async function classifyTasks(ctx: ActionContext, taskIds: string[]): Promise<number> {
  const ids = taskIds.slice(0, 20);
  if (ids.length === 0) return 0;
  const uid = ctx.user.id;
  const [tasks, domains, tags, taskTags, rejected] = await Promise.all([
    ctx.supabase.from("tasks").select("id, title, description, task_type, practice_domain_id, complexity").eq("user_id", uid).in("id", ids),
    ctx.supabase.from("practice_domains").select("id, name, parent_id").eq("user_id", uid),
    ctx.supabase.from("tags").select("id, name").eq("user_id", uid),
    ctx.supabase.from("task_tags").select("task_id, tag_id").eq("user_id", uid).in("task_id", ids),
    ctx.supabase.from("task_features").select("task_id, feature_type").eq("user_id", uid).eq("status", "rejected").in("task_id", ids),
  ]);
  for (const r of [tasks, domains, tags, taskTags, rejected]) if (r.error) throw fromDbError(r.error);
  if (!tasks.data!.length) return 0;

  const domainName = new Map(domains.data!.map((d) => [d.id, d.name]));
  const tagName = new Map(tags.data!.map((t) => [t.id, t.name]));
  const result = await callAi(ctx, "classify", {
    task: "classify_tasks",
    system: CLASSIFY_SYSTEM,
    prompt: classifyPrompt({
      tasks: tasks.data!.map((t) => ({ id: t.id, title: sanitizeForPrompt(t.title, 200), description: sanitizeForPrompt(t.description, 500) })),
      domains: domains.data!.map((d) => ({ id: d.id, name: d.name, parent: d.parent_id ? (domainName.get(d.parent_id) ?? null) : null })),
      tags: tags.data!.map((t) => t.name).slice(0, 200),
    }),
    schema: ClassifyOutputSchema,
    effort: "low",
  });
  const items = validateClassification(result.data, {
    taskIds: new Set(tasks.data!.map((t) => t.id)),
    domainIds: new Set(domains.data!.map((d) => d.id)),
  });

  const rows = items.flatMap((item) => {
    const t = tasks.data!.find((x) => x.id === item.taskId)!;
    return proposalRows(item, {
      task_type: t.task_type,
      practice_domain_id: t.practice_domain_id,
      complexity: t.complexity,
      tagNames: taskTags.data!.filter((x) => x.task_id === t.id).map((x) => tagName.get(x.tag_id) ?? ""),
      rejected: new Set(rejected.data!.filter((r) => r.task_id === t.id).map((r) => r.feature_type as FeatureType)),
    }).map((r) => ({
      user_id: uid,
      task_id: t.id,
      feature_type: r.feature_type,
      feature_value: r.feature_value as never,
      source: "ai",
      status: "proposed",
      confidence: item.confidence,
      model: result.model,
      prompt_version: CLASSIFY_PROMPT_VERSION,
    }));
  });
  if (rows.length === 0) return 0;
  // Replace open proposals of the same types.
  for (const t of new Set(rows.map((r) => r.task_id))) {
    const types = rows.filter((r) => r.task_id === t).map((r) => r.feature_type);
    const del = await ctx.supabase.from("task_features").update({ status: "rejected", decided_at: new Date().toISOString(), source: "system" })
      .eq("user_id", uid).eq("task_id", t).eq("status", "proposed").in("feature_type", types);
    if (del.error) throw fromDbError(del.error);
  }
  const ins = await ctx.supabase.from("task_features").insert(rows);
  if (ins.error) throw fromDbError(ins.error);
  return rows.length;
}
```
(Superseded open proposals are closed as `rejected` with `source = system` so the partial unique index allows the new row; they don't count as a user rejection because the rejected-types query filters `source != 'system'` — add `.neq("source", "system")` to the `rejected` query.)

- [ ] **Step 3: Run** `npx tsc --noEmit && npx vitest run` — Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add src/features/ai/prompts/classify.prompt.ts src/features/ai/schemas/classify.schema.ts src/features/ai/utils/classify.ts src/features/ai/services/classification.service.ts src/features/ai/providers/fake.ts tests/unit/classify.test.ts
git commit -m "F1-2: classification prompt, validator, proposal rules and service"
```

---

### Task 3: Proposal UI and actions (apply / edit / ignore)

**Files:**
- Create: `src/features/ai/actions/classification.actions.ts`, `src/features/ai/schemas/proposal.schema.ts`, `src/features/ai/components/classification-proposal.tsx`, `src/features/ai/queries/proposal.queries.ts`, `src/features/ai/services/proposal.service.ts`
- Modify: `src/features/scheduler/components/task-detail-drawer.tsx`, `src/features/scheduler/components/scheduler-workspace.tsx`, `src/app/(private)/scheduler/page.tsx`, `src/features/ai/utils/classify.ts` (`proposalView`)
- Test: extend `tests/unit/classify.test.ts`

**Interfaces:**
- Produces: `Proposal = { id; featureType; value; confidence }`; `listOpenProposals(supabase, userId, taskIds) → Record<taskId, Proposal[]>`;
  `proposalView(proposals, domainNames) → { taskType?: TaskType; domainId?: string; domainName?: string; complexity?: number; skills: string[]; confidence: number | null }`;
  `applyProposals(ctx, taskId)`, `ignoreProposals(ctx, taskId)`, `settleEditedProposals(ctx, taskId)`; actions
  `requestClassificationAction({ taskId })`, `applyProposalsAction({ taskId })`, `ignoreProposalsAction({ taskId })`, `settleEditedProposalsAction({ taskId })`;
  `<ClassificationProposal taskId proposals domains onEdit />`.

- [ ] **Step 1: Failing test** (append to `classify.test.ts`)
```ts
import { proposalView } from "@/features/ai/utils/classify";

describe("proposalView", () => {
  it("merges open proposals into one chip row", () => {
    const v = proposalView([
      { id: "a", featureType: "task_type", value: "debugging", confidence: 0.88 },
      { id: "b", featureType: "domain", value: id(9), confidence: 0.88 },
      { id: "c", featureType: "skills", value: ["airflow"], confidence: 0.88 },
    ], { [id(9)]: "데이터" });
    expect(v).toEqual({ taskType: "debugging", domainId: id(9), domainName: "데이터", skills: ["airflow"], confidence: 0.88 });
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**
- `proposalView` (pure, in `utils/classify.ts`): fold rows by feature type; `confidence` = max of rows (null if none).
- `proposal.queries.ts`: `listOpenProposals` selects `id, task_id, feature_type, feature_value, confidence` with `status = 'proposed'`, `user_id`, `task_id in (…)` (chunks of 200), grouped by task id.
- `proposal.service.ts`:
  - `applyProposals(ctx, taskId)`: load open proposals for the task (own); load the task (own); load the user's domain ids. Build the patch:
    `task_type` (must be in `TASK_TYPES`), `practice_domain_id` (must be in the user's domains, else `AppError("VALIDATION_ERROR")`), `complexity` (1–5).
    Update `tasks` with `.eq("id", taskId).eq("user_id", uid)`. Skills: `ensureTags(ctx, skills)` then `setTaskTags(ctx, taskId, [...current tag ids, ...new])`.
    Mark the rows `accepted, source ai, decided_at now`.
  - `ignoreProposals(ctx, taskId)`: open rows → `rejected, decided_at now` (source stays `ai`).
  - `settleEditedProposals(ctx, taskId)`: for each open row compare with the task now (type/domain/complexity equal, or all skills present as tags):
    equal → `accepted, source user, confidence 1`; otherwise `rejected`.
- `classification.actions.ts` (all `runAction`, `revalidatePath("/scheduler", "layout")`): `requestClassificationAction` → `classifyTasks(ctx, [taskId])` (returns count);
  `applyProposalsAction`, `ignoreProposalsAction`, `settleEditedProposalsAction`. Schema `taskIdSchema = z.object({ taskId: z.uuid() })` in `proposal.schema.ts`.
- `ClassificationProposal` (client): if no open proposals → a ghost button "분류 제안 받기" (`requestClassificationAction`, success toast
  "분류 제안을 받았습니다." or "제안할 내용이 없습니다." when 0). Otherwise a bordered row:
  `SYSTEM 제안` (mono) + text `유형 {TASK_TYPE_LABEL} · 영역 {name} · 복잡도 {n} · #a #b · 신뢰도 {pct}%` + [적용] [수정] [무시].
  [수정] calls `onEdit(view)`.
- Drawer: load `proposals` + render `<ClassificationProposal>` above the edit form. `onEdit` sets a `draft` state; the edit form gets
  `key={draft ? "draft" : "task"}` and defaults from `draft ?? task` for type, domain and complexity; after a successful save with a draft, call
  `settleEditedProposalsAction` and clear the draft. Skills from the draft are shown as a hint line "제안된 태그: #a #b — 아래 태그에서 추가".
- Data: scheduler page loads `listOpenProposals(supabase, user.id, visibleTaskIds)` and passes `proposals` through the workspace to the drawer
  (prop `proposals: Record<string, Proposal[]>`).

- [ ] **Step 3: Run** `npx tsc --noEmit && npx eslint src && npx vitest run` — Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add src/features/ai/actions/classification.actions.ts src/features/ai/schemas/proposal.schema.ts src/features/ai/components/classification-proposal.tsx src/features/ai/queries/proposal.queries.ts src/features/ai/services/proposal.service.ts src/features/ai/utils/classify.ts src/features/scheduler/components/task-detail-drawer.tsx src/features/scheduler/components/scheduler-workspace.tsx "src/app/(private)/scheduler/page.tsx" tests/unit/classify.test.ts
git commit -m "F1-3: classification proposals in the task drawer (apply / edit / ignore)"
```

---

### Task 4: Work-log interpretation

**Files:**
- Create: `src/features/ai/prompts/worklog.prompt.ts`, `src/features/ai/schemas/worklog.schema.ts`, `src/features/ai/utils/worklog.ts`, `src/features/ai/services/worklog.service.ts`, `src/features/ai/actions/worklog.actions.ts`, `src/features/ai/components/worklog-interpretation.tsx`
- Modify: `src/features/ai/providers/fake.ts`, `src/features/scheduler/actions/work-session.actions.ts` (after()), `src/features/scheduler/queries/session.queries.ts` + `domain/work-session.types.ts` (work_log fields), `src/features/scheduler/components/task-detail-drawer.tsx`
- Test: `tests/unit/worklog.test.ts`

**Interfaces:**
- Produces: `WorklogOutputSchema`; `needsConfirmation(i) → boolean`; `interpretationText(i) → string`; `interpretWorkLog(ctx, sessionId) → Promise<boolean>`;
  `confirmBlockerAction({ workLogId, confirmed: boolean })`; `WorkLog` gains `ai_interpretation`, `confirmed_blocker`.

- [ ] **Step 1: Failing test** `tests/unit/worklog.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { interpretationText, needsConfirmation } from "@/features/ai/utils/worklog";

const base = { delayReason: "environment_issue" as const, scopeChanged: false, unexpectedBlocker: true, blockerType: "technical" as const, confidence: 0.91 };

describe("work-log interpretation", () => {
  it("asks only for confident technical/external blockers", () => {
    expect(needsConfirmation(base)).toBe(true);
    expect(needsConfirmation({ ...base, blockerType: "external" })).toBe(true);
    expect(needsConfirmation({ ...base, blockerType: "personal" })).toBe(false);
    expect(needsConfirmation({ ...base, unexpectedBlocker: false })).toBe(false);
    expect(needsConfirmation({ ...base, confidence: 0.59 })).toBe(false);
  });
  it("renders a short label line", () => {
    expect(interpretationText(base)).toBe("환경 문제 · 범위 변경 없음 · 예상 못한 방해");
    expect(interpretationText({ ...base, delayReason: "none", unexpectedBlocker: false, scopeChanged: true })).toBe("지연 없음 · 범위 변경");
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

`schemas/worklog.schema.ts`
```ts
import { z } from "zod";

export const DELAY_REASONS = ["environment_issue", "scope_change", "underestimate", "interruption", "unclear_requirements", "none"] as const;
export const WorklogOutputSchema = z.object({
  delayReason: z.enum(DELAY_REASONS),
  scopeChanged: z.boolean(),
  unexpectedBlocker: z.boolean(),
  blockerType: z.enum(["technical", "external", "personal", "none"]),
  confidence: z.number().min(0).max(1),
});
export type WorklogOutput = z.infer<typeof WorklogOutputSchema>;
```

`utils/worklog.ts`
```ts
import type { WorklogOutput } from "../schemas/worklog.schema";

export const DELAY_LABEL: Record<WorklogOutput["delayReason"], string> = {
  environment_issue: "환경 문제",
  scope_change: "범위 변경",
  underestimate: "예상보다 큰 작업",
  interruption: "중간 방해",
  unclear_requirements: "요구사항 불명확",
  none: "지연 없음",
};

export function needsConfirmation(i: WorklogOutput): boolean {
  return i.unexpectedBlocker && (i.blockerType === "technical" || i.blockerType === "external") && i.confidence >= 0.6;
}

export function interpretationText(i: WorklogOutput): string {
  return [DELAY_LABEL[i.delayReason], i.scopeChanged ? "범위 변경" : "범위 변경 없음", ...(i.unexpectedBlocker ? ["예상 못한 방해"] : [])]
    .filter((x, k, xs) => !(x === "범위 변경 없음" && i.delayReason === "none" && !i.unexpectedBlocker) || k === 0 || xs.length === 0)
    .join(" · ");
}
```
(If the second expectation fails with this filter, simplify: when `delayReason === "none"` omit the "범위 변경 없음" part; the test is the authority.)

`prompts/worklog.prompt.ts`
```ts
export const WORKLOG_PROMPT_VERSION = "worklog-v1";
export const WORKLOG_SYSTEM = [
  "You read a short personal work-log note and label why work took the time it did. You never judge the person.",
  "Use only the given numbers; never compute or invent new ones.",
  "delayReason: environment_issue | scope_change | underestimate | interruption | unclear_requirements | none.",
  "unexpectedBlocker: true only for something outside the plan that blocked progress.",
  "blockerType: technical | external | personal | none. confidence: 0-1.",
].join("\n");
export function worklogPrompt(input: { note: string; estimateMinutes: number | null; actualMinutes: number; ratio: number | null }): string {
  return `Interpret this work log. Input JSON:\n${JSON.stringify(input)}`;
}
```

Fake provider:
```ts
  interpret_worklog: () => ({ delayReason: "environment_issue", scopeChanged: false, unexpectedBlocker: true, blockerType: "technical", confidence: 0.91 }),
```

`services/worklog.service.ts`
```ts
import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { WORKLOG_PROMPT_VERSION, WORKLOG_SYSTEM, worklogPrompt } from "../prompts/worklog.prompt";
import { WorklogOutputSchema } from "../schemas/worklog.schema";
import { sanitizeForPrompt } from "../utils/prompt-input";
import { callAi } from "./budget.service";

const MIN_NOTE = 20;

/** Interpret the session's work-log note once. Returns whether an interpretation was stored. Never throws. */
export async function interpretWorkLog(ctx: ActionContext, sessionId: string): Promise<boolean> {
  try {
    const { data: wl, error } = await ctx.supabase
      .from("work_logs")
      .select("id, task_id, note, ai_interpretation")
      .eq("user_id", ctx.user.id)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!wl || wl.ai_interpretation || (wl.note ?? "").trim().length < MIN_NOTE) return false;
    const { data: pa } = await ctx.supabase.from("task_plan_actual").select("user_estimated_minutes, actual_minutes").eq("user_id", ctx.user.id).eq("task_id", wl.task_id).maybeSingle();
    const estimate = pa?.user_estimated_minutes ?? null;
    const actual = Math.round(Number(pa?.actual_minutes ?? 0));
    const result = await callAi(ctx, "interpret_worklog", {
      task: "interpret_worklog",
      system: WORKLOG_SYSTEM,
      prompt: worklogPrompt({ note: sanitizeForPrompt(wl.note, 1000), estimateMinutes: estimate, actualMinutes: actual, ratio: estimate ? Math.round((actual / estimate) * 100) / 100 : null }),
      schema: WorklogOutputSchema,
      effort: "low",
    });
    const up = await ctx.supabase
      .from("work_logs")
      .update({ ai_interpretation: result.data, interpretation_model: result.model, interpretation_version: WORKLOG_PROMPT_VERSION })
      .eq("id", wl.id)
      .eq("user_id", ctx.user.id);
    if (up.error) throw fromDbError(up.error);
    return true;
  } catch (error) {
    log({ action: "ai.interpret_worklog", userId: ctx.user.id, success: false, errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR" });
    return false;
  }
}

export async function confirmBlocker(ctx: ActionContext, workLogId: string, confirmed: boolean): Promise<void> {
  const { data, error } = await ctx.supabase.from("work_logs").update({ confirmed_blocker: confirmed }).eq("id", workLogId).eq("user_id", ctx.user.id).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new AppError("NOT_FOUND");
}
```

Actions: `worklog.actions.ts` → `confirmBlockerAction` (schema `{ workLogId: z.uuid(), confirmed: z.boolean() }`, revalidate `/scheduler` layout).
`work-session.actions.ts`: in `stopWorkSessionAction` and `saveWorkLogNoteAction` handlers, after the service call, schedule
`after(() => interpretWorkLog(ctx, data.sessionId))` (import `after` from `next/server`; `ctx` is the action context).
Session query: add `ai_interpretation, confirmed_blocker` to the `work_log` embed; `WorkLog` type gains
`ai_interpretation: WorklogOutput | null; confirmed_blocker: boolean | null` (import the type from `features/ai/schemas/worklog.schema`).
`WorklogInterpretation` (client, in `features/ai/components`): props `workLogId, note, interpretation, confirmed`. Shows the note (muted, line-clamp 2),
then `SYSTEM 해석 · {interpretationText}`; when `needsConfirmation` → `"{DELAY_LABEL}로 늦어진 것 같아요. 외부 방해로 표시할까요?"` with [표시] [아니요]
(or the answered state: `외부 방해로 표시됨 · [취소]` / `표시 안 함 · [변경]`).
Drawer: in each session row, under the times, render `<WorklogInterpretation>` when `x.work_log?.note`.

- [ ] **Step 3: Run** `npx tsc --noEmit && npx eslint src && npx vitest run` — Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add src/features/ai/prompts/worklog.prompt.ts src/features/ai/schemas/worklog.schema.ts src/features/ai/utils/worklog.ts src/features/ai/services/worklog.service.ts src/features/ai/actions/worklog.actions.ts src/features/ai/components/worklog-interpretation.tsx src/features/ai/providers/fake.ts src/features/scheduler/actions/work-session.actions.ts src/features/scheduler/queries/session.queries.ts src/features/scheduler/domain/work-session.types.ts src/features/scheduler/components/task-detail-drawer.tsx tests/unit/worklog.test.ts
git commit -m "F1-4: work-log interpretation after stop/note, blocker confirmation in the drawer"
```

---

### Task 5: Calibration weight (`stats-v2`) and the progress card

**Files:**
- Modify: `src/features/analytics/domain/stats.types.ts`, `src/features/analytics/utils/stats.ts`, `src/features/analytics/queries/stat-input.queries.ts`, `src/app/(private)/scheduler/progress/page.tsx`
- Test: `tests/unit/stats.test.ts` (extend)

**Interfaces:**
- `StatInput.calibration[i].blocker: boolean`; `Stats.calibration.blockerCount: number`; `STATS_VERSION = "stats-v2"`.

- [ ] **Step 1: Failing tests** (append to `tests/unit/stats.test.ts`, reusing its existing fixture helpers for calibration samples; read the file first and follow its helper names)
  - Two completed tasks P=60: A=60 (score 100), A=120 (score 50). Without blockers `calibration.value` follows the unweighted mean of all
    samples (existing fixtures unchanged → golden: every existing expectation still passes).
  - Same data with the second task `blocker: true` and enough samples to clear `STAT_MIN.calibration`: value = round((Σ w·s)/(Σ w)) where the
    blocker sample has w = 0.3; `blockerCount = 1`; `sampleCount` still counts both.
  - `STATS_VERSION === "stats-v2"`.
  Run → FAIL.
- [ ] **Step 2: Implement**
  - Types: `calibration` items gain `blocker: boolean`; `Stats["calibration"]` gains `blockerCount: number`.
  - `computeStats`: keep `calSamples` with `weight: c.blocker ? 0.3 : 1`. Overall value =
    `calSamples.length >= STAT_MIN.calibration ? Math.round(Σ w·score / Σ w) : null`; `sampleCount = calSamples.length`; `blockerCount = calSamples.filter((s) => s.weight < 1).length`;
    per-type uses the same weighted mean. Bias/typicalError medians unchanged. `STATS_VERSION = "stats-v2"`.
  - Loader: for the completed task ids, query `work_logs` (`task_id`, `confirmed_blocker = true`, `user_id`) in chunks and set `blocker`.
  - Progress page Calibration card `detail`: append `` ` · 외부 방해 ${n}건은 가중치 0.3` `` when `blockerCount > 0`.
- [ ] **Step 3: Run** `npx tsc --noEmit && npx vitest run` — Expected: all pass (existing stats tests unchanged).
- [ ] **Step 4: Commit**
```bash
git add src/features/analytics/domain/stats.types.ts src/features/analytics/utils/stats.ts src/features/analytics/queries/stat-input.queries.ts "src/app/(private)/scheduler/progress/page.tsx" tests/unit/stats.test.ts
git commit -m "F1-5: confirmed blockers weight Calibration 0.3 (stats-v2)"
```

---

### Task 6: Nightly batch

**Files:**
- Create: `src/features/ai/services/ai-nightly.service.ts`
- Modify: `src/features/jobs/services/jobs.ts`

- [ ] **Step 1: Implement** `runAiNightly(ctx) → { classified: number; interpreted: number }`:
  - Classification: open tasks (`status not in (completed,cancelled)`) with `task_type is null or practice_domain_id is null`, no open proposal
    (exclude ids present in `task_features` with `status = 'proposed'`), oldest first, 20 → `classifyTasks`.
  - Interpretation: sessions ended in the last 2 local days whose work log has a note ≥ 20 chars and no interpretation, up to 5 → `interpretWorkLog` each.
  - Every query filters `user_id`; `AI_BUDGET_EXCEEDED` stops the remaining work silently (logged).
  - Skip entirely when `AI_PROVIDER` is not configured (no key and not fake) — reuse `getAiProvider` failure → return zeros.
  In `runDurationProfileRefresh` add `const ai = await runAiNightly(ctx).catch(() => ({ classified: 0, interpreted: 0 }));` and include `ai` in `detail`.
- [ ] **Step 2: Run** `npx tsc --noEmit && npx vitest run` — Expected: clean.
- [ ] **Step 3: Commit**
```bash
git add src/features/ai/services/ai-nightly.service.ts src/features/jobs/services/jobs.ts
git commit -m "F1-6: nightly classification batch and interpretation catch-up"
```

---

### Task 7: E2E, docs, full verification

**Files:**
- Create: `tests/e2e/ai-classification.spec.ts`, `docs/decisions/0018-ai-features-and-budget.md`
- Modify: `docs/decisions/README.md`, `docs/progress.md`, `docs/schema.md`, `docs/architecture.md`

- [ ] **Step 1: E2E** (runs against the dev server with `AI_PROVIDER=fake`, as the existing AI spec does — check `ai-recommendations.spec.ts` for how it ensures the fake provider):
  1. Seed `[e2e] 분류 ${stamp}` (no type/domain) and an `E2E 도메인 ${stamp}` practice domain. Open the task drawer → [분류 제안 받기] →
     chip row "SYSTEM 제안" contains `유형 디버깅` → [적용] → drawer type select shows 디버깅, domain select the seeded domain, tags include `#airflow`.
  2. Seed `[e2e] 무시 ${stamp}` → request → [무시] → no chip row and the button is back; requesting again yields "제안할 내용이 없습니다." for the
     rejected types (complexity/skills may still propose — assert type is not proposed).
  3. Seed a task + start/stop a timer through the UI with a note of 20+ chars in the summary dialog → reopen the drawer (poll with reload up to 20 s)
     → `SYSTEM 해석 · 환경 문제` and the question → [표시] → `외부 방해로 표시됨`.
  4. Cleanup: helpers `cleanup` already deletes `[e2e]` tasks (cascades proposals/work logs) and `E2E%` domains; delete `e2e`-created tags
     (`airflow`, `dbt`) only if they were created during the test (record existing tag ids before).
- [ ] **Step 2: Run the spec** — Expected: PASS.
- [ ] **Step 3: Docs** — ADR 0018 (spec §7), README row `| 0018 | AI features: proposals, work-log interpretation, budget | accepted |`, progress F1 checklist, schema rows, architecture line.
- [ ] **Step 4: Full verification** — tsc, eslint, vitest, build (check tsc again afterwards; if `.next/dev` is corrupted: stop the dev server by PID, delete `.next/dev`, restart), all E2E (15 specs), DB check (no `[e2e]` rows, no leftover proposals).
- [ ] **Step 5: Commit + push**
```bash
git add tests/e2e/ai-classification.spec.ts docs/decisions/0018-ai-features-and-budget.md docs/decisions/README.md docs/progress.md docs/schema.md docs/architecture.md
git commit -m "F1-7: AI classification/work-log E2E; ADR 0018, docs"
git push
```
