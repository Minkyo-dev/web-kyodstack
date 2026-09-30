# Classification + Recommendation v2 (Sub-project D1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify tasks by fixed type, hierarchical practice domain and free tags. Learn durations per
type×domain / type / tag, and recommend a duration with a range, confidence and reason. Quick add supports
inline `#tag` / `@domain`.

**Architecture:**
- **Data.** New tables `practice_domains`, `tags`, `task_tags`, `template_tags`, `duration_groups` (derived).
  Template names are backfilled as tags, so learning continues through the tag fallback.
- **Pure logic.** The recommendation lives in `utils/estimator.ts` (v2), and quick-add parsing in
  `features/classification/utils/quick-add.ts`.
- **Services.** `duration-groups.service.ts` rebuilds a user's groups (bounded: the 500 most recent completed
  tasks). New feature folder `src/features/classification` holds tags/domains/templates and the UI pieces.

**Tech Stack:** Next.js 16, React 19, Supabase Postgres + RLS (remote via MCP), Zod 4, Vitest, Playwright,
shadcn/ui on Base UI.

**Spec:** `docs/superpowers/specs/2026-09-30-classification-recommendation-design.md`. Read it first.

## Global Constraints

- `AGENTS.md` rules. DB workflow:
  1. Write the migration file.
  2. Apply it with MCP `apply_migration`.
  3. Run `list_migrations` and rename the file to the remote version.
  4. Regenerate the types.
  5. Run the SQL tests via `execute_sql`.
  6. Run `get_advisors`.
- Mutations: Zod → `runAction` → service → `ActionResult`. Never take `user_id` from the client. Services check
  ownership of related ids; composite FKs enforce it too.
- `task_duration_profiles` → `duration_groups` stays **derived and rebuildable**. A refresh failure never fails
  the primary write.
- Stats/AI never compute durations; this is deterministic TS.
- Status/labels by text, never color alone (tag colors are decoration; the chip always shows the name).
- UI copy Korean. E2E data uses the `[e2e]` prefix, and cleanup also deletes `[e2e]` tags and domains.
- Stage only files you changed (`git add <paths>`), never whole folders: the user edits files in parallel.
- Before each commit: `npx tsc --noEmit && npx eslint . && npx vitest run`. The final task also runs
  `npm run build` and the E2E suite (dev server on :3000).

**Plan-level ruling (spec deviation):** existing template names contain spaces and punctuation
("[e2e] Technical Blog"), so a **tag name is 1–100 trimmed characters without `#` or `,`**. The inline `#token`
syntax only matches `[\p{L}\p{N}_-]+`. Names with spaces are attached through autocomplete (which adds a chip
instead of inserting text) or the drawer's tag editor. Record this in ADR 0013.

## Review Focus

1. **Enter while the autocomplete list is open** must pick the item, not submit the task. → Task 6 E2E step.
2. **A title that is only tokens** ("#a @b") must be rejected with "제목을 입력해 주세요." and create nothing.
   → Task 2 unit test; the service re-validates after parsing (Task 5).
3. **Re-parenting a domain under its own descendant** must be rejected, with no cycle stored.
   → Task 5 service test through SQL-free logic `wouldCycle` (Task 2 unit test).
4. **A task with a template and no type** must still get a recommendation through the template-name tag.
   → Task 3 unit test "tag fallback"; the duration-learning E2E (Task 8).
5. **Deleting a tag used by tasks** removes only links, never tasks. → Task 1 SQL test.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_classification.sql` | type columns, domains, tags, joins, duration_groups, backfill |
| `supabase/migrations/<ts>_drop_duration_profiles.sql` | contract (Task 8) |
| `supabase/tests/rls/classification.sql` | SQL tests |
| `src/features/classification/domain/classification.types.ts` | `TASK_TYPES`, `TASK_TYPE_LABEL`, `TAG_COLORS`, types |
| `src/features/classification/utils/quick-add.ts` | `parseQuickAdd`, `wouldCycle`, `normalizeName` |
| `src/features/classification/schemas/classification.schema.ts` | Zod |
| `src/features/classification/services/classification.service.ts` | tags, domains, templates, classify task, ensure-by-name |
| `src/features/classification/actions/classification.actions.ts` | server actions |
| `src/features/classification/queries/classification.queries.ts` | list tags/domains/templates (+counts) |
| `src/features/classification/components/*` | `TagChips`, `TagEditor`, `DomainSelect`, `TypeSelect`, `TokenInput`, `ClassificationDialog`, `TagFilter`, `TemplateTypeBanner` |
| `src/features/scheduler/utils/estimator.ts` | v2 recommendation (replaces v1) |
| `src/features/scheduler/services/duration-groups.service.ts` | load / rebuild / rebuildQuietly (replaces duration-profile.service) |
| `src/features/scheduler/queries/select.ts`, `domain/task.types.ts` | task carries type/domain/tags |
| `src/features/scheduler/schemas/task.schema.ts`, `services/task.service.ts` | classification on create/update |
| scheduler components (panel, list item, drawer, insight, workspace, calendar) | display + input |
| `src/app/(private)/scheduler/page.tsx`, projects context/queries/detail, AI recommendation service, jobs | groups instead of profiles |
| `tests/unit/quick-add.test.ts`, `tests/unit/estimator.test.ts` (rewrite), `tests/e2e/classification.spec.ts`, `tests/e2e/duration-learning.spec.ts`, `tests/e2e/helpers.ts` | tests |
| `docs/schema.md`, `docs/decisions/0013-classification-and-estimator-v2.md`, README, `docs/progress.md` | docs |

---

### Task 1: Migration — classification tables, duration groups, template backfill

**Files:**
- Create: `supabase/tests/rls/classification.sql`
- Create: `supabase/migrations/20260930160000_classification.sql` (renamed after apply)
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces:
  - Tables `practice_domains`, `tags`, `task_tags`, `template_tags`, `duration_groups`.
  - Columns `tasks.task_type`, `tasks.practice_domain_id`, `task_templates.task_type`,
    `task_templates.practice_domain_id`.
  - FK names (PostgREST embeds): `tasks_practice_domain_id_user_id_fkey`, `task_tags_task_id_user_id_fkey`,
    `task_tags_tag_id_user_id_fkey`, `template_tags_template_id_user_id_fkey`, `template_tags_tag_id_user_id_fkey`.

- [ ] **Step 1: Write the SQL test** `supabase/tests/rls/classification.sql`

```sql
-- Classification: domains, tags, joins, duration_groups, template backfill, RLS.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
insert into public.tags (id, user_id, name) values ('80000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'b-tag');
insert into public.practice_domains (id, user_id, name) values ('90000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'B Domain');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
insert into public.tasks (id, user_id, title) values ('a0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'A task');

do $$
declare n int;
begin
  -- A sees none of B's rows
  assert (select count(*) from public.tags) = 0, 'A sees no B tags';
  assert (select count(*) from public.practice_domains) = 0, 'A sees no B domains';

  -- domains: hierarchy, case-insensitive unique, set null on delete
  insert into public.practice_domains (id, user_id, name)
  values ('90000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Data Engineering');
  insert into public.practice_domains (id, user_id, name, parent_id)
  values ('90000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-00000000000a', 'Snowflake',
          '90000000-0000-4000-a000-00000000000a');
  begin
    insert into public.practice_domains (user_id, name) values ('00000000-0000-4000-a000-00000000000a', 'snowflake');
    raise exception 'FAIL: case-insensitive duplicate domain';
  exception when unique_violation then null;
  end;
  begin
    insert into public.practice_domains (user_id, name, parent_id)
    values ('00000000-0000-4000-a000-00000000000a', 'x', '90000000-0000-4000-a000-00000000000b');
    raise exception 'FAIL: parent from another user';
  exception when foreign_key_violation then null;
  end;

  -- task classification + cross-user rejection
  update public.tasks set task_type = 'coding', practice_domain_id = '90000000-0000-4000-a000-0000000000a2'
   where id = 'a0000000-0000-4000-a000-00000000000a';
  begin
    update public.tasks set task_type = 'gaming' where id = 'a0000000-0000-4000-a000-00000000000a';
    raise exception 'FAIL: unknown task type';
  exception when check_violation then null;
  end;
  begin
    update public.tasks set practice_domain_id = '90000000-0000-4000-a000-00000000000b'
     where id = 'a0000000-0000-4000-a000-00000000000a';
    raise exception 'FAIL: B domain on A task';
  exception when foreign_key_violation then null;
  end;

  -- tags + links; deleting a tag keeps the task
  insert into public.tags (id, user_id, name) values ('80000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Snowflake');
  begin
    insert into public.tags (user_id, name) values ('00000000-0000-4000-a000-00000000000a', 'SNOWFLAKE');
    raise exception 'FAIL: case-insensitive duplicate tag';
  exception when unique_violation then null;
  end;
  begin
    insert into public.tags (user_id, name) values ('00000000-0000-4000-a000-00000000000a', 'bad#name');
    raise exception 'FAIL: # in tag name';
  exception when check_violation then null;
  end;
  insert into public.task_tags (task_id, tag_id, user_id)
  values ('a0000000-0000-4000-a000-00000000000a', '80000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a');
  begin
    insert into public.task_tags (task_id, tag_id, user_id)
    values ('a0000000-0000-4000-a000-00000000000a', '80000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000a');
    raise exception 'FAIL: B tag on A task';
  exception when foreign_key_violation then null;
  end;
  delete from public.tags where id = '80000000-0000-4000-a000-00000000000a';
  assert (select count(*) from public.task_tags) = 0, 'links removed with the tag';
  assert (select count(*) from public.tasks where id = 'a0000000-0000-4000-a000-00000000000a') = 1, 'task kept';

  -- deleting a domain nulls the task's domain
  delete from public.practice_domains where id = '90000000-0000-4000-a000-0000000000a2';
  assert (select practice_domain_id from public.tasks where id = 'a0000000-0000-4000-a000-00000000000a') is null,
    'domain set null';

  -- duration_groups: own rows only
  insert into public.duration_groups (user_id, group_key, samples, sample_count)
  values ('00000000-0000-4000-a000-00000000000a', 'type:coding', '[]'::jsonb, 0);
  begin
    insert into public.duration_groups (user_id, group_key, samples, sample_count)
    values ('00000000-0000-4000-a000-00000000000b', 'type:coding', '[]'::jsonb, 0);
    raise exception 'FAIL: group as B';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Backfill function (the same code the migration ran): template → tag + links, idempotent.
insert into public.task_templates (id, user_id, name)
values ('b0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Technical Blog');
update public.tasks set template_id = 'b0000000-0000-4000-a000-00000000000a' where id = 'a0000000-0000-4000-a000-00000000000a';
select public.backfill_template_tags('00000000-0000-4000-a000-00000000000a');
select public.backfill_template_tags('00000000-0000-4000-a000-00000000000a');
do $$
begin
  assert (select count(*) from public.tags where name = 'Technical Blog') = 1, 'one tag per template';
  assert (select count(*) from public.template_tags) = 1, 'template linked once';
  assert (select count(*) from public.task_tags) = 1, 'task linked once';
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.tags limit 1;
    raise exception 'FAIL: anon read tags';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select 'PASS classification' as result;
rollback;
```

- [ ] **Step 2: Run to verify it fails**

MCP `execute_sql`. Expected: `relation "public.tags" does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20260930160000_classification.sql`

```sql
-- Classification + recommendation v2 (sub-project D1).
-- Spec: docs/superpowers/specs/2026-09-30-classification-recommendation-design.md

-- Fixed task types
alter table public.tasks add column task_type text
  check (task_type in ('reading','study','coding','debugging','documentation','writing','meeting','planning','design','research','exercise','other'));
alter table public.task_templates add column task_type text
  check (task_type in ('reading','study','coding','debugging','documentation','writing','meeting','planning','design','research','exercise','other'));

-- Practice domains (user-owned tree)
create table public.practice_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60 and position('@' in name) = 0),
  parent_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_id, user_id) references public.practice_domains(id, user_id) on delete set null (parent_id),
  check (parent_id is null or parent_id <> id)
);
create unique index practice_domains_user_name_idx on public.practice_domains (user_id, lower(name));
create index practice_domains_parent_idx on public.practice_domains (parent_id, user_id);

alter table public.tasks add column practice_domain_id uuid;
alter table public.tasks add foreign key (practice_domain_id, user_id)
  references public.practice_domains(id, user_id) on delete set null (practice_domain_id);
create index tasks_domain_user_idx on public.tasks (practice_domain_id, user_id);
alter table public.task_templates add column practice_domain_id uuid;
alter table public.task_templates add foreign key (practice_domain_id, user_id)
  references public.practice_domains(id, user_id) on delete set null (practice_domain_id);

-- Tags
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100 and name !~ '[#,]'),
  color text check (color in ('gray','red','orange','yellow','green','blue','purple','pink')),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index tags_user_name_idx on public.tags (user_id, lower(name));

create table public.task_tags (
  task_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, tag_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags(id, user_id) on delete cascade
);
create index task_tags_tag_user_idx on public.task_tags (tag_id, user_id);
create index task_tags_task_user_idx on public.task_tags (task_id, user_id);

create table public.template_tags (
  template_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (template_id, tag_id),
  foreign key (template_id, user_id) references public.task_templates(id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags(id, user_id) on delete cascade
);
create index template_tags_tag_user_idx on public.template_tags (tag_id, user_id);
create index template_tags_template_user_idx on public.template_tags (template_id, user_id);

-- Derived duration history per group (rebuildable cache).
create table public.duration_groups (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_key text not null check (group_key ~ '^(type:[a-z]+(\|domain:[0-9a-f-]{36})?|tag:[0-9a-f-]{36})$'),
  samples jsonb not null default '[]'::jsonb,
  sample_count integer not null default 0 check (sample_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, group_key)
);

-- RLS
alter table public.practice_domains enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.template_tags enable row level security;
alter table public.duration_groups enable row level security;

do $$
declare t text;
begin
  foreach t in array array['practice_domains', 'tags', 'duration_groups'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
  foreach t in array array['task_tags', 'template_tags'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end;
$$;
revoke all on public.practice_domains, public.tags, public.task_tags, public.template_tags, public.duration_groups from anon;

-- Template names → tags (idempotent). Kept as a function so the SQL test exercises the same code.
create or replace function public.backfill_template_tags(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.tags (user_id, name)
  select t.user_id, left(regexp_replace(trim(t.name), '[#,]', '', 'g'), 100)
    from public.task_templates t
   where t.user_id = p_user_id
     and length(trim(regexp_replace(t.name, '[#,]', '', 'g'))) > 0
  on conflict (user_id, lower(name)) do nothing;

  insert into public.template_tags (template_id, tag_id, user_id)
  select t.id, g.id, t.user_id
    from public.task_templates t
    join public.tags g
      on g.user_id = t.user_id and lower(g.name) = lower(left(regexp_replace(trim(t.name), '[#,]', '', 'g'), 100))
   where t.user_id = p_user_id
  on conflict do nothing;

  insert into public.task_tags (task_id, tag_id, user_id)
  select k.id, tt.tag_id, k.user_id
    from public.tasks k
    join public.template_tags tt on tt.template_id = k.template_id and tt.user_id = k.user_id
   where k.user_id = p_user_id
  on conflict do nothing;
end;
$$;
revoke execute on function public.backfill_template_tags(uuid) from public, anon, authenticated;

do $$
declare u uuid;
begin
  for u in select distinct user_id from public.task_templates loop
    perform public.backfill_template_tags(u);
  end loop;
end;
$$;
```
**Note for Step 1's test:** the test calls `backfill_template_tags` as `authenticated`, but the migration revokes
execute from `authenticated`. In the test, run those two calls after `reset role;` (as the owner), then re-enter
`set local role authenticated` with A's claims for the assertions. Edit the test accordingly before running it.

The `on conflict (user_id, lower(name))` target needs the unique expression index. Postgres accepts an inference
on it when written exactly as `(user_id, lower(name))`.

- [ ] **Step 4: Apply, rename, regenerate**

Apply with MCP `apply_migration` (name `classification`). Run `list_migrations` and `git mv` the file to the
remote version. Regenerate the types into `src/types/database.ts`.

- [ ] **Step 5: Run the SQL tests**

Run `classification.sql` (expected `PASS classification`) and re-run `scheduler_core.sql` (expected PASS).
Run `get_advisors`. Expected: no new warnings beyond the generic GraphQL visibility.

Check the backfill on real data:
```sql
select (select count(*) from public.task_templates) as templates,
       (select count(*) from public.template_tags) as template_links,
       (select count(*) from public.tasks where template_id is not null) as templated_tasks,
       (select count(*) from public.task_tags) as task_links;
```
Expected: `template_links = templates` and `task_links = templated_tasks`.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit
git add supabase/migrations/<version>_classification.sql supabase/tests/rls/classification.sql src/types/database.ts
git commit -m "D1-1: task types, practice domains, tags, duration groups; template names backfilled as tags"
```

---

### Task 2: Pure classification utilities

**Files:**
- Create: `src/features/classification/domain/classification.types.ts`
- Create: `src/features/classification/utils/quick-add.ts`
- Test: `tests/unit/quick-add.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const TASK_TYPES: readonly ["reading","study","coding","debugging","documentation","writing","meeting","planning","design","research","exercise","other"];
  export type TaskType = (typeof TASK_TYPES)[number];
  export const TASK_TYPE_LABEL: Record<TaskType, string>;
  export const TAG_COLORS: readonly ["gray","red","orange","yellow","green","blue","purple","pink"];
  export type TagColor = (typeof TAG_COLORS)[number];
  export type TagRef = { id: string; name: string; color: TagColor | null };
  export type DomainRef = { id: string; name: string; parent_id: string | null };
  export function parseQuickAdd(input: string): { title: string; tags: string[]; domain: string | null };
  export function activeToken(input: string, caret: number): { kind: "#" | "@"; query: string; start: number } | null;
  export function wouldCycle(domains: DomainRef[], id: string, newParentId: string | null): boolean;
  export function sameName(a: string, b: string): boolean; // case-insensitive, trimmed
  ```

- [ ] **Step 1: Write the failing tests** `tests/unit/quick-add.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { activeToken, parseQuickAdd, sameName, wouldCycle } from "@/features/classification/utils/quick-add";

describe("parseQuickAdd", () => {
  it("extracts #tags and @domain, keeps the rest as the title", () => {
    expect(parseQuickAdd("Snowflake RBAC 공부 #snowflake @DataEng")).toEqual({
      title: "Snowflake RBAC 공부",
      tags: ["snowflake"],
      domain: "DataEng",
    });
  });
  it("supports Korean, digits, - and _ in tokens; tokens anywhere", () => {
    expect(parseQuickAdd("#영어 듣기 연습 #listening_2 @어학")).toEqual({
      title: "듣기 연습",
      tags: ["영어", "listening_2"],
      domain: "어학",
    });
  });
  it("an email address is not a domain token", () => {
    expect(parseQuickAdd("메일 보내기 a@b.com")).toEqual({ title: "메일 보내기 a@b.com", tags: [], domain: null });
  });
  it("the last @ wins; tags are deduplicated case-insensitively", () => {
    expect(parseQuickAdd("x #A #a @one @two")).toEqual({ title: "x", tags: ["A"], domain: "two" });
  });
  it("only tokens → empty title (the caller rejects it)", () => {
    expect(parseQuickAdd("#a @b").title).toBe("");
  });
  it("a lone # or @ stays in the title", () => {
    expect(parseQuickAdd("C# 공부 @ 집")).toEqual({ title: "C# 공부 @ 집", tags: [], domain: null });
  });
});

describe("activeToken (autocomplete trigger)", () => {
  it("finds the token under the caret", () => {
    expect(activeToken("공부 #sno", 7)).toEqual({ kind: "#", query: "sno", start: 3 });
    expect(activeToken("공부 @", 4)).toEqual({ kind: "@", query: "", start: 3 });
  });
  it("none inside a word or after a space", () => {
    expect(activeToken("a@b", 3)).toBeNull();
    expect(activeToken("#abc ", 5)).toBeNull();
  });
});

describe("wouldCycle", () => {
  const d = [
    { id: "root", name: "Root", parent_id: null },
    { id: "mid", name: "Mid", parent_id: "root" },
    { id: "leaf", name: "Leaf", parent_id: "mid" },
  ];
  it("rejects a descendant or itself as the new parent", () => {
    expect(wouldCycle(d, "root", "leaf")).toBe(true);
    expect(wouldCycle(d, "mid", "mid")).toBe(true);
  });
  it("allows other parents and none", () => {
    expect(wouldCycle(d, "leaf", "root")).toBe(false);
    expect(wouldCycle(d, "mid", null)).toBe(false);
  });
});

describe("sameName", () => {
  it("case-insensitive and trimmed", () => {
    expect(sameName(" Snowflake", "snowflake ")).toBe(true);
    expect(sameName("a", "b")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`npx vitest run tests/unit/quick-add.test.ts`. Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement**

`src/features/classification/domain/classification.types.ts`:
```ts
export const TASK_TYPES = [
  "reading",
  "study",
  "coding",
  "debugging",
  "documentation",
  "writing",
  "meeting",
  "planning",
  "design",
  "research",
  "exercise",
  "other",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  reading: "읽기",
  study: "공부",
  coding: "코딩",
  debugging: "디버깅",
  documentation: "문서화",
  writing: "글쓰기",
  meeting: "회의",
  planning: "계획",
  design: "디자인",
  research: "조사",
  exercise: "운동",
  other: "기타",
};

export const TAG_COLORS = ["gray", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export type TagRef = { id: string; name: string; color: TagColor | null };
export type DomainRef = { id: string; name: string; parent_id: string | null };
```

`src/features/classification/utils/quick-add.ts`:
```ts
/** Quick-add syntax (D1 spec §3): "#tag" and "@domain" tokens at a word start. Pure. */
import type { DomainRef } from "../domain/classification.types";

const TOKEN = /(^|\s)([#@])([\p{L}\p{N}_-]+)/gu;

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function parseQuickAdd(input: string): { title: string; tags: string[]; domain: string | null } {
  const tags: string[] = [];
  let domain: string | null = null;
  const title = input
    .replace(TOKEN, (_m, lead: string, kind: string, name: string) => {
      if (kind === "#") {
        if (!tags.some((t) => sameName(t, name))) tags.push(name);
      } else {
        domain = name;
      }
      return lead;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { title, tags, domain };
}

/** The "#…" / "@…" token being typed at `caret`, for autocomplete. */
export function activeToken(input: string, caret: number): { kind: "#" | "@"; query: string; start: number } | null {
  const before = input.slice(0, caret);
  const m = /(^|\s)([#@])([\p{L}\p{N}_-]*)$/u.exec(before);
  if (!m) return null;
  return { kind: m[2] as "#" | "@", query: m[3], start: before.length - m[3].length - 1 };
}

/** True when `newParentId` is `id` itself or one of its descendants. */
export function wouldCycle(domains: DomainRef[], id: string, newParentId: string | null): boolean {
  let cur = newParentId;
  const byId = new Map(domains.map((d) => [d.id, d]));
  for (let guard = 0; cur && guard < 1000; guard++) {
    if (cur === id) return true;
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return false;
}
```

- [ ] **Step 4: Run to verify it passes**

`npx vitest run tests/unit/quick-add.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/classification/domain/classification.types.ts src/features/classification/utils/quick-add.ts tests/unit/quick-add.test.ts
git commit -m "D1-2: quick-add parsing, autocomplete token, domain cycle check"
```

---

### Task 3: Estimator v2 (pure)

**Files:**
- Modify (rewrite): `src/features/scheduler/utils/estimator.ts`
- Rewrite: `tests/unit/estimator.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ESTIMATOR_VERSION = "v2";
  export const MIN_SAMPLES = 3;
  export const MAX_SAMPLES = 20;
  export type GroupSample = { base: number | null; actual: number; completed_at: string };
  export type DurationGroup = { group_key: string; samples: GroupSample[]; sample_count: number };
  export type EstimatorTask = {
    user_estimated_minutes: number | null;
    task_type: string | null;
    practice_domain_id: string | null;
    template: { default_estimate_minutes: number | null } | null;
    tags: { id: string; name: string }[];
  };
  export type GroupLabels = { typeLabel: (t: string) => string; domainName: (id: string) => string | null };
  export type DurationEstimate = {
    minutes: number; baseMinutes: number; baseSource: "user" | "template" | "generic";
    range: { low: number; high: number } | null;
    confidence: "high" | "medium" | "low" | "none";
    sampleCount: number;
    scope: "type_domain" | "type" | "tag" | "none";
    reason: string | null;
  };
  export function groupKeysFor(task: Pick<EstimatorTask, "task_type" | "practice_domain_id" | "tags">): string[];
  export function toGroupSample(c: { actualMinutes: number; userEstimatedMinutes: number | null; templateDefaultMinutes: number | null; completedAt: string | null }): GroupSample | null;
  export function buildGroupSamples(samples: GroupSample[]): GroupSample[]; // 20 most recent, newest first
  export function estimateDuration(task: EstimatorTask, settings: BlockDurationSettings, groups: DurationGroup[], labels?: GroupLabels): DurationEstimate;
  export function median(xs: number[]): number | null;
  export function percentile(xs: number[], p: number): number | null;
  ```

- [ ] **Step 1: Rewrite the tests** `tests/unit/estimator.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  buildGroupSamples,
  estimateDuration,
  groupKeysFor,
  median,
  percentile,
  toGroupSample,
  type DurationGroup,
  type GroupSample,
} from "@/features/scheduler/utils/estimator";

const settings = { min_block_minutes: 15, max_focus_block_minutes: 240 };
const s = (actual: number, base: number | null = null, i = 0): GroupSample => ({
  base,
  actual,
  completed_at: `2026-09-${String(10 + i).padStart(2, "0")}T12:00:00Z`,
});
const group = (key: string, samples: GroupSample[]): DurationGroup => ({ group_key: key, samples, sample_count: samples.length });
const task = (over: Partial<Parameters<typeof estimateDuration>[0]> = {}) => ({
  user_estimated_minutes: null,
  task_type: "coding",
  practice_domain_id: "d1",
  template: null,
  tags: [],
  ...over,
});
const labels = { typeLabel: (t: string) => (t === "coding" ? "코딩" : t), domainName: (id: string) => (id === "d1" ? "Data Eng" : null) };

describe("statistics", () => {
  it("median and percentile", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(percentile([10, 20, 30, 40], 0.25)).toBe(17.5);
  });
});

describe("groupKeysFor", () => {
  it("type×domain, type, then each tag", () => {
    expect(groupKeysFor({ task_type: "coding", practice_domain_id: "d1", tags: [{ id: "t1", name: "x" }] })).toEqual([
      "type:coding|domain:d1",
      "type:coding",
      "tag:t1",
    ]);
    expect(groupKeysFor({ task_type: null, practice_domain_id: "d1", tags: [] })).toEqual([]);
  });
});

describe("toGroupSample / buildGroupSamples", () => {
  it("keeps plausible actuals; base from user or template (generic is null)", () => {
    expect(toGroupSample({ actualMinutes: 50, userEstimatedMinutes: 60, templateDefaultMinutes: null, completedAt: "2026-09-01T00:00:00Z" }))
      .toEqual({ base: 60, actual: 50, completed_at: "2026-09-01T00:00:00Z" });
    expect(toGroupSample({ actualMinutes: 50, userEstimatedMinutes: null, templateDefaultMinutes: null, completedAt: "2026-09-01T00:00:00Z" })!.base)
      .toBeNull();
    expect(toGroupSample({ actualMinutes: 0, userEstimatedMinutes: 60, templateDefaultMinutes: null, completedAt: "2026-09-01T00:00:00Z" })).toBeNull();
    expect(toGroupSample({ actualMinutes: 17 * 60, userEstimatedMinutes: 60, templateDefaultMinutes: null, completedAt: "2026-09-01T00:00:00Z" })).toBeNull();
  });
  it("keeps the 20 most recent, newest first", () => {
    const many = Array.from({ length: 25 }, (_, i) => s(30 + i, null, i % 20));
    const kept = buildGroupSamples(many);
    expect(kept.length).toBe(20);
    expect(kept[0].completed_at >= kept[19].completed_at).toBe(true);
  });
});

describe("estimateDuration v2", () => {
  it("requirements §46: 59,62,61,58,60 → 60, high", () => {
    const g = group("type:coding|domain:d1", [59, 62, 61, 58, 60].map((a, i) => s(a, null, i)));
    const e = estimateDuration(task(), settings, [g], labels);
    expect(e).toMatchObject({ minutes: 60, confidence: "high", scope: "type_domain", sampleCount: 5 });
    expect(e.reason).toBe("코딩 · Data Eng 비슷한 작업 5개");
  });
  it("requirements §46: 30,95,42,120,55 → low, range 40–95", () => {
    const g = group("type:coding|domain:d1", [30, 95, 42, 120, 55].map((a, i) => s(a, null, i)));
    const e = estimateDuration(task(), settings, [g], labels);
    expect(e.confidence).toBe("low");
    expect(e.range).toEqual({ low: 40, high: 95 });
    expect(e.minutes).toBe(55); // no estimate → median
  });
  it("low confidence with a user estimate drops at the estimate", () => {
    const g = group("type:coding|domain:d1", [30, 95, 42, 120, 55].map((a, i) => s(a, 60, i)));
    expect(estimateDuration(task({ user_estimated_minutes: 60 }), settings, [g], labels).minutes).toBe(60);
  });
  it("with an estimate: estimate × median(actual/base), ratios clamped [0.5, 3]", () => {
    const g = group("type:coding|domain:d1", [s(80, 60, 0), s(80, 60, 1), s(80, 60, 2)]);
    const e = estimateDuration(task({ user_estimated_minutes: 60 }), settings, [g], labels);
    expect(e.minutes).toBe(80);
    expect(e.confidence).toBe("medium");
  });
  it("falls back: type×domain < 3 → type", () => {
    const groups = [
      group("type:coding|domain:d1", [s(50, null, 0)]),
      group("type:coding", [s(40, null, 0), s(40, null, 1), s(40, null, 2)]),
    ];
    const e = estimateDuration(task(), settings, groups, labels);
    expect(e).toMatchObject({ scope: "type", minutes: 40, reason: "코딩 작업 3개" });
  });
  it("tag fallback when there is no type (template-name tags keep learning)", () => {
    const t = task({ task_type: null, practice_domain_id: null, user_estimated_minutes: 60, tags: [{ id: "t1", name: "Technical Blog" }] });
    const g = group("tag:t1", [s(80, 60, 0), s(80, 60, 1), s(80, 60, 2)]);
    const e = estimateDuration(t, settings, [g], labels);
    expect(e).toMatchObject({ scope: "tag", minutes: 80, reason: "#Technical Blog 태그 작업 3개" });
  });
  it("picks the tag with the most samples", () => {
    const t = task({ task_type: null, practice_domain_id: null, tags: [{ id: "a", name: "A" }, { id: "b", name: "B" }] });
    const groups = [
      group("tag:a", [s(30, null, 0), s(30, null, 1), s(30, null, 2)]),
      group("tag:b", [s(90, null, 0), s(90, null, 1), s(90, null, 2), s(90, null, 3)]),
    ];
    expect(estimateDuration(t, settings, groups, labels).minutes).toBe(90);
  });
  it("none: base estimate only, rounded and clamped", () => {
    const e = estimateDuration(task({ user_estimated_minutes: 7 }), settings, [], labels);
    expect(e).toMatchObject({ scope: "none", confidence: "none", minutes: 15, range: null, reason: null });
  });
  it("samples without base don't count for a task that has an estimate", () => {
    const g = group("type:coding|domain:d1", [s(80, null, 0), s(80, null, 1), s(80, null, 2)]);
    expect(estimateDuration(task({ user_estimated_minutes: 60 }), settings, [g], labels).scope).toBe("none");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`npx vitest run tests/unit/estimator.test.ts`. Expected: FAIL, the new exports are missing.

- [ ] **Step 3: Rewrite `estimator.ts`**

```ts
/**
 * Personal duration estimator v2 (D1 spec §2). Pure and deterministic: no LLM, no I/O.
 * Groups: type×domain → type → tag (most samples) → none. duration_groups is a rebuildable cache.
 */
import { recommendBlockMinutes, resolveBaseEstimate, type BlockDurationSettings } from "./duration";

export const ESTIMATOR_VERSION = "v2";
export const MIN_SAMPLES = 3;
export const MAX_SAMPLES = 20;
export const RATIO_CLAMP = [0.5, 3.0] as const;
const MIN_ACTUAL_MINUTES = 1;
const MAX_ACTUAL_MINUTES = 16 * 60;
const STEP = 5;

export type GroupSample = { base: number | null; actual: number; completed_at: string };
export type DurationGroup = { group_key: string; samples: GroupSample[]; sample_count: number };
export type EstimatorTask = {
  user_estimated_minutes: number | null;
  task_type: string | null;
  practice_domain_id: string | null;
  template: { default_estimate_minutes: number | null } | null;
  tags: { id: string; name: string }[];
};
export type GroupLabels = { typeLabel: (t: string) => string; domainName: (id: string) => string | null };
export type DurationEstimate = {
  minutes: number;
  baseMinutes: number;
  baseSource: "user" | "template" | "generic";
  range: { low: number; high: number } | null;
  confidence: "high" | "medium" | "low" | "none";
  sampleCount: number;
  scope: "type_domain" | "type" | "tag" | "none";
  reason: string | null;
};

export function median(xs: number[]): number | null {
  return percentile(xs, 0.5);
}

/** Linear-interpolated percentile (p in [0, 1]). */
export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

export function groupKeysFor(task: Pick<EstimatorTask, "task_type" | "practice_domain_id" | "tags">): string[] {
  const keys: string[] = [];
  if (task.task_type) {
    if (task.practice_domain_id) keys.push(`type:${task.task_type}|domain:${task.practice_domain_id}`);
    keys.push(`type:${task.task_type}`);
  }
  for (const t of task.tags) keys.push(`tag:${t.id}`);
  return keys;
}

export function toGroupSample(c: {
  actualMinutes: number;
  userEstimatedMinutes: number | null;
  templateDefaultMinutes: number | null;
  completedAt: string | null;
}): GroupSample | null {
  if (!c.completedAt) return null;
  if (!(c.actualMinutes >= MIN_ACTUAL_MINUTES) || c.actualMinutes > MAX_ACTUAL_MINUTES) return null;
  const base = resolveBaseEstimate({
    userEstimatedMinutes: c.userEstimatedMinutes,
    templateDefaultMinutes: c.templateDefaultMinutes,
  });
  return {
    base: base.source === "generic" ? null : base.minutes,
    actual: Math.round(c.actualMinutes * 100) / 100,
    completed_at: c.completedAt,
  };
}

export function buildGroupSamples(samples: GroupSample[]): GroupSample[] {
  return [...samples].sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, MAX_SAMPLES);
}

/** The quantity each sample contributes for this task: minutes the task would take. */
function values(samples: GroupSample[], taskBase: number | null): number[] {
  if (taskBase !== null) {
    return samples.filter((s) => s.base !== null && s.base > 0).map((s) => taskBase * clamp(s.actual / s.base!, RATIO_CLAMP));
  }
  return samples.map((s) => s.actual);
}

export function estimateDuration(
  task: EstimatorTask,
  settings: BlockDurationSettings,
  groups: DurationGroup[],
  labels: GroupLabels = { typeLabel: (t) => t, domainName: () => null },
): DurationEstimate {
  const base = resolveBaseEstimate({
    userEstimatedMinutes: task.user_estimated_minutes,
    templateDefaultMinutes: task.template?.default_estimate_minutes ?? null,
  });
  const taskBase = base.source === "generic" ? null : base.minutes;
  const byKey = new Map(groups.map((g) => [g.group_key, g]));

  const usable = (key: string) => {
    const g = byKey.get(key);
    const v = g ? values(g.samples, taskBase) : [];
    return v.length >= MIN_SAMPLES ? v : null;
  };

  let chosen: { scope: DurationEstimate["scope"]; v: number[]; reasonHead: string } | null = null;
  if (task.task_type && task.practice_domain_id) {
    const v = usable(`type:${task.task_type}|domain:${task.practice_domain_id}`);
    const dn = labels.domainName(task.practice_domain_id);
    if (v) chosen = { scope: "type_domain", v, reasonHead: `${labels.typeLabel(task.task_type)} · ${dn ?? "영역"} 비슷한 작업` };
  }
  if (!chosen && task.task_type) {
    const v = usable(`type:${task.task_type}`);
    if (v) chosen = { scope: "type", v, reasonHead: `${labels.typeLabel(task.task_type)} 작업` };
  }
  if (!chosen) {
    const best = task.tags
      .map((t) => ({ t, v: usable(`tag:${t.id}`) }))
      .filter((x): x is { t: { id: string; name: string }; v: number[] } => x.v !== null)
      .sort((a, b) => b.v.length - a.v.length)[0];
    if (best) chosen = { scope: "tag", v: best.v, reasonHead: `#${best.t.name} 태그 작업` };
  }

  if (!chosen) {
    return {
      minutes: recommendBlockMinutes(base.minutes, settings),
      baseMinutes: base.minutes,
      baseSource: base.source,
      range: null,
      confidence: "none",
      sampleCount: 0,
      scope: "none",
      reason: null,
    };
  }

  const med = median(chosen.v)!;
  const p25 = percentile(chosen.v, 0.25)!;
  const p75 = percentile(chosen.v, 0.75)!;
  const spread = med > 0 ? (p75 - p25) / med : Infinity;
  const n = chosen.v.length;
  const confidence: DurationEstimate["confidence"] =
    n >= 5 && spread <= 0.25 ? "high" : n >= 3 && spread <= 0.5 ? "medium" : "low";

  const dropBase = confidence === "low" && taskBase !== null ? taskBase : med;
  return {
    minutes: recommendBlockMinutes(dropBase, settings),
    baseMinutes: base.minutes,
    baseSource: base.source,
    range: { low: Math.floor(p25 / STEP) * STEP, high: Math.ceil(p75 / STEP) * STEP },
    confidence,
    sampleCount: n,
    scope: chosen.scope,
    reason: `${chosen.reasonHead} ${n}개`,
  };
}
```
Check the §46 low example: values sorted `[30, 42, 55, 95, 120]` → p25 = 42, p75 = 95. The range is floor5(42) = 40
and ceil5(95) = 95 → `{40, 95}`. Median 55 → `recommendBlockMinutes(55)` = 55. The spread is (95 − 42) / 55 = 0.96,
so confidence is low. It matches the tests.

- [ ] **Step 4: Run to verify it passes**

`npx vitest run tests/unit/estimator.test.ts`. Expected: PASS. Other files won't compile yet (Task 4 switches
the consumers). Run only this test file here.

- [ ] **Step 5: Commit**

Commit together with Task 4 so the tree stays compilable: do not commit yet. Continue to Task 4 and commit once.

---

### Task 4: Duration groups service + switch every consumer

**Files:**
- Create: `src/features/scheduler/services/duration-groups.service.ts`
- Delete: `src/features/scheduler/services/duration-profile.service.ts`, `src/features/scheduler/services/duration-estimator.service.ts`
- Modify:
  - `src/features/scheduler/queries/select.ts`, `domain/task.types.ts`
  - `services/task.service.ts`, `services/work-session.service.ts`, `services/scheduling.service.ts`
  - `components/duration-insight.tsx`, `components/today-task-panel.tsx`, `components/task-detail-drawer.tsx`,
    `components/scheduler-workspace.tsx`, `components/task-list-item.tsx`, `components/weekly-calendar.tsx`
  - `src/app/(private)/scheduler/page.tsx`
  - `src/features/projects/queries/context.ts`, `queries/project.queries.ts`, `components/project-detail.tsx`
  - `src/features/ai/services/task-recommendation.service.ts`
  - `src/features/jobs/services/jobs.ts`

**Interfaces:**
- Produces:
  ```ts
  // duration-groups.service.ts
  export async function loadDurationGroups(supabase: SupabaseServerClient, userId: string): Promise<DurationGroup[]>;
  export async function rebuildDurationGroups(ctx: ActionContext): Promise<number>;       // returns group count
  export async function rebuildDurationGroupsQuietly(ctx: ActionContext): Promise<void>;
  // task type
  Task gains: task_type: TaskType | null; practice_domain_id: string | null; domain: { id: string; name: string } | null; tags: TagRef[]
  ```
- Consumers use `estimateDuration(task, settings, groups, labels)`, where `labels` comes from
  `useGroupLabels(domains)` on the client or `groupLabels(domains)` on the server.
  `groupLabels(domains: DomainRef[]): GroupLabels` is exported from
  `src/features/classification/utils/labels.ts`, a pure file that uses `TASK_TYPE_LABEL`.

- [ ] **Step 1: TASK_SELECT and the Task type**

`select.ts`: append to both literals, inside the task select (for `BLOCK_SELECT`, inside `task:…(…)`):
```
, domain:practice_domains!tasks_practice_domain_id_user_id_fkey(id, name), tags:task_tags!task_tags_task_id_user_id_fkey(tag:tags!task_tags_tag_id_user_id_fkey(id, name, color))
```
PostgREST returns `tags` as `{ tag: TagRef }[]`. Add a `normalizeTask(row)` in `queries/select.ts`:
```ts
type RawTags = { tags?: { tag: TagRef | null }[] | null };
export function normalizeTask<T extends RawTags>(row: T): Omit<T, "tags"> & { tags: TagRef[] } {
  return { ...row, tags: (row.tags ?? []).map((x) => x.tag).filter((t): t is TagRef => t !== null) };
}
```
Apply it everywhere a task row is returned: `getTask`, `createTask`, `updateTask`, `transitionTask`,
`listTodayTasks`, and `listBlocksInRange` (for `block.task`). Also apply it in the projects `loadTasks` query.

`task.types.ts`:
```ts
export type Task = Omit<TaskRow, "status" | "task_type"> & {
  status: TaskStatus;
  task_type: TaskType | null;
  template: Pick<TaskTemplate, "id" | "name" | "default_estimate_minutes"> | null;
  project: { id: string; name: string } | null;
  milestone: { id: string; name: string } | null;
  domain: { id: string; name: string } | null;
  tags: TagRef[];
};
```

- [ ] **Step 2: `labels.ts`**

```ts
import { TASK_TYPE_LABEL, type DomainRef, type TaskType } from "../domain/classification.types";
import type { GroupLabels } from "@/features/scheduler/utils/estimator";

export function groupLabels(domains: DomainRef[]): GroupLabels {
  const names = new Map(domains.map((d) => [d.id, d.name]));
  return {
    typeLabel: (t) => TASK_TYPE_LABEL[t as TaskType] ?? t,
    domainName: (id) => names.get(id) ?? null,
  };
}
```
It is a pure import of a type, so it doesn't violate the dependency direction (the scheduler's estimator never
imports classification).

- [ ] **Step 3: `duration-groups.service.ts`**

```ts
import "server-only";
import type { ActionContext } from "@/lib/action";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { buildGroupSamples, groupKeysFor, toGroupSample, type DurationGroup, type GroupSample } from "../utils/estimator";

/** Bounded rebuild input: the most recent completed tasks. */
const CANDIDATE_LIMIT = 500;

export async function loadDurationGroups(supabase: SupabaseServerClient, userId: string): Promise<DurationGroup[]> {
  const { data, error } = await supabase
    .from("duration_groups")
    .select("group_key, samples, sample_count")
    .eq("user_id", userId);
  if (error) throw fromDbError(error);
  return data.map((g) => ({ ...g, samples: (g.samples ?? []) as GroupSample[] }));
}

/** Rebuild all groups of one user from source data (derived, rebuildable). */
export async function rebuildDurationGroups(ctx: ActionContext): Promise<number> {
  const uid = ctx.user.id;
  const [tasks, pa] = await Promise.all([
    ctx.supabase
      .from("tasks")
      .select(
        "id, task_type, practice_domain_id, user_estimated_minutes, completed_at, template:task_templates!tasks_template_id_user_id_fkey(default_estimate_minutes), tags:task_tags!task_tags_task_id_user_id_fkey(tag_id)",
      )
      .eq("user_id", uid)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(CANDIDATE_LIMIT),
    ctx.supabase
      .from("task_plan_actual")
      .select("task_id, actual_minutes")
      .eq("user_id", uid)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(CANDIDATE_LIMIT),
  ]);
  if (tasks.error) throw fromDbError(tasks.error);
  if (pa.error) throw fromDbError(pa.error);
  const actual = new Map(pa.data.map((r) => [r.task_id, Number(r.actual_minutes ?? 0)]));

  const buckets = new Map<string, GroupSample[]>();
  for (const t of tasks.data) {
    const sample = toGroupSample({
      actualMinutes: actual.get(t.id) ?? 0,
      userEstimatedMinutes: t.user_estimated_minutes,
      templateDefaultMinutes: t.template?.default_estimate_minutes ?? null,
      completedAt: t.completed_at,
    });
    if (!sample) continue;
    const keys = groupKeysFor({
      task_type: t.task_type,
      practice_domain_id: t.practice_domain_id,
      tags: (t.tags ?? []).map((x) => ({ id: x.tag_id, name: "" })),
    });
    for (const k of keys) buckets.set(k, [...(buckets.get(k) ?? []), sample]);
  }

  const now = new Date().toISOString();
  const rows = [...buckets.entries()].map(([group_key, samples]) => {
    const kept = buildGroupSamples(samples);
    return { user_id: uid, group_key, samples: kept, sample_count: kept.length, updated_at: now };
  });
  if (rows.length > 0) {
    const up = await ctx.supabase.from("duration_groups").upsert(rows, { onConflict: "user_id,group_key" });
    if (up.error) throw fromDbError(up.error);
  }
  let stale = ctx.supabase.from("duration_groups").delete().eq("user_id", uid);
  if (rows.length > 0) stale = stale.lt("updated_at", now);
  const del = await stale;
  if (del.error) throw fromDbError(del.error);
  return rows.length;
}

/** Best-effort: the primary write already succeeded (spec §56). */
export async function rebuildDurationGroupsQuietly(ctx: ActionContext): Promise<void> {
  try {
    await rebuildDurationGroups(ctx);
  } catch (error) {
    log({ action: "duration_groups.rebuild", userId: ctx.user.id, success: false, errorCode: "DATABASE_ERROR", detail: String(error) });
  }
}
```

- [ ] **Step 4: Replace every profile call**

| Old | New |
|---|---|
| `refreshProfilesQuietly(ctx, [...])` (task.service, work-session.service) | `rebuildDurationGroupsQuietly(ctx)` |
| `rebuildUserProfiles(ctx)` (jobs.ts) | `rebuildDurationGroups(ctx)`; detail key `groups` |
| `loadDurationProfiles(supabase, userId)` (page.tsx, projects context, AI service) | `loadDurationGroups(supabase, userId)` |
| `recommendDuration(...)` (scheduling.service) | load groups + domains, then `estimateDuration(task, settings, groups, groupLabels(domains))` |
| prop `durationProfiles: StoredProfile[]` | `durationGroups: DurationGroup[]` plus `domains: DomainRef[]` where labels are needed |

Details:
- In `task.service.ts` `updateTask`, also rebuild when a completed task's classification changes. Task 5 adds
  those inputs; compare `task_type`, `practice_domain_id` and the tag set there.
- In `scheduling.service.ts` `scheduleTask`:
  ```ts
  const [groups, domains] = await Promise.all([
    loadDurationGroups(ctx.supabase, ctx.user.id),
    listDomainRefs(ctx.supabase, ctx.user.id),
  ]);
  const rec = estimateDuration(task, settings, groups, groupLabels(domains));
  ```
  `listDomainRefs(supabase, userId): Promise<DomainRef[]>` lives in
  `src/features/classification/queries/classification.queries.ts` (Task 5 adds the other queries; add this one
  now). It selects `id, name, parent_id` filtered by `user_id`.
- `page.tsx` also loads `listDomainRefs` and `listTags` (Task 5 adds `listTags`; for now load only domains) and
  passes `durationGroups` and `domains` down.
- AI service `durationTendencies`: build from groups whose key starts with `type:` and has no `|domain`. The
  ratio is the median over samples with base:
  ```ts
  durationTendencies: groups
    .filter((g) => /^type:[a-z]+$/.test(g.group_key))
    .map((g) => {
      const ratios = g.samples.filter((s) => s.base).map((s) => s.actual / s.base!);
      return { taskType: g.group_key.slice(5), actualVsEstimate: median(ratios), samples: g.sample_count };
    })
    .filter((x) => x.actualVsEstimate !== null),
  ```
  Remove the `task_templates` read if nothing else uses it.
- `DurationInsight` becomes:
  ```tsx
  export function DurationInsight({ estimate }: { estimate: DurationEstimate }) {
    const baseLabel =
      estimate.baseSource === "user"
        ? `예상 ${formatMinutes(estimate.baseMinutes)}`
        : estimate.baseSource === "template"
          ? `템플릿 기본값 ${formatMinutes(estimate.baseMinutes)}`
          : `기본값 ${formatMinutes(estimate.baseMinutes)} (예상 시간 미입력)`;
    if (estimate.scope === "none") {
      return (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p>{formatMinutes(estimate.minutes)} 블록 · {baseLabel}</p>
          <p>유형이나 태그가 같은 완료 작업이 {MIN_SAMPLES}개 이상 쌓이면 실제 기록으로 추천합니다.</p>
        </div>
      );
    }
    const conf = { high: "높음", medium: "보통", low: "낮음", none: "" }[estimate.confidence];
    const rangeText =
      estimate.range && estimate.range.low !== estimate.range.high
        ? ` (${formatMinutes(estimate.range.low)}–${formatMinutes(estimate.range.high)})`
        : "";
    return (
      <div className="space-y-0.5 rounded-md border border-ai/40 bg-ai/5 px-3 py-2 text-xs">
        <p className="flex items-center gap-1 font-medium text-foreground">
          <Sparkles className="size-3.5 text-ai" aria-hidden />
          {estimate.confidence === "low"
            ? `${baseLabel} · 예상 범위 ${formatMinutes(estimate.range!.low)}–${formatMinutes(estimate.range!.high)}`
            : `${baseLabel} → 추천 ${formatMinutes(estimate.minutes)}${rangeText}`}
        </p>
        <p className="text-muted-foreground">{estimate.reason} 기준 · 신뢰도 {conf}</p>
      </div>
    );
  }
  ```
- `task-list-item.tsx` hint (`learned` = `estimate.scope !== "none" && !partial`):
  ```tsx
  {learned && (
    <span title={estimate!.reason ?? undefined}>
      {estimate!.confidence === "low"
        ? `→ 예상 범위 ${formatMinutes(estimate!.range!.low)}–${formatMinutes(estimate!.range!.high)}`
        : `→ 추천 ${formatMinutes(estimate!.minutes)}${
            estimate!.range && estimate!.range.low !== estimate!.range.high
              ? ` (${formatMinutes(estimate!.range.low)}–${formatMinutes(estimate!.range.high)})`
              : ""
          }`}
    </span>
  )}
  ```
  Keep `data-recommended` only when `learned && confidence !== "low"`.
- `weekly-calendar.tsx` toast description: use `reason` if passed. The Draggable extendedProps get
  `reason: itemEl.getAttribute("data-reason")`, and the list item sets `data-reason={estimate.reason}` when learned.
  The toast description becomes `reason ?? (samples > 0 ? \`비슷한 작업 ${samples}개 기준\` : undefined)`.

- [ ] **Step 5: Verify**

`npx tsc --noEmit && npx eslint . && npx vitest run`. Expected: pass, with no references to `StoredProfile`,
`loadDurationProfiles`, `refreshProfilesQuietly` or `duration-estimator.service` left
(`rg -n "StoredProfile|DurationProfiles|refreshProfiles|duration-estimator" src` → empty).

Then rebuild groups once for the owner so recommendations continue before the nightly job runs. Use MCP
`execute_sql` to verify after the first completion in E2E; the E2E in Task 8 triggers rebuilds through
completions. A one-off rebuild isn't needed for correctness.

- [ ] **Step 6: Commit (Tasks 3 + 4)**

```bash
git add src/features/scheduler src/features/classification/utils/labels.ts src/features/classification/queries/classification.queries.ts src/app/\(private\)/scheduler/page.tsx src/features/projects src/features/ai/services/task-recommendation.service.ts src/features/jobs/services/jobs.ts tests/unit/estimator.test.ts
git commit -m "D1-3/4: estimator v2 (range, confidence, reason) over duration_groups; consumers switched"
```
Use `git add` with explicit paths; confirm with `git status` that no unrelated user edits are staged.

---

### Task 5: Classification services, actions, queries; task create/update with classification

**Files:**
- Create: `src/features/classification/schemas/classification.schema.ts`
- Create: `src/features/classification/services/classification.service.ts`
- Create: `src/features/classification/actions/classification.actions.ts`
- Modify: `src/features/classification/queries/classification.queries.ts`
- Modify: `src/features/scheduler/schemas/task.schema.ts`, `services/task.service.ts`

**Interfaces:**
- Produces (actions → `ActionResult`):
  - `createTagAction({ name, color? })` → `TagRef`
  - `updateTagAction({ tagId, name, color })`
  - `deleteTagAction({ tagId })`
  - `createDomainAction({ name, parentId? })` → `DomainRef`
  - `updateDomainAction({ domainId, name, parentId })`
  - `deleteDomainAction({ domainId })`
  - `updateTemplateClassificationAction({ templateId, taskType, domainId, tagIds, defaultEstimateMinutes, applyToTasks })` → `{ updatedTasks: number }`
  - `setTaskTagsAction({ taskId, tagIds })`
- Queries:
  - `listTags(supabase, userId): Promise<TagRef[]>`
  - `listDomainRefs(supabase, userId): Promise<DomainRef[]>`
  - `listTemplatesWithClassification(supabase, userId)`, which returns templates with
    `task_type, practice_domain_id, default_estimate_minutes, tags` and `emptyTaskCount`.
- `createTaskSchema` gains `taskType?`, `domainName?`, `domainId?`, `tagNames?: string[]`, `tagIds?: string[]`.
  `updateTaskSchema` gains `taskType: TaskType | null`, `domainId: uuid | null`, `tagIds: uuid[]`.

- [ ] **Step 1: Schemas**

```ts
import { z } from "zod";
import { TAG_COLORS, TASK_TYPES } from "../domain/classification.types";

export const tagName = z
  .string()
  .trim()
  .min(1, "이름을 입력해 주세요.")
  .max(100)
  .refine((s) => !/[#,]/.test(s), "#과 쉼표는 쓸 수 없습니다.");
export const domainName = z
  .string()
  .trim()
  .min(1, "이름을 입력해 주세요.")
  .max(60)
  .refine((s) => !s.includes("@"), "@는 쓸 수 없습니다.");
export const taskType = z.enum(TASK_TYPES);

export const createTagSchema = z.object({ name: tagName, color: z.enum(TAG_COLORS).nullable().optional() });
export const updateTagSchema = z.object({ tagId: z.uuid(), name: tagName, color: z.enum(TAG_COLORS).nullable() });
export const tagIdSchema = z.object({ tagId: z.uuid() });
export const createDomainSchema = z.object({ name: domainName, parentId: z.uuid().nullable().optional() });
export const updateDomainSchema = z.object({ domainId: z.uuid(), name: domainName, parentId: z.uuid().nullable() });
export const domainIdSchema = z.object({ domainId: z.uuid() });
export const updateTemplateClassificationSchema = z.object({
  templateId: z.uuid(),
  taskType: taskType.nullable(),
  domainId: z.uuid().nullable(),
  tagIds: z.array(z.uuid()).max(20),
  defaultEstimateMinutes: z.coerce.number().int().min(1).max(720).nullable(),
  applyToTasks: z.boolean(),
});
export const setTaskTagsSchema = z.object({ taskId: z.uuid(), tagIds: z.array(z.uuid()).max(20) });
```
The types are exported via `z.infer` in the same file (`CreateTagInput`, etc.).

- [ ] **Step 2: Service** `classification.service.ts`

Implement these functions. Each filters `user_id = ctx.user.id` and maps errors as follows:
- 23505 → `new AppError("CONFLICT", "같은 이름이 이미 있습니다.")`
- 23503 → `NOT_FOUND`
- otherwise `fromDbError`

```ts
export async function createTag(ctx, { name, color }): Promise<TagRef>
export async function updateTag(ctx, { tagId, name, color }): Promise<void>
export async function deleteTag(ctx, tagId): Promise<void>
export async function createDomain(ctx, { name, parentId }): Promise<DomainRef>
export async function updateDomain(ctx, { domainId, name, parentId }): Promise<void>
  // loads listDomainRefs; if wouldCycle(domains, domainId, parentId) → AppError("VALIDATION_ERROR", "하위 영역을 상위로 지정할 수 없습니다.")
export async function deleteDomain(ctx, domainId): Promise<void>
/** Find by name (case-insensitive) or create. Returns ids in input order. */
export async function ensureTags(ctx, names: string[]): Promise<TagRef[]>
export async function ensureDomain(ctx, name: string): Promise<{ domain: DomainRef; created: boolean }>
/** Replace a task's tag set (ownership: the composite FK rejects foreign tag ids → NOT_FOUND). */
export async function setTaskTags(ctx, taskId: string, tagIds: string[]): Promise<void>
  // delete task_tags where task_id and tag_id not in tagIds; insert missing with on conflict do nothing
export async function updateTemplateClassification(ctx, input): Promise<{ updatedTasks: number }>
  // update task_templates set task_type, practice_domain_id, default_estimate_minutes; replace template_tags.
  // If applyToTasks: update tasks set task_type = coalesce(task_type, $type), practice_domain_id = coalesce(practice_domain_id, $domain)
  //   where template_id = $id and user_id; and insert the template's tags into task_tags for those tasks (on conflict do nothing).
  //   Return the number of tasks changed, then rebuildDurationGroupsQuietly(ctx).
```
Case-insensitive lookup: `.ilike("name", escaped)`, where `escaped` escapes `%`, `_` and `\`. It is exact-match
semantics because no wildcards are left.

- [ ] **Step 3: Task create/update**

`task.schema.ts`:
```ts
import { TASK_TYPES } from "@/features/classification/domain/classification.types";
// createTaskSchema adds:
  taskType: z.enum(TASK_TYPES).optional(),
  domainId: z.uuid().nullable().optional(),
  domainName: z.string().trim().max(60).optional(),
  tagIds: z.array(z.uuid()).max(20).optional(),
  tagNames: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
// updateTaskSchema adds:
  taskType: z.enum(TASK_TYPES).nullable(),
  domainId: z.uuid().nullable(),
  tagIds: z.array(z.uuid()).max(20),
```
The scheduler schema imports the classification domain constants. Constants-only imports are fine.

`task.service.ts` `createTask`:
1. Resolve the template (existing). If the template has `task_type` / `practice_domain_id` / tags, use them as
   defaults (read `task_templates` + `template_tags` in one query).
2. Resolve the domain: `domainId` wins. Otherwise, `domainName` → `ensureDomain`. Remember `created` so the
   action result can say so.
3. Insert the task with `task_type`, `practice_domain_id`.
4. Tags = template tags ∪ `tagIds` ∪ `ensureTags(tagNames)`, then `setTaskTags`.
5. Return `normalizeTask(getTask)` plus `domainCreated?: string` (the name) for the toast. The action returns
   `{ task, domainCreated }`; update the `createTaskAction` callers (quick add, project quick add) to read
   `.task` if they use the data.

`updateTask`: write `task_type` and `practice_domain_id`, `setTaskTags(taskId, input.tagIds)`. If the task is
completed and the type/domain/tags/estimate/template changed, `rebuildDurationGroupsQuietly`.

The server re-validates the title after parsing: `createTaskSchema` title `min(1)` already rejects the empty
title that the client sends when only tokens were typed (Review Focus 2).

- [ ] **Step 4: Actions** `classification.actions.ts`

The same `runAction` + `done()` (revalidate `/scheduler` layout) pattern as the schedule actions, one per schema above.

- [ ] **Step 5: Queries**

Add `listTags` (`id, name, color`, order by lower name) and `listTemplatesWithClassification` (templates +
`template_tags(tag:tags(id,name,color))` + a count of the template's tasks with `task_type is null`, via a
second grouped query or a head count per template; there are few templates).

- [ ] **Step 6: Verify and commit**

Run `npx tsc --noEmit && npx eslint . && npx vitest run`.
```bash
git add src/features/classification src/features/scheduler/schemas/task.schema.ts src/features/scheduler/services/task.service.ts src/features/scheduler/actions/task.actions.ts
git commit -m "D1-5: tags/domains/templates services and actions; tasks carry type, domain and tags"
```

---

### Task 6: Quick add with inline tokens + autocomplete; list display; drawer editors

**Files:**
- Create: `src/features/classification/components/token-input.tsx` (title input + `#`/`@` autocomplete + chips)
- Create: `src/features/classification/components/tag-chips.tsx`, `tag-editor.tsx`, `domain-select.tsx`, `type-select.tsx`
- Modify: `today-task-panel.tsx` (quick create), `task-list-item.tsx` (meta), `task-detail-drawer.tsx` (edit form),
  `scheduler-workspace.tsx` + `page.tsx` (pass `tags`, `domains`)

**Interfaces:**
- `TokenInput({ id, name, tags, domains, placeholder, onSubmitIntent, selectedTagIds, onSelectedTagIdsChange })`:
  - Renders an `<input>` with `role="combobox"`, `aria-expanded` and `aria-controls`, plus a
    `role="listbox"` popup with `role="option"` items.
  - Enter with the list open selects the highlighted option. Selecting a tag adds its id to `selectedTagIds` and
    removes the typed `#query`. Selecting a domain replaces the `@query` with `@<name>` if the name has no spaces;
    otherwise it sets a `selectedDomainId` hidden field (domain names can't contain `@` but may contain spaces).
  - The selected tags render as removable chips below the input (`aria-label="태그 <name> 제거"`).
- `TagChips({ tags, max = 3 })`: small chips with the name (colored dot optional), then `+N`.
- `TagEditor({ taskId, tags, allTags })`: chips + a text input with the same autocomplete. It creates unknown
  names via `createTagAction`, then calls `setTaskTagsAction`.
- `DomainSelect({ id, name, domains, defaultValue })`: `<select>` with an "없음" option and indentation by depth
  (`  ` per level).
- `TypeSelect({ id, name, defaultValue })`: `<select>` with "없음" + `TASK_TYPES` → labels.

- [ ] **Step 1: Components**

Implement the components per the interfaces above. `TokenInput` logic:
```tsx
const [value, setValue] = useState("");
const [open, setOpen] = useState(false);
const [active, setActive] = useState(0);
const token = activeToken(value, caret);
const options = token
  ? (token.kind === "#" ? tags : domains)
      .filter((o) => o.name.toLowerCase().startsWith(token.query.toLowerCase()))
      .slice(0, 8)
  : [];
// onKeyDown: ArrowDown/ArrowUp move `active`; Enter/Tab with open && options.length → e.preventDefault(), pick(options[active]);
// Escape → setOpen(false).
```
`pick(tag)`: remove `value.slice(token.start, caret)` from the value and add `tag.id` to the selected tag ids.
`pick(domain)`: set `selectedDomainId` and remove the `@query` text.
Hidden inputs: `tagIds` (comma-joined) and `domainId`.

- [ ] **Step 2: Quick create**

In `TaskQuickCreate`:
- Use `TokenInput` for the title.
- On submit:
  - `const parsed = parseQuickAdd(title)`.
  - If `!parsed.title`, `toast.error("제목을 입력해 주세요.")` and return (Review Focus 2).
  - Otherwise call `createTaskAction({ title: parsed.title, tagNames: parsed.tags, tagIds: selectedTagIds, domainName: parsed.domain ?? undefined, domainId: selectedDomainId ?? undefined, taskType: fd.get("taskType") || undefined, userEstimatedMinutes, templateName, targetDate: today })`.
  - `onSuccess: (r) => { reset; if (r.domainCreated) toast.success(\`새 영역 ${r.domainCreated}을 만들었어요\`) }`.
- "더보기" row: `TypeSelect` (id `quick-task-type`, label "유형"), estimate, and template. The template input
  label becomes "템플릿" and its placeholder "템플릿 (선택)".

- [ ] **Step 3: List item**

In the meta line, after the project/template: `{task.task_type && <span>{TASK_TYPE_LABEL[task.task_type]}</span>}`,
`{task.domain && <span>@{task.domain.name}</span>}` and `<TagChips tags={task.tags} />`. Remove the separate
template-name span if the template name now shows as a tag chip (keep it only when the template has no same-named
tag, which is rare; simplest is to drop it).

- [ ] **Step 4: Drawer**

In the edit form, add `TypeSelect` (name `taskType`, label "유형") and `DomainSelect` (name `domainId`, label
"영역") beside the template field (renamed "템플릿"). Send `taskType: fd.get("taskType") || null`,
`domainId: fd.get("domainId") || null` and `tagIds: task.tags.map((t) => t.id)` in `updateTaskAction` (tags are
edited live by `TagEditor`, which sits below the form).

- [ ] **Step 5: Wire data**

`page.tsx` loads `listTags` and `listDomainRefs` and passes them to the workspace → panel (quick create) and drawer.
The labels for `estimateDuration` come from `groupLabels(domains)`.

- [ ] **Step 6: Verify**

Run `npx tsc --noEmit && npx eslint . && npx vitest run`. Then check the flows in the browser: quick add with
`#` autocomplete (Enter picks), chips shown, and the drawer type/domain/tags save.

- [ ] **Step 7: Commit**

```bash
git add <each changed/created file>
git commit -m "D1-6: quick add #tag/@domain with autocomplete; type/domain/tags in list and drawer"
```

---

### Task 7: Tag filter, classification management dialog, template banner

**Files:**
- Create: `src/features/classification/components/tag-filter.tsx`, `classification-dialog.tsx`, `template-type-banner.tsx`
- Modify: `today-task-panel.tsx`, `scheduler-settings-menu.tsx`, `scheduler-workspace.tsx`, `page.tsx`

**Interfaces:**
- `TagFilter({ tags, selected })`: a chip row (`role="group" aria-label="태그 필터"`) of toggle buttons
  (`aria-pressed`) that update `?tags=` through `useRouter().replace` with `scroll: false`. Only tags used by the
  visible tasks are shown.
- Panel: `visible = selected.length ? tasks.filter((t) => t.tags.some((g) => selected.includes(g.id))) : tasks`.
- `ClassificationDialog({ open, onOpenChange, tags, domains, templates })` has `Tabs` 태그 / 영역 / 템플릿:
  - **태그 row:** name input + color select + 저장 + 삭제 (confirm inline).
  - **영역 row:** name + parent `DomainSelect` (excluding self) + 저장 + 삭제. An add form sits at the top.
  - **템플릿 row:**
    - Name (read-only), `TypeSelect`, `DomainSelect`, the tag editor (chips from `allTags`, add/remove via
      checkboxes list), and the default estimate.
    - The checkbox "값이 비어 있는 할 일 {emptyTaskCount}개에도 적용" (default checked) and 저장.
    - Saving calls `updateTemplateClassificationAction` and toasts the updated count.
- The settings menu gets the item "분류 관리", which opens the dialog (state lifted to the workspace). The page
  loads `listTemplatesWithClassification`.
- `TemplateTypeBanner({ count })`: shown when templates without a type exist and it hasn't been dismissed.
  `localStorage` key `kyod.banner.templateType`, with read/write wrapped in try/catch.

- [ ] **Step 1: Implement** the components above.
- [ ] **Step 2: Verify**

Run `npx tsc --noEmit && npx eslint . && npx vitest run`. In the browser, check the filter chips and that the
dialog saves each tab.

- [ ] **Step 3: Commit**

```bash
git add <each changed/created file>
git commit -m "D1-7: tag filter, classification management dialog, template banner"
```

---

### Task 8: Contract migration, E2E, docs, final verification

**Files:**
- Create: `supabase/migrations/20260930170000_drop_duration_profiles.sql`
- Modify: `src/types/database.ts`
- Create: `tests/e2e/classification.spec.ts`
- Modify: `tests/e2e/duration-learning.spec.ts`, `tests/e2e/helpers.ts`
- Create: `docs/decisions/0013-classification-and-estimator-v2.md`
- Modify: `docs/decisions/README.md`, `docs/schema.md`, `docs/progress.md`

- [ ] **Step 1: Contract**

`rg -n "task_duration_profiles" src` → empty. Then:
```sql
-- Contract for D1: duration history now lives in duration_groups.
drop table public.task_duration_profiles;
```
Apply it (name `drop_duration_profiles`), rename the file, and regenerate the types. Re-run `classification.sql`.

- [ ] **Step 2: E2E helpers cleanup**

Add to `cleanup()`:
```ts
  await db.from("tags").delete().like("name", `${E2E_PREFIX}%`);
  await db.from("tags").delete().like("name", "e2e-%");
  await db.from("practice_domains").delete().like("name", "E2E%");
```
E2E tag and domain names use the prefixes `e2e-` (inline tokens can't contain `[`) and `E2E`.

- [ ] **Step 3: duration-learning.spec.ts updates**
- The quick add label `작업 유형` → `템플릿` (`page.getByLabel("템플릿").fill(TEMPLATE)`).
- The seeded 3 tasks get the template. The backfill only runs in the migration, so the test must attach the
  template tag itself. After inserting the template, insert a tag with the template name and `template_tags`, and
  for the 3 tasks insert `task_tags`. Creating the new task via quick add with that template copies the template
  tags (Task 5), which the recommendation needs.
- Profile assertions: replace the `task_duration_profiles` polls with `duration_groups` for `tag:<tagId>`:
  `sample_count` 3 after the completions; after reopening, 2 and no "추천" hint.
- Text: the item shows `추천 1h 20m` (the range collapses when low = high); the drawer shows
  `예상 1h → 추천 1h 20m` and `#[e2e] Technical Blog 태그 작업 3개 기준 · 신뢰도 보통`.

- [ ] **Step 4: classification.spec.ts**

```ts
import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

test.describe("classification", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("quick add #tag @domain → chips; autocomplete Enter picks; tag filter; drawer type", async ({ page }) => {
    const stamp = Date.now();
    const tag = `e2e-snow${stamp}`;
    const domain = `E2E${stamp}`;
    const a = `${E2E_PREFIX} RBAC 공부 ${stamp}`;
    const b = `${E2E_PREFIX} 다른 일 ${stamp}`;
    await login(page);

    await page.getByLabel("새 할 일").fill(`${a} #${tag} @${domain}`);
    await page.getByRole("button", { name: "할 일 추가" }).click();
    const itemA = page.locator("li", { hasText: a });
    await expect(itemA).toContainText(tag);
    await expect(itemA).toContainText(`@${domain}`);
    await expect(page.getByText(`새 영역 ${domain}을 만들었어요`)).toBeVisible();

    // Autocomplete: typing "#e2e-snow" then Enter picks the tag instead of submitting.
    const input = page.getByLabel("새 할 일");
    await input.fill(`${b} #e2e-snow`);
    await expect(page.getByRole("option", { name: tag })).toBeVisible();
    await input.press("Enter");
    await expect(page.locator("li", { hasText: b })).toHaveCount(0); // not submitted
    await expect(page.getByRole("button", { name: `태그 ${tag} 제거` })).toBeVisible();
    await input.press("Enter"); // list closed → submits
    await expect(page.locator("li", { hasText: b })).toContainText(tag);

    // Filter by the tag: both tasks shown; a third untagged task hidden.
    const c = `${E2E_PREFIX} 태그 없음 ${stamp}`;
    await input.fill(c);
    await input.press("Enter");
    await page.getByRole("group", { name: "태그 필터" }).getByRole("button", { name: tag }).click();
    await expect(page.locator("li", { hasText: c })).toHaveCount(0);
    await expect(page.locator("li", { hasText: a })).toBeVisible();

    // Drawer: set type → saved
    await page.getByRole("button", { name: a, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: a });
    await drawer.getByLabel("유형").selectOption({ label: "공부" });
    await drawer.getByRole("button", { name: "저장" }).click();
    const db = await dbAsUser();
    await expect
      .poll(async () => (await db.from("tasks").select("task_type").eq("title", a).single()).data?.task_type)
      .toBe("study");
  });
});
```

- [ ] **Step 5: Docs**
- ADR 0013 (`docs/decisions/0013-classification-and-estimator-v2.md`) records:
  - The three axes.
  - Tags as a table (not `text[]`).
  - The tag name rule (1–100, no `#` or `,`; the inline token is a subset).
  - The template-name → tag migration.
  - Estimator v2 (groups, quantity, range, confidence, low → range only), and complexity dropped from grouping.
  - `duration_groups` replacing `task_duration_profiles`.
  - The full-rebuild strategy (bounded to the 500 most recent completed tasks).
- Add the row `| 0013 | Classification axes, tags and estimator v2 | accepted |` to the README.
- `docs/schema.md` gets a section for the new tables and v2 rules, replacing the old `task_duration_profiles`
  section with `duration_groups`.
- `docs/progress.md` gets an "Improvement D1" checklist.

- [ ] **Step 6: Full verification**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run && npm run build
# restart the dev server after build if it died, then:
set -a; source .env.local; set +a; E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=… E2E_PASSWORD=… npx playwright test
```
Expected: everything passes (10 E2E specs). SQL: `classification.sql`, `scheduler_core.sql` PASS. The DB is clean
(no `[e2e]`/`e2e-`/`E2E` rows).

- [ ] **Step 7: Commit and push**

```bash
git add <explicit paths>
git commit -m "D1-8: drop task_duration_profiles; E2E for classification; ADR 0013, docs"
git push
```
