# AI Direction Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A user answers a 5-question interview.
- The AI drafts belief → identities → outcome goal → system → implementation intentions → habits.
- The user edits the draft and creates everything with one click, without touching existing data.

**Architecture:**
- **Generate:**
  - A Server Action runs `callAi` with a lenient AI schema (the model's raw output shape).
  - A pure `sanitizeDirectionDraft` turns that into the strict `DirectionDraft` shape.
  - The result is stored as a `proposed` row in a new `direction_drafts` table.
- **Review:** a client wizard edits the draft in memory.
- **Apply:**
  - A pure `reconcileDraft` re-checks the edited payload against the current state.
  - One security-invoker RPC, `apply_direction_draft`, creates all rows in a single transaction and marks the draft
    `applied`.

**Tech Stack:** Next 16 (App Router, Server Actions), Supabase Postgres (RLS, plpgsql), Zod 4, Vitest, Playwright,
Anthropic provider behind `features/ai/services/provider.ts`.

**Spec:** `docs/superpowers/specs/2026-10-01-ai-direction-setup-design.md`

## Global Constraints

- Read `AGENTS.md` first. Next 16: `params`/`searchParams`/`cookies()` are async; `revalidatePath` comes from
  `next/cache`; run `eslint` directly.
- AI is advisory. Its output is Zod-validated and stored only in `direction_drafts`. Direction tables are written only
  by `apply_direction_draft`.
- Every mutation follows Zod → `runAction` (authenticated user) → service → `ActionResult`. Never accept `user_id`
  from the client.
- Every AI call goes through `callAi(ctx, "direction_setup", …)` (30 calls per local day).
- Existing rows are never updated or archived by this feature. No purpose is created when one is active.
- Neutral wording: no `DENY_LIST` word (`src/features/direction/domain/status-text.ts`) in prompts or fixed copy.
- Never return raw Supabase or provider errors. Map them to `AppError` codes.
- **DB workflow (AGENTS.md):**
  1. Write the migration.
  2. Apply it with MCP `apply_migration` under the same name.
  3. Run `list_migrations` and rename the local file to the remote version.
  4. Regenerate `src/types/database.ts` with `generate_typescript_types`.
  5. Run the RLS SQL through `execute_sql`; it ends with `rollback`.
  6. Run `get_advisors` (security).
- **Limits copied from the DB and the direction schemas:**
  - purpose statement ≤ 280; identity name ≤ 40, description ≤ 280;
  - mission title ≤ 120, outcome ≤ 500;
  - criterion label ≤ 120, unit ≤ 12, numeric target > 0;
  - path title ≤ 80, approach ≤ 1000, trade-offs ≤ 1000;
  - protocol title ≤ 80, steps ≤ 12 (each ≤ 120), minutes 5–600;
  - habit title ≤ 80, minutes 5–600, weekdays ⊆ 1..7 (≥ 1);
  - mission ↔ identity links ≤ 6.
- **Draft counts:** identities 0–2, criteria 1–3, protocols 1–3, habits 0–3 (the AI is asked for 1–3); each `why` is
  ≤ 200 characters. Interview answers are ≤ 500 characters each. `outcome` and `timePlace` are required.
- E2E data uses the `[e2e]` prefix. E2E runs as `e2e@kyodstack.test`.
- Pin exact versions if a package is added (none is expected).

## Review Focus

1. **The user deletes an intention that a focus-rule habit uses.**
   - Expected: the habit becomes a check-rule habit, unlinked, and later habits' indexes shift.
   - Test: `removeProtocol` unit test (Task 2).
2. **The AI returns an identity whose name differs from an existing one only by case or spacing.**
   - Expected: it is linked to the existing identity, not duplicated.
   - Test: `sanitizeDirectionDraft` unit test (Task 2).
3. **A purpose was created in another tab between generation and apply.**
   - Expected: apply creates no second purpose and nothing fails.
   - Tests: `reconcileDraft` unit test (Task 2) and E2E test 2 (Task 4).
4. **Double-clicking 적용, or applying a draft that is already applied.**
   - Expected: the second call gets `CONFLICT` and nothing is duplicated.
   - Tests: RLS SQL "apply twice" (Task 1) and the service's P0001 → CONFLICT mapping (Task 3, via the action error
     path).
5. **A required interview answer is only whitespace.**
   - Expected: a validation message, with no AI call and no budget used.
   - Test: `setupAnswersSchema` unit test (Task 2).

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_direction_drafts.sql` | table, RLS, guard trigger, `apply_direction_draft` |
| `supabase/tests/rls/direction_drafts.sql` | RLS + apply transaction tests |
| `src/features/ai/schemas/direction-setup.schema.ts` | answers, AI output, strict draft, action inputs |
| `src/features/ai/utils/direction-draft.ts` | pure: sanitize, reconcile, remove/toggle helpers |
| `src/features/ai/prompts/direction-setup.prompt.ts` | system prompt, prompt builder, version |
| `src/features/ai/providers/fake-direction-setup.ts` | fixed fake draft (no `server-only`) |
| `src/features/ai/providers/fake.ts` | registers `direction_setup` |
| `src/features/ai/queries/direction-draft.queries.ts` | existing purpose/identities, open draft |
| `src/features/ai/services/direction-setup.service.ts` | generate / regenerate / discard / apply |
| `src/features/ai/actions/direction-setup.actions.ts` | Server Actions |
| `src/features/ai/components/direction-setup-wizard.tsx` | client wizard: interview + review |
| `src/app/(private)/scheduler/directive/setup/page.tsx` | setup page |
| `src/app/(private)/scheduler/directive/page.tsx` | entry card + button |
| `src/features/manual/components/planner-manual.tsx` | link in §2 |
| `tests/unit/direction-draft.test.ts` | unit tests |
| `tests/e2e/direction-setup.spec.ts`, `tests/e2e/helpers.ts` | E2E + cleanup |
| `docs/decisions/0037-ai-direction-setup.md` + docs | ADR, schema, architecture, progress |

---

### Task 1: `direction_drafts` table and `apply_direction_draft` RPC

**Files:**
- Create: `supabase/migrations/20261002000000_direction_drafts.sql`. The final name is the version the remote assigns
  (step 4).
- Create: `supabase/tests/rls/direction_drafts.sql`
- Modify: `src/types/database.ts` (regenerated)

**Interfaces:**
- Produces:
  - table `public.direction_drafts(id, user_id, answers, draft, applied, status, provider, model, prompt_version,
    applied_mission_id, created_at, applied_at)`;
  - `public.apply_direction_draft(p_draft_id uuid, p_payload jsonb) returns uuid` (mission id);
  - errors: P0002 = draft or identity not found, P0001 = draft closed, 22023 = bad identity index, plus table check
    and FK violations.
  - Payload JSON keys match `DirectionDraft` (Task 2), in camelCase.

- [ ] **Step 1: Write the RLS / transaction test**

`supabase/tests/rls/direction_drafts.sql`:

```sql
-- direction_drafts RLS, guard trigger, apply_direction_draft (ADR 0037).
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.identities (id, user_id, name) values
  ('00000000-0000-4000-b000-0000000000b2', '00000000-0000-4000-a000-00000000000b', 'B identity');
insert into public.direction_drafts (id, user_id, answers, draft, provider, model, prompt_version) values
  ('00000000-0000-4000-b000-0000000000b9', '00000000-0000-4000-a000-00000000000b', '{}', '{}', 'fake', 'fake-1', 'v1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare
  a constant uuid := '00000000-0000-4000-a000-00000000000a';
  d uuid; d2 uuid; m uuid; n int; st text;
  payload jsonb := '{
    "purpose": {"statement": "Share what I learn", "why": "w"},
    "identities": [{"name": "Writer", "description": null, "why": "w"}],
    "mission": {"title": "Publish 12 posts", "outcome": null, "why": "w",
                "criteria": [{"label": "Posts", "kind": "numeric", "targetValue": 12, "unit": "posts"},
                             {"label": "Launch", "kind": "check", "targetValue": null, "unit": null}]},
    "identityLinks": [{"newIndex": 0}],
    "path": {"title": "Daily drafts", "approach": "Write a little every day", "tradeOffs": "Less TV", "why": "w"},
    "protocols": [{"title": "After coffee, at desk, write", "steps": ["Open notes"], "intendedMinutes": 25, "why": "w"}],
    "habits": [{"title": "Open notes", "rule": "check", "targetMinutes": null, "weekdays": [1,2,3], "protocolIndex": null, "why": "w"},
               {"title": "Write 25", "rule": "focus", "targetMinutes": 25, "weekdays": [1,2,3,4,5], "protocolIndex": 0, "why": "w"}]
  }';
begin
  -- RLS: B's draft is invisible and cannot be changed or applied.
  assert (select count(*) from public.direction_drafts) = 0, 'A cannot see B draft';
  update public.direction_drafts set status = 'discarded';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot update B draft';
  begin
    perform public.apply_direction_draft('00000000-0000-4000-b000-0000000000b9', payload);
    raise exception 'FAIL: applied B draft';
  exception when sqlstate 'P0002' then null; end;

  insert into public.direction_drafts (user_id, answers, draft, provider, model, prompt_version)
  values (a, '{}', '{}', 'fake', 'fake-1', 'v1') returning id into d;
  begin
    insert into public.direction_drafts (user_id, answers, draft, provider, model, prompt_version)
    values (a, '{}', '{}', 'fake', 'fake-1', 'v1');
    raise exception 'FAIL: second proposed draft';
  exception when unique_violation then null; end;

  -- B's identity in the payload: rejected, nothing created.
  begin
    perform public.apply_direction_draft(d, jsonb_set(payload, '{identityLinks}', '[{"existingId": "00000000-0000-4000-b000-0000000000b2"}]'));
    raise exception 'FAIL: linked B identity';
  exception when sqlstate 'P0002' then null; end;
  assert (select count(*) from public.missions where title = 'Publish 12 posts') = 0, 'no mission after B identity';

  -- A constraint failure late in the chain (weekday 9) rolls everything back.
  begin
    perform public.apply_direction_draft(d, jsonb_set(payload, '{habits,0,weekdays}', '[9]'));
    raise exception 'FAIL: weekday 9';
  exception when check_violation then null; end;
  assert (select count(*) from public.missions) = 0, 'no mission after weekday 9';
  assert (select count(*) from public.purposes) = 0, 'no purpose after weekday 9';
  assert (select status from public.direction_drafts where id = d) = 'proposed', 'draft still proposed';

  -- Success.
  m := public.apply_direction_draft(d, payload);
  assert (select count(*) from public.purposes where status = 'active') = 1, 'purpose created';
  assert (select purpose_id from public.missions where id = m) is not null, 'mission has purpose';
  assert (select count(*) from public.identities where name = 'Writer') = 1, 'identity created';
  assert (select count(*) from public.mission_identities where mission_id = m) = 1, 'identity linked';
  assert (select count(*) from public.mission_criteria where mission_id = m) = 2, 'criteria';
  assert (select count(*) from public.paths where mission_id = m and status = 'active') = 1, 'path';
  assert (select count(*) from public.protocols where mission_id = m) = 1, 'protocol';
  assert (select count(*) from public.habits where title = 'Open notes' and mission_id is null) = 1, 'unlinked habit';
  assert (select count(*) from public.habits where title = 'Write 25' and mission_id = m and rule = 'focus') = 1, 'focus habit';
  select status into st from public.direction_drafts where id = d;
  assert st = 'applied', 'draft applied';
  assert (select applied_mission_id from public.direction_drafts where id = d) = m, 'mission recorded';

  -- Applying twice: closed.
  begin
    perform public.apply_direction_draft(d, payload);
    raise exception 'FAIL: applied twice';
  exception when sqlstate 'P0001' then null; end;
  -- A closed draft can't be reopened.
  begin
    update public.direction_drafts set status = 'proposed' where id = d;
    raise exception 'FAIL: reopened';
  exception when sqlstate 'P0001' then null; end;

  -- With an active purpose, a payload purpose is ignored (never a second purpose).
  insert into public.direction_drafts (user_id, answers, draft, provider, model, prompt_version)
  values (a, '{}', '{}', 'fake', 'fake-1', 'v1') returning id into d2;
  perform public.apply_direction_draft(d2, jsonb_set(jsonb_set(payload, '{mission,title}', '"Second"'), '{identityLinks}', '[]'));
  assert (select count(*) from public.purposes) = 1, 'still one purpose';

  -- Discard works on a proposed draft.
  insert into public.direction_drafts (user_id, answers, draft, provider, model, prompt_version)
  values (a, '{}', '{}', 'fake', 'fake-1', 'v1') returning id into d2;
  update public.direction_drafts set status = 'discarded' where id = d2;
  assert (select status from public.direction_drafts where id = d2) = 'discarded', 'discarded';
end $$;
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run it with the Supabase MCP `execute_sql`, passing the file content.
Expected: an error, `relation "public.direction_drafts" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261002000000_direction_drafts.sql`:

```sql
-- AI direction setup: drafts + one-step apply. Spec: docs/superpowers/specs/2026-10-01-ai-direction-setup-design.md,
-- ADR 0037. Drafts are history: no delete policy; only proposed → applied | discarded.

create table public.direction_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null,
  draft jsonb not null,
  applied jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'discarded')),
  provider text not null,
  model text not null,
  prompt_version text not null,
  applied_mission_id uuid references public.missions(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  check ((status = 'applied') = (applied_at is not null))
);
create unique index direction_drafts_one_open_idx on public.direction_drafts(user_id) where status = 'proposed';
create index direction_drafts_user_idx on public.direction_drafts(user_id, created_at desc);
create index direction_drafts_applied_mission_idx on public.direction_drafts(applied_mission_id);

alter table public.direction_drafts enable row level security;
create policy direction_drafts_select_own on public.direction_drafts
  for select to authenticated using (user_id = (select auth.uid()));
create policy direction_drafts_insert_own on public.direction_drafts
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'proposed');
create policy direction_drafts_update_own on public.direction_drafts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Closed drafts are immutable except for the FK's own `set null` when the applied mission is deleted.
create or replace function public.direction_drafts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id or new.answers <> old.answers or new.draft <> old.draft then
    raise exception 'draft content is immutable' using errcode = 'P0001';
  end if;
  if old.status <> 'proposed'
     and (new.status <> old.status or new.applied is distinct from old.applied or new.applied_at is distinct from old.applied_at) then
    raise exception 'draft is closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger direction_drafts_guard before update on public.direction_drafts
  for each row execute function public.direction_drafts_guard();

create or replace function public.apply_direction_draft(p_draft_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_purpose uuid;
  v_mission uuid;
  v_path uuid;
  v_new_ids uuid[] := '{}';
  v_proto_ids uuid[] := '{}';
  v_id uuid;
  v_sort integer;
  v_pos integer := 0;
  v_item jsonb;
begin
  select status into v_status from public.direction_drafts
  where id = p_draft_id and user_id = v_user
  for update;
  if v_status is null then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  if v_status <> 'proposed' then
    raise exception 'draft is closed' using errcode = 'P0001';
  end if;

  select id into v_purpose from public.purposes where user_id = v_user and status = 'active';
  if v_purpose is null and jsonb_typeof(p_payload->'purpose') = 'object' then
    insert into public.purposes (user_id, statement)
    values (v_user, trim(p_payload->'purpose'->>'statement'))
    returning id into v_purpose;
  end if;

  select coalesce(max(sort_order), -1) into v_sort from public.identities where user_id = v_user;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'identities', '[]'::jsonb)) loop
    v_sort := v_sort + 1;
    insert into public.identities (user_id, name, description, sort_order)
    values (v_user, trim(v_item->>'name'), nullif(trim(coalesce(v_item->>'description', '')), ''), v_sort)
    returning id into v_id;
    v_new_ids := v_new_ids || v_id;
  end loop;

  insert into public.missions (user_id, purpose_id, title, outcome)
  values (v_user, v_purpose, trim(p_payload->'mission'->>'title'),
          nullif(trim(coalesce(p_payload->'mission'->>'outcome', '')), ''))
  returning id into v_mission;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'identityLinks', '[]'::jsonb)) loop
    if v_item ? 'existingId' then
      v_id := (v_item->>'existingId')::uuid;
      if not exists (select 1 from public.identities where id = v_id and user_id = v_user and status = 'active') then
        raise exception 'identity not found' using errcode = 'P0002';
      end if;
    else
      v_id := v_new_ids[(v_item->>'newIndex')::integer + 1];
      if v_id is null then
        raise exception 'identity index out of range' using errcode = '22023';
      end if;
    end if;
    insert into public.mission_identities (user_id, mission_id, identity_id)
    values (v_user, v_mission, v_id)
    on conflict do nothing;
  end loop;

  for v_item in select value from jsonb_array_elements(p_payload->'mission'->'criteria') loop
    insert into public.mission_criteria (user_id, mission_id, label, kind, target_value, unit, position)
    values (v_user, v_mission, trim(v_item->>'label'), v_item->>'kind', (v_item->>'targetValue')::numeric,
            nullif(trim(coalesce(v_item->>'unit', '')), ''), v_pos);
    v_pos := v_pos + 1;
  end loop;

  insert into public.paths (user_id, mission_id, title, approach, trade_offs)
  values (v_user, v_mission, trim(p_payload->'path'->>'title'), trim(p_payload->'path'->>'approach'),
          nullif(trim(coalesce(p_payload->'path'->>'tradeOffs', '')), ''))
  returning id into v_path;

  v_pos := 0;
  for v_item in select value from jsonb_array_elements(p_payload->'protocols') loop
    insert into public.protocols (user_id, path_id, mission_id, title, steps, intended_minutes, sort_order)
    values (v_user, v_path, v_mission, trim(v_item->>'title'),
            array(select s from jsonb_array_elements_text(coalesce(v_item->'steps', '[]'::jsonb)) as s),
            (v_item->>'intendedMinutes')::smallint, v_pos)
    returning id into v_id;
    v_proto_ids := v_proto_ids || v_id;
    v_pos := v_pos + 1;
  end loop;

  select coalesce(max(sort_order), -1) into v_sort from public.habits where user_id = v_user;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'habits', '[]'::jsonb)) loop
    v_sort := v_sort + 1;
    v_id := case when jsonb_typeof(v_item->'protocolIndex') = 'number'
                 then v_proto_ids[(v_item->>'protocolIndex')::integer + 1] end;
    insert into public.habits (user_id, title, rule, target_minutes, weekdays, protocol_id, mission_id, sort_order)
    values (v_user, trim(v_item->>'title'), v_item->>'rule', (v_item->>'targetMinutes')::smallint,
            array(select w::smallint from jsonb_array_elements_text(v_item->'weekdays') as w),
            v_id, case when v_id is not null then v_mission end, v_sort);
  end loop;

  update public.direction_drafts
  set status = 'applied', applied = p_payload, applied_mission_id = v_mission, applied_at = now()
  where id = p_draft_id;
  return v_mission;
end $$;

revoke all on function public.apply_direction_draft(uuid, jsonb) from public, anon;
grant execute on function public.apply_direction_draft(uuid, jsonb) to authenticated;
```

- [ ] **Step 4: Apply the migration and sync its name**

1. Supabase MCP `apply_migration` with name `direction_drafts` and the file's SQL.
2. MCP `list_migrations`.
3. Rename the local file to `<remote version>_direction_drafts.sql`:
   `git mv supabase/migrations/20261002000000_direction_drafts.sql supabase/migrations/<version>_direction_drafts.sql`.

- [ ] **Step 5: Run the RLS test**

Run `execute_sql` with `supabase/tests/rls/direction_drafts.sql`.
Expected: success, with no `FAIL:` and no assertion error. The script ends with `rollback`.

- [ ] **Step 6: Regenerate types and check the advisors**

1. MCP `generate_typescript_types` → overwrite `src/types/database.ts`.
2. Confirm `direction_drafts` and `apply_direction_draft` appear:
   `grep -n "direction_drafts\|apply_direction_draft" src/types/database.ts`.
3. MCP `get_advisors` (type `security`). Expected: no new warning that names `direction_drafts`,
   `direction_drafts_guard` or `apply_direction_draft`. If `function_search_path_mutable` appears, the function is
   missing `set search_path = ''`; fix it in a new migration.

- [ ] **Step 7: Type check and commit**

Run `npx tsc --noEmit`. Expected: no errors.

```bash
git add supabase/migrations/*_direction_drafts.sql supabase/tests/rls/direction_drafts.sql src/types/database.ts
git commit -m "DB: direction_drafts + apply_direction_draft (AI setup, one-step apply)"
```

---

### Task 2: Schemas and pure draft logic

**Files:**
- Create: `src/features/ai/schemas/direction-setup.schema.ts`
- Create: `src/features/ai/utils/direction-draft.ts`
- Test: `tests/unit/direction-draft.test.ts`

**Interfaces:**
- Consumes: `CRITERION_KINDS`, `HABIT_RULES` from `src/features/direction/domain/direction.types.ts`.
- Produces:
  - `setupAnswersSchema`, `type SetupAnswers = { identity: string; outcome: string; timePlace: string;
    existingRoutines: string; pastBarriers: string }`.
  - `aiDirectionDraftSchema`, `type AiDirectionDraft` (lenient; `identityLinks: string[]`).
  - `directionDraftSchema`, `type DirectionDraft`, `type IdentityLink = { existingId: string } | { newIndex: number }`.
  - `draftIdSchema` (`{ draftId }`), `applyDraftSchema` (`{ draftId, payload: DirectionDraft }`).
  - `type ExistingDirection = { hasPurpose: boolean; identities: { id: string; name: string }[] }`.
  - `sanitizeDirectionDraft(ai: AiDirectionDraft, existing: ExistingDirection): DirectionDraft`
  - `reconcileDraft(payload: DirectionDraft, existing: ExistingDirection): DirectionDraft`
  - `removeIdentity(d, index)`, `removeCriterion(d, index)`, `removeProtocol(d, index)`, `removeHabit(d, index)`,
    `toggleIdentityLink(d, link: IdentityLink)`: each `(DirectionDraft, …) => DirectionDraft`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/direction-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  aiDirectionDraftSchema,
  directionDraftSchema,
  setupAnswersSchema,
  type AiDirectionDraft,
  type DirectionDraft,
} from "@/features/ai/schemas/direction-setup.schema";
import {
  reconcileDraft,
  removeIdentity,
  removeProtocol,
  sanitizeDirectionDraft,
  toggleIdentityLink,
  type ExistingDirection,
} from "@/features/ai/utils/direction-draft";

const EXISTING_ID = "00000000-0000-4000-a000-000000000001";
const empty: ExistingDirection = { hasPurpose: false, identities: [] };

const ai = (over: Partial<AiDirectionDraft> = {}): AiDirectionDraft => ({
  purpose: { statement: "배운 것을 나누는 삶", why: "뿌리" },
  identities: [{ name: "매일 쓰는 사람", description: null, why: "정체성" }],
  mission: {
    title: "글 12편 공개",
    outcome: null,
    why: "결과",
    criteria: [{ label: "공개한 글", kind: "numeric", targetValue: 12, unit: "편" }],
  },
  identityLinks: ["매일 쓰는 사람"],
  path: { title: "매일 쓰기", approach: "매일 짧게 쓴다", tradeOffs: null, why: "시스템" },
  protocols: [{ title: "커피 후 책상에서 25분 쓰기", steps: ["메모 열기"], intendedMinutes: 25, why: "의도" }],
  habits: [{ title: "메모 열기", rule: "check", targetMinutes: null, weekdays: [1, 2, 3, 4, 5], protocolIndex: 0, why: "2분" }],
  ...over,
});

describe("setupAnswersSchema", () => {
  it("requires outcome and time/place, even when only whitespace is sent", () => {
    const r = setupAnswersSchema.safeParse({ outcome: "   ", timePlace: "아침 책상" });
    expect(r.success).toBe(false);
    expect(setupAnswersSchema.parse({ outcome: "글 12편", timePlace: "아침 책상" })).toEqual({
      identity: "",
      outcome: "글 12편",
      timePlace: "아침 책상",
      existingRoutines: "",
      pastBarriers: "",
    });
  });
  it("caps answers at 500 characters", () => {
    expect(setupAnswersSchema.safeParse({ outcome: "x".repeat(501), timePlace: "a" }).success).toBe(false);
  });
});

describe("sanitizeDirectionDraft", () => {
  it("produces a strict draft and resolves new identity links", () => {
    const d = sanitizeDirectionDraft(ai(), empty);
    expect(directionDraftSchema.safeParse(d).success).toBe(true);
    expect(d.identityLinks).toEqual([{ newIndex: 0 }]);
  });
  it("drops the purpose when one is active", () => {
    expect(sanitizeDirectionDraft(ai(), { ...empty, hasPurpose: true }).purpose).toBeNull();
  });
  it("links to an existing identity instead of duplicating it (case and spacing ignored)", () => {
    const d = sanitizeDirectionDraft(ai({ identities: [{ name: " 매일  쓰는 사람 ", description: null, why: "" }], identityLinks: ["매일 쓰는 사람"] }), {
      hasPurpose: false,
      identities: [{ id: EXISTING_ID, name: "매일 쓰는 사람" }],
    });
    expect(d.identities).toEqual([]);
    expect(d.identityLinks).toEqual([{ existingId: EXISTING_ID }]);
  });
  it("drops unknown link names and duplicate links", () => {
    const d = sanitizeDirectionDraft(ai({ identityLinks: ["매일 쓰는 사람", "없는 정체성", "매일 쓰는 사람"] }), empty);
    expect(d.identityLinks).toEqual([{ newIndex: 0 }]);
  });
  it("turns a focus habit without a valid protocol or minutes into a check habit", () => {
    const d = sanitizeDirectionDraft(
      ai({
        habits: [
          { title: "a", rule: "focus", targetMinutes: 20, weekdays: [1], protocolIndex: 5, why: "" },
          { title: "b", rule: "focus", targetMinutes: null, weekdays: [1], protocolIndex: 0, why: "" },
          { title: "c", rule: "focus", targetMinutes: 3, weekdays: [1], protocolIndex: 0, why: "" },
        ],
      }),
      empty,
    );
    expect(d.habits.map((h) => [h.rule, h.targetMinutes, h.protocolIndex])).toEqual([
      ["check", null, null],
      ["check", null, 0],
      ["focus", 5, 0],
    ]);
  });
  it("fixes weekdays: unique, sorted, 1..7, empty → Mon–Fri", () => {
    const d = sanitizeDirectionDraft(
      ai({
        habits: [
          { title: "a", rule: "check", targetMinutes: null, weekdays: [7, 0, 3, 3, 9], protocolIndex: null, why: "" },
          { title: "b", rule: "check", targetMinutes: null, weekdays: [], protocolIndex: null, why: "" },
        ],
      }),
      empty,
    );
    expect(d.habits.map((h) => h.weekdays)).toEqual([[3, 7], [1, 2, 3, 4, 5]]);
  });
  it("makes a numeric criterion without a positive target a check criterion", () => {
    const d = sanitizeDirectionDraft(
      ai({ mission: { title: "m", outcome: null, why: "", criteria: [{ label: "x", kind: "numeric", targetValue: 0, unit: "편" }] } }),
      empty,
    );
    expect(d.mission.criteria[0]).toEqual({ label: "x", kind: "check", targetValue: null, unit: null });
  });
  it("caps counts and lengths and clamps minutes", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ title: `p${i}`, steps: Array(20).fill("s"), intendedMinutes: 9999, why: "" }));
    const d = sanitizeDirectionDraft(ai({ protocols: many, mission: { ...ai().mission, title: "t".repeat(300) } }), empty);
    expect(d.protocols).toHaveLength(3);
    expect(d.protocols[0].steps).toHaveLength(12);
    expect(d.protocols[0].intendedMinutes).toBe(600);
    expect(d.mission.title).toHaveLength(120);
  });
  it("remaps habit protocol indexes when empty protocols are dropped", () => {
    const d = sanitizeDirectionDraft(
      ai({
        protocols: [
          { title: "  ", steps: [], intendedMinutes: null, why: "" },
          { title: "real", steps: [], intendedMinutes: 20, why: "" },
        ],
        habits: [{ title: "h", rule: "focus", targetMinutes: 20, weekdays: [1], protocolIndex: 1, why: "" }],
      }),
      empty,
    );
    expect(d.habits[0].protocolIndex).toBe(0);
  });
  it("accepts the lenient AI shape", () => {
    expect(aiDirectionDraftSchema.safeParse(ai()).success).toBe(true);
  });
});

describe("directionDraftSchema", () => {
  const ok = (): DirectionDraft => sanitizeDirectionDraft(ai(), empty);
  it("rejects a link with both or neither of existingId / newIndex", () => {
    expect(directionDraftSchema.safeParse({ ...ok(), identityLinks: [{ existingId: EXISTING_ID, newIndex: 0 }] }).success).toBe(false);
    expect(directionDraftSchema.safeParse({ ...ok(), identityLinks: [{}] }).success).toBe(false);
  });
  it("rejects a newIndex outside the identities and a protocolIndex outside the protocols", () => {
    expect(directionDraftSchema.safeParse({ ...ok(), identityLinks: [{ newIndex: 1 }] }).success).toBe(false);
    const d = ok();
    expect(directionDraftSchema.safeParse({ ...d, habits: [{ ...d.habits[0], protocolIndex: 3 }] }).success).toBe(false);
  });
  it("rejects a focus habit without minutes", () => {
    const d = ok();
    expect(directionDraftSchema.safeParse({ ...d, habits: [{ ...d.habits[0], rule: "focus", targetMinutes: null }] }).success).toBe(false);
  });
});

describe("reconcileDraft", () => {
  it("drops a purpose created since generation and keeps one purpose", () => {
    const d = reconcileDraft(sanitizeDirectionDraft(ai(), empty), { hasPurpose: true, identities: [] });
    expect(d.purpose).toBeNull();
  });
  it("maps a new identity that now exists to the existing id and drops unknown existing ids", () => {
    const d = sanitizeDirectionDraft(ai(), empty);
    const withStale = { ...d, identityLinks: [...d.identityLinks, { existingId: "00000000-0000-4000-a000-0000000000ff" }] };
    const r = reconcileDraft(withStale, { hasPurpose: false, identities: [{ id: EXISTING_ID, name: "매일 쓰는 사람" }] });
    expect(r.identities).toEqual([]);
    expect(r.identityLinks).toEqual([{ existingId: EXISTING_ID }]);
  });
});

describe("edit helpers", () => {
  it("removeProtocol unlinks its habits (focus → check) and shifts later indexes", () => {
    const base = sanitizeDirectionDraft(
      ai({
        protocols: [
          { title: "p0", steps: [], intendedMinutes: 20, why: "" },
          { title: "p1", steps: [], intendedMinutes: 20, why: "" },
        ],
        habits: [
          { title: "h0", rule: "focus", targetMinutes: 20, weekdays: [1], protocolIndex: 0, why: "" },
          { title: "h1", rule: "focus", targetMinutes: 20, weekdays: [1], protocolIndex: 1, why: "" },
        ],
      }),
      empty,
    );
    const d = removeProtocol(base, 0);
    expect(d.protocols.map((p) => p.title)).toEqual(["p1"]);
    expect(d.habits.map((h) => [h.rule, h.targetMinutes, h.protocolIndex])).toEqual([
      ["check", null, null],
      ["focus", 20, 0],
    ]);
    expect(directionDraftSchema.safeParse(d).success).toBe(true);
  });
  it("removeIdentity drops its links and shifts later newIndex links", () => {
    const base = sanitizeDirectionDraft(
      ai({
        identities: [
          { name: "A", description: null, why: "" },
          { name: "B", description: null, why: "" },
        ],
        identityLinks: ["A", "B"],
      }),
      empty,
    );
    expect(removeIdentity(base, 0).identityLinks).toEqual([{ newIndex: 0 }]);
  });
  it("toggleIdentityLink adds and removes a link", () => {
    const base = sanitizeDirectionDraft(ai({ identityLinks: [] }), empty);
    const on = toggleIdentityLink(base, { newIndex: 0 });
    expect(on.identityLinks).toEqual([{ newIndex: 0 }]);
    expect(toggleIdentityLink(on, { newIndex: 0 }).identityLinks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/direction-draft.test.ts`
Expected: FAIL, `Cannot find module '@/features/ai/schemas/direction-setup.schema'`.

- [ ] **Step 3: Write the schemas**

`src/features/ai/schemas/direction-setup.schema.ts`:

```ts
import { z } from "zod";
import { CRITERION_KINDS, HABIT_RULES } from "@/features/direction/domain/direction.types";

/** Setup wizard (spec 2026-10-01-ai-direction-setup). Limits match the direction tables and direction.schema.ts. */
export const SETUP_ANSWER_MAX = 500;
const answer = z.string().trim().max(SETUP_ANSWER_MAX);
export const setupAnswersSchema = z.object({
  identity: answer.default(""),
  outcome: answer.min(1, "이루고 싶은 결과를 적어 주세요."),
  timePlace: answer.min(1, "쓸 수 있는 시간과 장소를 적어 주세요."),
  existingRoutines: answer.default(""),
  pastBarriers: answer.default(""),
});
export type SetupAnswers = z.infer<typeof setupAnswersSchema>;

/** What the model is asked to return. Lenient on purpose: sanitizeDirectionDraft enforces the limits. */
export const aiDirectionDraftSchema = z.object({
  purpose: z.object({ statement: z.string(), why: z.string() }).nullable(),
  identities: z.array(z.object({ name: z.string(), description: z.string().nullable(), why: z.string() })),
  mission: z.object({
    title: z.string(),
    outcome: z.string().nullable(),
    why: z.string(),
    criteria: z.array(
      z.object({ label: z.string(), kind: z.enum(CRITERION_KINDS), targetValue: z.number().nullable(), unit: z.string().nullable() }),
    ),
  }),
  identityLinks: z.array(z.string()),
  path: z.object({ title: z.string(), approach: z.string(), tradeOffs: z.string().nullable(), why: z.string() }),
  protocols: z.array(
    z.object({ title: z.string(), steps: z.array(z.string()), intendedMinutes: z.number().nullable(), why: z.string() }),
  ),
  habits: z.array(
    z.object({
      title: z.string(),
      rule: z.enum(HABIT_RULES),
      targetMinutes: z.number().nullable(),
      weekdays: z.array(z.number()),
      protocolIndex: z.number().nullable(),
      why: z.string(),
    }),
  ),
});
export type AiDirectionDraft = z.infer<typeof aiDirectionDraftSchema>;

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).nullable();
const why = z.string().trim().max(200);
const minutes = z.number().int().min(5).max(600);

export const identityLinkSchema = z.union([
  z.strictObject({ existingId: z.uuid() }),
  z.strictObject({ newIndex: z.number().int().min(0).max(1) }),
]);
export type IdentityLink = z.infer<typeof identityLinkSchema>;

/** The stored and applied draft. The apply RPC reads exactly these keys. */
export const directionDraftSchema = z
  .object({
    purpose: z.object({ statement: text(280), why }).nullable(),
    identities: z.array(z.object({ name: text(40), description: optText(280), why })).max(2),
    mission: z.object({
      title: text(120),
      outcome: optText(500),
      why,
      criteria: z
        .array(
          z
            .object({
              label: text(120),
              kind: z.enum(CRITERION_KINDS),
              targetValue: z.number().positive().max(1e9).nullable(),
              unit: optText(12),
            })
            .refine((c) => (c.kind === "check" ? c.targetValue === null : c.targetValue !== null), "숫자 기준에는 목표값이 필요합니다."),
        )
        .min(1)
        .max(3),
    }),
    identityLinks: z.array(identityLinkSchema).max(6),
    path: z.object({ title: text(80), approach: text(1000), tradeOffs: optText(1000), why }),
    protocols: z
      .array(
        z.object({
          title: text(80),
          steps: z.array(z.string().trim().min(1).max(120)).max(12),
          intendedMinutes: minutes.nullable(),
          why,
        }),
      )
      .min(1)
      .max(3),
    habits: z
      .array(
        z
          .object({
            title: text(80),
            rule: z.enum(HABIT_RULES),
            targetMinutes: minutes.nullable(),
            weekdays: z
              .array(z.number().int().min(1).max(7))
              .min(1)
              .max(7)
              .refine((d) => new Set(d).size === d.length, "요일이 중복되었습니다."),
            protocolIndex: z.number().int().min(0).max(2).nullable(),
            why,
          })
          .refine(
            (h) => (h.rule === "check" ? h.targetMinutes === null : h.targetMinutes !== null && h.protocolIndex !== null),
            "집중 시간 규칙에는 실행 의도와 목표 시간이 필요합니다.",
          ),
      )
      .max(3),
  })
  .superRefine((d, ctx) => {
    d.identityLinks.forEach((l, i) => {
      if ("newIndex" in l && l.newIndex >= d.identities.length) {
        ctx.addIssue({ code: "custom", path: ["identityLinks", i], message: "연결할 정체성이 없습니다." });
      }
    });
    d.habits.forEach((h, i) => {
      if (h.protocolIndex !== null && h.protocolIndex >= d.protocols.length) {
        ctx.addIssue({ code: "custom", path: ["habits", i, "protocolIndex"], message: "연결할 실행 의도가 없습니다." });
      }
    });
  });
export type DirectionDraft = z.infer<typeof directionDraftSchema>;

export const draftIdSchema = z.object({ draftId: z.uuid() });
export const applyDraftSchema = z.object({ draftId: z.uuid(), payload: directionDraftSchema });
```

- [ ] **Step 4: Write the pure logic**

`src/features/ai/utils/direction-draft.ts`:

```ts
import type { AiDirectionDraft, DirectionDraft, IdentityLink } from "../schemas/direction-setup.schema";

/** Pure rules for the setup draft (spec §4). No I/O; callers validate the result with directionDraftSchema. */
export type ExistingDirection = { hasPurpose: boolean; identities: { id: string; name: string }[] };

export const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];
const MAX = { identities: 2, criteria: 3, protocols: 3, habits: 3, links: 6, steps: 12 } as const;

const clip = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const clipOrNull = (s: string | null | undefined, max: number) => clip(s, max) || null;
const why = (s: string | null | undefined) => clip(s, 200);
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
function clampMinutes(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.min(600, Math.max(5, Math.round(n)));
}
function fixWeekdays(days: number[]): number[] {
  const valid = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
  return valid.length ? valid : DEFAULT_WEEKDAYS;
}

/** New identities that don't duplicate an existing one or each other. */
function freshIdentities(list: DirectionDraft["identities"], existing: ExistingDirection) {
  const taken = new Set(existing.identities.map((i) => norm(i.name)));
  const out: DirectionDraft["identities"] = [];
  for (const i of list) {
    if (!i.name || taken.has(norm(i.name))) continue;
    taken.add(norm(i.name));
    out.push(i);
  }
  return out.slice(0, MAX.identities);
}

/** Names → links: existing active identity first, then a proposed one; unknown names and duplicates dropped. */
function linksFromNames(names: string[], identities: DirectionDraft["identities"], existing: ExistingDirection): IdentityLink[] {
  const out: IdentityLink[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const ex = existing.identities.find((i) => norm(i.name) === norm(name));
    const idx = identities.findIndex((i) => norm(i.name) === norm(name));
    const link: IdentityLink | null = ex ? { existingId: ex.id } : idx >= 0 ? { newIndex: idx } : null;
    if (!link) continue;
    const key = JSON.stringify(link);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out.slice(0, MAX.links);
}

export function sanitizeDirectionDraft(ai: AiDirectionDraft, existing: ExistingDirection): DirectionDraft {
  const statement = clip(ai.purpose?.statement, 280);
  const identities = freshIdentities(
    ai.identities.map((i) => ({ name: clip(i.name, 40), description: clipOrNull(i.description, 280), why: why(i.why) })),
    existing,
  );
  const criteria = ai.mission.criteria
    .map((c) => {
      const label = clip(c.label, 120);
      const numeric = c.kind === "numeric" && c.targetValue !== null && Number.isFinite(c.targetValue) && c.targetValue > 0;
      return numeric
        ? { label, kind: "numeric" as const, targetValue: Math.min(c.targetValue!, 1e9), unit: clipOrNull(c.unit, 12) }
        : { label, kind: "check" as const, targetValue: null, unit: null };
    })
    .filter((c) => c.label)
    .slice(0, MAX.criteria);

  // Old protocol index → new index, after dropping untitled ones and capping.
  const protoMap = new Map<number, number>();
  const protocols: DirectionDraft["protocols"] = [];
  ai.protocols.forEach((p, i) => {
    const title = clip(p.title, 80);
    if (!title || protocols.length >= MAX.protocols) return;
    protoMap.set(i, protocols.length);
    protocols.push({
      title,
      steps: p.steps.map((s) => clip(s, 120)).filter(Boolean).slice(0, MAX.steps),
      intendedMinutes: clampMinutes(p.intendedMinutes),
      why: why(p.why),
    });
  });

  const habits = ai.habits
    .map((h) => {
      const protocolIndex = h.protocolIndex === null ? null : (protoMap.get(h.protocolIndex) ?? null);
      const target = clampMinutes(h.targetMinutes);
      const focus = h.rule === "focus" && protocolIndex !== null && target !== null;
      return {
        title: clip(h.title, 80),
        rule: focus ? ("focus" as const) : ("check" as const),
        targetMinutes: focus ? target : null,
        weekdays: fixWeekdays(h.weekdays),
        protocolIndex,
        why: why(h.why),
      };
    })
    .filter((h) => h.title)
    .slice(0, MAX.habits);

  return {
    purpose: existing.hasPurpose || !statement ? null : { statement, why: why(ai.purpose?.why) },
    identities,
    mission: { title: clip(ai.mission.title, 120), outcome: clipOrNull(ai.mission.outcome, 500), why: why(ai.mission.why), criteria },
    identityLinks: linksFromNames(ai.identityLinks, identities, existing),
    path: {
      title: clip(ai.path.title, 80),
      approach: clip(ai.path.approach, 1000),
      tradeOffs: clipOrNull(ai.path.tradeOffs, 1000),
      why: why(ai.path.why),
    },
    protocols,
    habits,
  };
}

/** Re-apply the purpose / identity / link rules to an edited payload against the state at apply time. */
export function reconcileDraft(payload: DirectionDraft, existing: ExistingDirection): DirectionDraft {
  const names = payload.identityLinks.flatMap((l) => {
    if ("existingId" in l) return existing.identities.filter((i) => i.id === l.existingId).map((i) => i.name);
    const i = payload.identities[l.newIndex];
    return i ? [i.name] : [];
  });
  const identities = freshIdentities(payload.identities, existing);
  return {
    ...payload,
    purpose: existing.hasPurpose ? null : payload.purpose,
    identities,
    identityLinks: linksFromNames(names, identities, existing),
  };
}

export function removeIdentity(d: DirectionDraft, index: number): DirectionDraft {
  return {
    ...d,
    identities: d.identities.filter((_, i) => i !== index),
    identityLinks: d.identityLinks.flatMap((l) => {
      if (!("newIndex" in l)) return [l];
      if (l.newIndex === index) return [];
      return [l.newIndex > index ? { newIndex: l.newIndex - 1 } : l];
    }),
  };
}

export function removeCriterion(d: DirectionDraft, index: number): DirectionDraft {
  return { ...d, mission: { ...d.mission, criteria: d.mission.criteria.filter((_, i) => i !== index) } };
}

/** Habits on the removed intention become unlinked check habits; later indexes shift down. */
export function removeProtocol(d: DirectionDraft, index: number): DirectionDraft {
  return {
    ...d,
    protocols: d.protocols.filter((_, i) => i !== index),
    habits: d.habits.map((h) => {
      if (h.protocolIndex === null) return h;
      if (h.protocolIndex === index) return { ...h, protocolIndex: null, rule: "check", targetMinutes: null };
      return h.protocolIndex > index ? { ...h, protocolIndex: h.protocolIndex - 1 } : h;
    }),
  };
}

export function removeHabit(d: DirectionDraft, index: number): DirectionDraft {
  return { ...d, habits: d.habits.filter((_, i) => i !== index) };
}

const sameLink = (a: IdentityLink, b: IdentityLink) => JSON.stringify(a) === JSON.stringify(b);
export function toggleIdentityLink(d: DirectionDraft, link: IdentityLink): DirectionDraft {
  const has = d.identityLinks.some((l) => sameLink(l, link));
  return { ...d, identityLinks: has ? d.identityLinks.filter((l) => !sameLink(l, link)) : [...d.identityLinks, link] };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/unit/direction-draft.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Type check, lint, commit**

Run: `npx tsc --noEmit && npx eslint src/features/ai tests/unit/direction-draft.test.ts`
Expected: no errors.

```bash
git add src/features/ai/schemas/direction-setup.schema.ts src/features/ai/utils/direction-draft.ts tests/unit/direction-draft.test.ts
git commit -m "AI setup: draft schemas, sanitize/reconcile and edit helpers"
```

---

### Task 3: Prompt, fake output, queries, service and actions

**Files:**
- Create: `src/features/ai/prompts/direction-setup.prompt.ts`
- Create: `src/features/ai/providers/fake-direction-setup.ts`
- Modify: `src/features/ai/providers/fake.ts` (register `direction_setup`)
- Create: `src/features/ai/queries/direction-draft.queries.ts`
- Create: `src/features/ai/services/direction-setup.service.ts`
- Create: `src/features/ai/actions/direction-setup.actions.ts`
- Test: `tests/unit/direction-draft.test.ts` (append)

**Interfaces:**
- Consumes (Task 2): `setupAnswersSchema`, `aiDirectionDraftSchema`, `directionDraftSchema`, `draftIdSchema`,
  `applyDraftSchema`, `sanitizeDirectionDraft`, `reconcileDraft`, `ExistingDirection`.
- Consumes (Task 1): the `direction_drafts` table and the `apply_direction_draft` RPC.
- Produces:
  - `DIRECTION_SETUP_PROMPT_VERSION`, `DIRECTION_SETUP_SYSTEM`, and
    `directionSetupPrompt(input: { answers: SetupAnswers; purpose: string | null; identities: string[] }): string`.
  - `fakeDirectionDraft(input: { purpose: string | null; identities: string[] }): AiDirectionDraft`.
  - `getExistingDirection(supabase, userId): Promise<ExistingDirection & { purposeStatement: string | null }>`.
  - `getOpenDirectionDraft(supabase, userId): Promise<OpenDirectionDraft | null>`, where
    `type OpenDirectionDraft = { id: string; answers: SetupAnswers; draft: DirectionDraft }`.
  - Service functions:
    - `generateDirectionDraft(ctx, answers): Promise<{ draftId: string; draft: DirectionDraft }>`;
    - `regenerateDirectionDraft(ctx, draftId): Promise<{ draftId: string; draft: DirectionDraft }>`;
    - `discardDirectionDraft(ctx, draftId): Promise<void>`;
    - `applyDirectionDraft(ctx, draftId, payload): Promise<{ missionId: string }>`.
  - Actions: `generateDirectionDraftAction`, `regenerateDirectionDraftAction`, `discardDirectionDraftAction`,
    `applyDirectionDraftAction`. Each takes `input: unknown` and returns `ActionResult<…>`.

- [ ] **Step 1: Write the failing tests (copy and fixture wording)**

Append to `tests/unit/direction-draft.test.ts`:

```ts
import { DENY_LIST } from "@/features/direction/domain/status-text";
import { DIRECTION_SETUP_SYSTEM, directionSetupPrompt } from "@/features/ai/prompts/direction-setup.prompt";
import { fakeDirectionDraft } from "@/features/ai/providers/fake-direction-setup";

describe("setup prompt and fake draft", () => {
  it("never use judgment words", () => {
    const texts = [DIRECTION_SETUP_SYSTEM, JSON.stringify(fakeDirectionDraft({ purpose: null, identities: [] }))];
    for (const t of texts) for (const w of DENY_LIST) expect(t.toLowerCase()).not.toContain(w);
  });
  it("the prompt carries the input as JSON after the first brace", () => {
    const p = directionSetupPrompt({ answers: setupAnswersSchema.parse({ outcome: "o", timePlace: "t" }), purpose: null, identities: ["A"] });
    expect(JSON.parse(p.slice(p.indexOf("{")))).toMatchObject({ purpose: null, identities: ["A"] });
  });
  it("the fake draft sanitizes into a valid draft and skips the purpose when one exists", () => {
    const fake = fakeDirectionDraft({ purpose: "기존", identities: ["매일 쓰는 사람"] });
    expect(fake.purpose).toBeNull();
    const d = sanitizeDirectionDraft(fake, { hasPurpose: true, identities: [{ id: EXISTING_ID, name: "매일 쓰는 사람" }] });
    expect(directionDraftSchema.safeParse(d).success).toBe(true);
    expect(d.identityLinks).toContainEqual({ existingId: EXISTING_ID });
  });
});
```

Move the three new `import` lines to the top of the file with the other imports.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/direction-draft.test.ts`
Expected: FAIL, `Cannot find module '@/features/ai/prompts/direction-setup.prompt'`.

- [ ] **Step 3: Write the prompt**

`src/features/ai/prompts/direction-setup.prompt.ts`:

```ts
import type { SetupAnswers } from "../schemas/direction-setup.schema";

export const DIRECTION_SETUP_PROMPT_VERSION = "direction-setup-v1";
export const DIRECTION_SETUP_SYSTEM = [
  "You help one person set up a personal habit system that follows Atomic Habits. You never judge the person.",
  "Write every user-facing string in natural, warm, neutral Korean. Keep sentences short.",
  "Start from identity: who the person wants to become matters more than the outcome.",
  "purpose: one sentence (<= 280 chars) about what the person values when input.purpose is null; when it is set, return null.",
  "identities: 0-2 short noun phrases (<= 40 chars) that complete 'I am a person who ...'. Never repeat input.identities.",
  "mission: one outcome reachable in about six months, based on answers.outcome. title <= 120 chars.",
  "criteria: 1-3 measurable success criteria. kind 'numeric' needs targetValue > 0 and a short unit; otherwise 'check' with null targetValue and unit.",
  "identityLinks: names of the existing or proposed identities this outcome serves.",
  "path: the system. title <= 80 chars; approach = what is repeated and how; tradeOffs = what the person gives up or stops doing.",
  "protocols: 1-3 implementation intentions. title <= 80 chars in the form '<when/cue>, <where> <what>' using answers.timePlace. steps: up to 5 short steps. intendedMinutes: realistic, 5-600.",
  "habits: 1-3 two-minute versions of the protocols, stacked on answers.existingRoutines when possible ('<existing routine> 후 <tiny action>'). title <= 80 chars.",
  "habit rule: 'check' by default. Use 'focus' just for timed practice of a protocol, with protocolIndex (0-based) and targetMinutes.",
  "weekdays: ISO numbers, 1 = Monday ... 7 = Sunday.",
  "Respect answers.pastBarriers: prefer fewer, smaller items that are easy to start.",
  "why: one short Korean sentence per item (<= 120 chars) naming the Atomic Habits idea it uses.",
].join("\n");

export function directionSetupPrompt(input: { answers: SetupAnswers; purpose: string | null; identities: string[] }): string {
  return `Draft the setup from this interview. Input JSON:\n${JSON.stringify(input)}`;
}
```

- [ ] **Step 4: Write the fake draft and register it**

`src/features/ai/providers/fake-direction-setup.ts`:

```ts
import type { AiDirectionDraft } from "../schemas/direction-setup.schema";

/** Fixed setup draft for AI_PROVIDER=fake. No server-only import, so unit tests can check its wording. */
export function fakeDirectionDraft(input: { purpose: string | null; identities: string[] }): AiDirectionDraft {
  return {
    purpose: input.purpose ? null : { statement: "배운 것을 나누며 성장하는 삶", why: "정체성의 뿌리가 되는 믿음입니다." },
    identities: [{ name: "매일 쓰는 사람", description: null, why: "결과보다 정체성에서 시작합니다." }],
    mission: {
      title: "글 12편 공개",
      outcome: "6개월 동안 배운 것을 글로 정리해 공개합니다.",
      why: "측정할 수 있는 결과로 방향을 정합니다.",
      criteria: [{ label: "공개한 글", kind: "numeric", targetValue: 12, unit: "편" }],
    },
    identityLinks: ["매일 쓰는 사람", ...input.identities.slice(0, 1)],
    path: {
      title: "매일 조금씩 쓰기",
      approach: "평일 아침마다 짧게 쓰고 주말에 다듬어 공개합니다.",
      tradeOffs: "평일 저녁 영상 시청을 줄입니다.",
      why: "목표보다 시스템입니다.",
    },
    protocols: [
      { title: "출근 후 커피를 내리면, 책상에서 25분 쓰기", steps: ["메모 앱 열기", "한 문단 쓰기"], intendedMinutes: 25, why: "언제·어디서를 정해 두면 시작이 쉬워집니다." },
    ],
    habits: [
      { title: "커피 내린 뒤 메모 앱 열기", rule: "check", targetMinutes: null, weekdays: [1, 2, 3, 4, 5], protocolIndex: 0, why: "2분 규칙으로 작게 시작합니다." },
      { title: "쓰기 25분", rule: "focus", targetMinutes: 25, weekdays: [1, 2, 3, 4, 5], protocolIndex: 0, why: "타이머로 기록하면 자동으로 체크됩니다." },
    ],
  };
}
```

In `src/features/ai/providers/fake.ts`, add the import under the existing imports:

```ts
import { fakeDirectionDraft } from "./fake-direction-setup";
```

and add this entry inside `FAKE_OUTPUTS` (before `quest_picker`):

```ts
  direction_setup: (prompt) => fakeDirectionDraft(JSON.parse(prompt.slice(prompt.indexOf("{"))) as { purpose: string | null; identities: string[] }),
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/unit/direction-draft.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the queries**

`src/features/ai/queries/direction-draft.queries.ts`:

```ts
import "server-only";
import { fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { directionDraftSchema, setupAnswersSchema, type DirectionDraft, type SetupAnswers } from "../schemas/direction-setup.schema";
import type { ExistingDirection } from "../utils/direction-draft";

export type OpenDirectionDraft = { id: string; answers: SetupAnswers; draft: DirectionDraft };

/** Active purpose and active identities: the state the setup draft must never overwrite. */
export async function getExistingDirection(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<ExistingDirection & { purposeStatement: string | null }> {
  const [purpose, identities] = await Promise.all([
    supabase.from("purposes").select("statement").eq("user_id", userId).eq("status", "active").maybeSingle(),
    supabase.from("identities").select("id, name").eq("user_id", userId).eq("status", "active").order("sort_order"),
  ]);
  if (purpose.error) throw fromDbError(purpose.error);
  if (identities.error) throw fromDbError(identities.error);
  return { hasPurpose: purpose.data !== null, purposeStatement: purpose.data?.statement ?? null, identities: identities.data };
}

/** The user's open (proposed) draft, or null. A row that no longer parses is treated as absent. */
export async function getOpenDirectionDraft(supabase: SupabaseServerClient, userId: string): Promise<OpenDirectionDraft | null> {
  const { data, error } = await supabase
    .from("direction_drafts")
    .select("id, answers, draft")
    .eq("user_id", userId)
    .eq("status", "proposed")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) return null;
  const answers = setupAnswersSchema.safeParse(data.answers);
  const draft = directionDraftSchema.safeParse(data.draft);
  return answers.success && draft.success ? { id: data.id, answers: answers.data, draft: draft.data } : null;
}
```

- [ ] **Step 7: Write the service**

`src/features/ai/services/direction-setup.service.ts`:

```ts
import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { DIRECTION_SETUP_PROMPT_VERSION, DIRECTION_SETUP_SYSTEM, directionSetupPrompt } from "../prompts/direction-setup.prompt";
import { getExistingDirection } from "../queries/direction-draft.queries";
import {
  aiDirectionDraftSchema,
  directionDraftSchema,
  setupAnswersSchema,
  type DirectionDraft,
  type SetupAnswers,
} from "../schemas/direction-setup.schema";
import { reconcileDraft, sanitizeDirectionDraft } from "../utils/direction-draft";
import { sanitizeForPrompt } from "../utils/prompt-input";
import { callAi } from "./budget.service";

type Generated = { draftId: string; draft: DirectionDraft };

/** Interview → one budgeted AI call → sanitized draft stored as the single open (proposed) draft. */
export async function generateDirectionDraft(ctx: ActionContext, answers: SetupAnswers): Promise<Generated> {
  const uid = ctx.user.id;
  const existing = await getExistingDirection(ctx.supabase, uid);
  const clean: SetupAnswers = {
    identity: sanitizeForPrompt(answers.identity, 500),
    outcome: sanitizeForPrompt(answers.outcome, 500),
    timePlace: sanitizeForPrompt(answers.timePlace, 500),
    existingRoutines: sanitizeForPrompt(answers.existingRoutines, 500),
    pastBarriers: sanitizeForPrompt(answers.pastBarriers, 500),
  };
  const result = await callAi(ctx, "direction_setup", {
    task: "direction_setup",
    system: DIRECTION_SETUP_SYSTEM,
    prompt: directionSetupPrompt({
      answers: clean,
      purpose: existing.purposeStatement ? sanitizeForPrompt(existing.purposeStatement, 280) : null,
      identities: existing.identities.map((i) => sanitizeForPrompt(i.name, 40)),
    }),
    schema: aiDirectionDraftSchema,
    effort: "medium",
  });
  const parsed = directionDraftSchema.safeParse(sanitizeDirectionDraft(result.data, existing));
  if (!parsed.success) throw new AppError("AI_OUTPUT_INVALID");

  const closed = await ctx.supabase.from("direction_drafts").update({ status: "discarded" }).eq("user_id", uid).eq("status", "proposed");
  if (closed.error) throw fromDbError(closed.error);
  const { data, error } = await ctx.supabase
    .from("direction_drafts")
    .insert({
      user_id: uid,
      answers: clean,
      draft: parsed.data as never,
      status: "proposed",
      provider: result.provider,
      model: result.model,
      prompt_version: DIRECTION_SETUP_PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  return { draftId: data.id, draft: parsed.data };
}

/** Same answers, new call. generateDirectionDraft discards the current draft. */
export async function regenerateDirectionDraft(ctx: ActionContext, draftId: string): Promise<Generated> {
  const { data, error } = await ctx.supabase
    .from("direction_drafts")
    .select("answers")
    .eq("id", draftId)
    .eq("user_id", ctx.user.id)
    .eq("status", "proposed")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("CONFLICT", "이미 적용했거나 버린 초안입니다.");
  const answers = setupAnswersSchema.safeParse(data.answers);
  if (!answers.success) throw new AppError("VALIDATION_ERROR");
  return generateDirectionDraft(ctx, answers.data);
}

export async function discardDirectionDraft(ctx: ActionContext, draftId: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("direction_drafts")
    .update({ status: "discarded" })
    .eq("id", draftId)
    .eq("user_id", ctx.user.id)
    .eq("status", "proposed")
    .select("id");
  if (error) throw fromDbError(error);
  if (data.length === 0) throw new AppError("CONFLICT", "이미 적용했거나 버린 초안입니다.");
}

/** Edited payload → reconciled against the current state → one transaction (apply_direction_draft). */
export async function applyDirectionDraft(ctx: ActionContext, draftId: string, payload: DirectionDraft): Promise<{ missionId: string }> {
  const existing = await getExistingDirection(ctx.supabase, ctx.user.id);
  const reconciled = directionDraftSchema.safeParse(reconcileDraft(payload, existing));
  if (!reconciled.success) throw new AppError("VALIDATION_ERROR");
  const { data, error } = await ctx.supabase.rpc("apply_direction_draft", { p_draft_id: draftId, p_payload: reconciled.data as never });
  if (error) {
    if (error.code === "P0001") throw new AppError("CONFLICT", "이미 적용했거나 버린 초안입니다.");
    if (error.code === "22023") throw new AppError("VALIDATION_ERROR");
    throw fromDbError(error);
  }
  return { missionId: data as string };
}
```

- [ ] **Step 8: Write the actions**

`src/features/ai/actions/direction-setup.actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { applyDraftSchema, draftIdSchema, setupAnswersSchema } from "../schemas/direction-setup.schema";
import {
  applyDirectionDraft,
  discardDirectionDraft,
  generateDirectionDraft,
  regenerateDirectionDraft,
} from "../services/direction-setup.service";

export async function generateDirectionDraftAction(input: unknown) {
  return runAction("ai.direction_setup.generate", setupAnswersSchema, input, (answers, ctx) => generateDirectionDraft(ctx, answers));
}

export async function regenerateDirectionDraftAction(input: unknown) {
  return runAction("ai.direction_setup.regenerate", draftIdSchema, input, ({ draftId }, ctx) => regenerateDirectionDraft(ctx, draftId));
}

export async function discardDirectionDraftAction(input: unknown) {
  return runAction("ai.direction_setup.discard", draftIdSchema, input, ({ draftId }, ctx) => discardDirectionDraft(ctx, draftId));
}

export async function applyDirectionDraftAction(input: unknown) {
  return runAction("ai.direction_setup.apply", applyDraftSchema, input, async ({ draftId, payload }, ctx) => {
    const result = await applyDirectionDraft(ctx, draftId, payload);
    revalidatePath("/scheduler", "layout");
    return result;
  });
}
```

- [ ] **Step 9: Verify and commit**

Run: `npx tsc --noEmit && npx eslint src/features/ai tests/unit && npx vitest run`
Expected: no type or lint errors, and all unit tests pass.

```bash
git add src/features/ai/prompts/direction-setup.prompt.ts src/features/ai/providers/fake-direction-setup.ts src/features/ai/providers/fake.ts \
  src/features/ai/queries/direction-draft.queries.ts src/features/ai/services/direction-setup.service.ts \
  src/features/ai/actions/direction-setup.actions.ts tests/unit/direction-draft.test.ts
git commit -m "AI setup: prompt, fake draft, generate/regenerate/discard/apply service and actions"
```

---

### Task 4: Wizard UI, setup page, entry points and E2E

**Files:**
- Create: `src/features/ai/components/direction-setup-wizard.tsx`
- Create: `src/app/(private)/scheduler/directive/setup/page.tsx`
- Modify: `src/app/(private)/scheduler/directive/page.tsx` (entry card + button)
- Modify: `src/features/manual/components/planner-manual.tsx` (§2 link)
- Modify: `tests/e2e/helpers.ts` (cleanup discards open drafts)
- Create: `tests/e2e/direction-setup.spec.ts`

**Interfaces:**
- Consumes (Task 3): the four actions, `getOpenDirectionDraft`, `getExistingDirection` and `OpenDirectionDraft`.
- Consumes (Task 2): `removeIdentity`, `removeCriterion`, `removeProtocol`, `removeHabit`, `toggleIdentityLink`,
  `DirectionDraft`, `SetupAnswers`.
- Produces:
  - route `/scheduler/directive/setup`;
  - accessible names used by the E2E:
    - form "세팅 인터뷰"; heading "초안 검토";
    - regions `초안 ${terms.directive}`, `초안 ${terms.habits}`;
    - buttons "적용", "다시 만들기", "버리기";
    - delete buttons `${terms.habit} ${n} 삭제` (1-based);
    - link "AI와 함께 세팅하기", link `AI로 ${terms.mission} 추가`.

- [ ] **Step 1: Write the failing E2E**

In `tests/e2e/helpers.ts`, in `cleanup()`, add this right before the comment `// Direction layer (G1).`:

```ts
  // AI setup drafts (ADR 0037) are history; close an open one so the next test can create a new one.
  await db.from("direction_drafts").update({ status: "discarded" }).eq("status", "proposed");
```

`tests/e2e/direction-setup.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0037: the setup wizard. The draft is seeded (no LLM cost), like the other AI flows (ADR 0018).
const draft = (stamp: number, links: unknown[], purpose: boolean) => ({
  purpose: purpose ? { statement: `${E2E_PREFIX} 나누며 성장 ${stamp}`, why: "뿌리" } : null,
  identities: [{ name: `${E2E_PREFIX} 쓰는 사람 ${stamp}`.slice(0, 40), description: null, why: "정체성" }],
  mission: {
    title: `${E2E_PREFIX} 글 12편 ${stamp}`,
    outcome: null,
    why: "결과",
    criteria: [{ label: "공개한 글", kind: "numeric", targetValue: 12, unit: "편" }],
  },
  identityLinks: links,
  path: { title: "매일 쓰기", approach: "평일 아침마다 짧게 쓴다", tradeOffs: "저녁 영상 줄이기", why: "시스템" },
  protocols: [{ title: "커피 후 책상에서 25분 쓰기", steps: ["메모 열기"], intendedMinutes: 25, why: "의도" }],
  habits: [
    { title: `${E2E_PREFIX} 메모 열기 ${stamp}`, rule: "check", targetMinutes: null, weekdays: [1, 2, 3, 4, 5, 6, 7], protocolIndex: 0, why: "2분" },
    { title: `${E2E_PREFIX} 쓰기 25분 ${stamp}`, rule: "focus", targetMinutes: 25, weekdays: [1, 2, 3, 4, 5, 6, 7], protocolIndex: 0, why: "집중" },
  ],
});

test.describe("AI direction setup", () => {
  test.beforeEach(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("empty user: card → review → remove a habit → apply", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const { data: before } = await db.from("player_profiles").select("gamification_enabled").maybeSingle();
    if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: false }).eq("user_id", uid);
    try {
      const stamp = Date.now();
      const d = draft(stamp, [{ newIndex: 0 }], true);
      const ins = await db.from("direction_drafts").insert({
        user_id: uid,
        answers: { identity: "", outcome: "글 공개", timePlace: "아침 책상", existingRoutines: "", pastBarriers: "" },
        draft: d,
        provider: "fake",
        model: "fake-1",
        prompt_version: "direction-setup-v1",
      });
      expect(ins.error).toBeNull();

      await login(page);
      await page.getByRole("navigation", { name: "플래너" }).getByRole("link", { name: "정체성" }).click();
      await page.getByRole("link", { name: "AI와 함께 세팅하기" }).click();
      await expect(page).toHaveURL(/\/scheduler\/directive\/setup$/);
      await expect(page.getByRole("heading", { name: "초안 검토" })).toBeVisible();
      await expect(page.getByRole("region", { name: "초안 신념" })).toBeVisible();

      await page.getByRole("button", { name: "습관 2 삭제" }).click();
      await page.getByRole("button", { name: "적용" }).click();
      await expect(page).toHaveURL(/\/scheduler\/directive\?mission=/);

      const detail = page.getByRole("region", { name: "결과 목표 상세" });
      await expect(detail.getByRole("heading", { name: d.mission.title })).toBeVisible();
      await expect(detail).toContainText("공개한 글");
      await expect(detail).toContainText("매일 쓰기");
      await expect(detail).toContainText("커피 후 책상에서 25분 쓰기");
      await expect(page.getByRole("listitem", { name: `습관 ${d.habits[0].title}` })).toBeVisible();
      await expect(page.getByRole("listitem", { name: `습관 ${d.habits[1].title}` })).toHaveCount(0);

      const { data: rows } = await db.from("direction_drafts").select("status").eq("status", "applied").order("applied_at", { ascending: false }).limit(1);
      expect(rows?.[0]?.status).toBe("applied");
    } finally {
      if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: true }).eq("user_id", uid);
    }
  });

  test("existing purpose and identity stay unchanged", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const { data: before } = await db.from("player_profiles").select("gamification_enabled").maybeSingle();
    if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: false }).eq("user_id", uid);
    try {
      const stamp = Date.now();
      const statement = `${E2E_PREFIX} 기존 신념 ${stamp}`;
      const { error: pErr } = await db.from("purposes").insert({ user_id: uid, statement });
      expect(pErr).toBeNull();
      const { data: identity } = await db.from("identities").insert({ user_id: uid, name: `${E2E_PREFIX} 기존 ${stamp}`.slice(0, 40) }).select("id, name").single();
      // The seeded draft still carries a purpose: apply must ignore it because one is active.
      const d = draft(stamp, [{ existingId: identity!.id }], true);
      await db.from("direction_drafts").insert({
        user_id: uid,
        answers: { identity: "", outcome: "글 공개", timePlace: "아침 책상", existingRoutines: "", pastBarriers: "" },
        draft: d,
        provider: "fake",
        model: "fake-1",
        prompt_version: "direction-setup-v1",
      });

      await login(page);
      await page.goto("/scheduler/directive/setup");
      await expect(page.getByRole("heading", { name: "초안 검토" })).toBeVisible();
      await expect(page.getByRole("region", { name: "초안 신념" })).toHaveCount(0);
      await expect(page.getByRole("checkbox", { name: identity!.name })).toBeChecked();
      await page.getByRole("button", { name: "적용" }).click();
      await expect(page).toHaveURL(/\/scheduler\/directive\?mission=/);

      const { data: purposes } = await db.from("purposes").select("statement").eq("status", "active");
      expect(purposes).toEqual([{ statement }]);
      const { data: idAfter } = await db.from("identities").select("name, status").eq("id", identity!.id).single();
      expect(idAfter).toEqual({ name: identity!.name, status: "active" });
      const { data: mission } = await db.from("missions").select("id").eq("title", d.mission.title).single();
      const { data: links } = await db.from("mission_identities").select("identity_id").eq("mission_id", mission!.id);
      expect(links).toEqual([{ identity_id: identity!.id }]);
    } finally {
      if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: true }).eq("user_id", uid);
    }
  });
});
```

- [ ] **Step 2: Run the E2E to see it fail**

Run: `set -a && source .env.local && set +a && E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/direction-setup.spec.ts`
(Start `npm run dev` first if no dev server is running on 3000.)
Expected: FAIL, because the link "AI와 함께 세팅하기" is not found.

- [ ] **Step 3: Write the wizard**

`src/features/ai/components/direction-setup-wizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nativeSelectClass } from "@/components/ui/native-select";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import {
  applyDirectionDraftAction,
  discardDirectionDraftAction,
  generateDirectionDraftAction,
  regenerateDirectionDraftAction,
} from "../actions/direction-setup.actions";
import type { OpenDirectionDraft } from "../queries/direction-draft.queries";
import type { DirectionDraft, SetupAnswers } from "../schemas/direction-setup.schema";
import { removeCriterion, removeHabit, removeIdentity, removeProtocol, toggleIdentityLink } from "../utils/direction-draft";

type Existing = { id: string; name: string };
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const EMPTY: SetupAnswers = { identity: "", outcome: "", timePlace: "", existingRoutines: "", pastBarriers: "" };
const QUESTIONS: { key: keyof SetupAnswers; label: string; required: boolean; placeholder: string }[] = [
  { key: "identity", label: "어떤 사람이 되고 싶나요?", required: false, placeholder: "예: 꾸준히 글 쓰는 개발자" },
  { key: "outcome", label: "6개월 뒤 이루고 싶은 결과 한 가지는?", required: true, placeholder: "예: 기술 블로그 글 12편 공개" },
  { key: "timePlace", label: "하루 중 쓸 수 있는 시간과 장소는?", required: true, placeholder: "예: 평일 아침 8시, 집 책상에서 30분" },
  { key: "existingRoutines", label: "이미 매일 하는 일은?", required: false, placeholder: "예: 출근 후 커피 내리기" },
  { key: "pastBarriers", label: "예전에 포기했던 이유는?", required: false, placeholder: "예: 한 번에 너무 길게 쓰려다 지쳤다" },
];

/** Setup wizard (ADR 0037): interview → AI draft → edit → one-step apply. Nothing is created before [적용]. */
export function DirectionSetupWizard({
  initial,
  existingIdentities,
  hasPurpose,
}: {
  initial: OpenDirectionDraft | null;
  existingIdentities: Existing[];
  hasPurpose: boolean;
}) {
  const [answers, setAnswers] = useState<SetupAnswers>(initial?.answers ?? EMPTY);
  const [open, setOpen] = useState<{ id: string; draft: DirectionDraft } | null>(initial ? { id: initial.id, draft: initial.draft } : null);
  if (!open) {
    return <Interview answers={answers} onChange={setAnswers} existingIdentities={existingIdentities} onDraft={(id, draft) => setOpen({ id, draft })} />;
  }
  return (
    <Review
      key={open.id}
      draftId={open.id}
      initial={open.draft}
      existingIdentities={existingIdentities}
      hasPurpose={hasPurpose}
      onReplaced={(id, draft) => setOpen({ id, draft })}
      onDiscarded={() => setOpen(null)}
    />
  );
}

function Interview({
  answers,
  onChange,
  existingIdentities,
  onDraft,
}: {
  answers: SetupAnswers;
  onChange: (a: SetupAnswers) => void;
  existingIdentities: Existing[];
  onDraft: (id: string, draft: DirectionDraft) => void;
}) {
  const { run, pending } = useActionRunner();
  return (
    <form
      aria-label="세팅 인터뷰"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => generateDirectionDraftAction(answers), { onSuccess: (r) => onDraft(r.draftId, r.draft) });
      }}
    >
      {QUESTIONS.map((q) => {
        const label =
          q.key === "identity" && existingIdentities.length > 0
            ? `추가하고 싶은 모습이 있나요? (지금: ${existingIdentities.map((i) => i.name).join(", ")})`
            : q.label;
        return (
          <div key={q.key} className="space-y-1">
            <Label htmlFor={`setup-${q.key}`}>
              {label}
              {!q.required && <span className="text-muted-foreground"> (선택)</span>}
            </Label>
            <Textarea
              id={`setup-${q.key}`}
              rows={2}
              maxLength={500}
              required={q.required}
              placeholder={q.placeholder}
              value={answers[q.key]}
              onChange={(e) => onChange({ ...answers, [q.key]: e.target.value })}
            />
          </div>
        );
      })}
      <Button type="submit" disabled={pending}>
        <Sparkles aria-hidden />
        {pending ? "초안 만드는 중… (최대 1분)" : "초안 만들기"}
      </Button>
    </form>
  );
}

function Review({
  draftId,
  initial,
  existingIdentities,
  hasPurpose,
  onReplaced,
  onDiscarded,
}: {
  draftId: string;
  initial: DirectionDraft;
  existingIdentities: Existing[];
  hasPurpose: boolean;
  onReplaced: (id: string, draft: DirectionDraft) => void;
  onDiscarded: () => void;
}) {
  const terms = useTerms();
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [d, setD] = useState<DirectionDraft>(initial);
  const edit = (fn: (x: DirectionDraft) => DirectionDraft) => setD((x) => fn(x));
  const linked = (link: { existingId: string } | { newIndex: number }) =>
    d.identityLinks.some((l) => JSON.stringify(l) === JSON.stringify(link));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">초안 검토</h2>
        <p className="text-xs text-muted-foreground">모든 항목을 고칠 수 있습니다. 적용하기 전에는 아무것도 만들어지지 않습니다.</p>
      </div>

      {!hasPurpose && d.purpose && (
        <Card label={`초안 ${terms.directive}`} why={d.purpose.why}>
          <Textarea
            aria-label={`${terms.directive} 문장`}
            rows={2}
            maxLength={280}
            value={d.purpose.statement}
            onChange={(e) => edit((x) => ({ ...x, purpose: { ...x.purpose!, statement: e.target.value } }))}
          />
        </Card>
      )}

      <Card label={`초안 ${terms.identity}`}>
        {d.identities.length === 0 && <p className="text-sm text-muted-foreground">{`새 ${terms.identity} 없음`}</p>}
        {d.identities.map((iden, i) => (
          <Row key={i} why={iden.why} onRemove={() => edit((x) => removeIdentity(x, i))} removeLabel={`${terms.identity} ${i + 1} 삭제`}>
            <Input
              aria-label={`${terms.identity} ${i + 1} 이름`}
              maxLength={40}
              value={iden.name}
              onChange={(e) => edit((x) => ({ ...x, identities: x.identities.map((v, j) => (j === i ? { ...v, name: e.target.value } : v)) }))}
            />
          </Row>
        ))}
      </Card>

      <Card label={`초안 ${terms.mission}`} why={d.mission.why}>
        <Input
          aria-label={`${terms.mission} 이름`}
          maxLength={120}
          value={d.mission.title}
          onChange={(e) => edit((x) => ({ ...x, mission: { ...x.mission, title: e.target.value } }))}
        />
        <Textarea
          aria-label="기대 결과"
          rows={2}
          maxLength={500}
          value={d.mission.outcome ?? ""}
          onChange={(e) => edit((x) => ({ ...x, mission: { ...x.mission, outcome: e.target.value || null } }))}
        />
        <p className="text-xs font-medium text-muted-foreground">성공 기준</p>
        {d.mission.criteria.map((c, i) => (
          <Row
            key={i}
            onRemove={d.mission.criteria.length > 1 ? () => edit((x) => removeCriterion(x, i)) : undefined}
            removeLabel={`기준 ${i + 1} 삭제`}
          >
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label={`기준 ${i + 1}`}
                className="min-w-40 flex-1"
                maxLength={120}
                value={c.label}
                onChange={(e) => edit((x) => setCriterion(x, i, { label: e.target.value }))}
              />
              {c.kind === "numeric" && (
                <>
                  <Input
                    aria-label={`기준 ${i + 1} 목표값`}
                    type="number"
                    min={1}
                    className="w-24"
                    value={c.targetValue ?? ""}
                    onChange={(e) => edit((x) => setCriterion(x, i, { targetValue: e.target.value ? Number(e.target.value) : null }))}
                  />
                  <Input
                    aria-label={`기준 ${i + 1} 단위`}
                    maxLength={12}
                    className="w-20"
                    value={c.unit ?? ""}
                    onChange={(e) => edit((x) => setCriterion(x, i, { unit: e.target.value || null }))}
                  />
                </>
              )}
            </div>
          </Row>
        ))}
        {existingIdentities.length + d.identities.length > 0 && (
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-muted-foreground">{`연결할 ${terms.identity}`}</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {existingIdentities.map((i) => (
                <label key={i.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={linked({ existingId: i.id })} onChange={() => edit((x) => toggleIdentityLink(x, { existingId: i.id }))} />
                  {i.name}
                </label>
              ))}
              {d.identities.map((i, idx) => (
                <label key={`new-${idx}`} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={linked({ newIndex: idx })} onChange={() => edit((x) => toggleIdentityLink(x, { newIndex: idx }))} />
                  {i.name} <span className="text-xs text-muted-foreground">(새)</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </Card>

      <Card label={`초안 ${terms.path}`} why={d.path.why}>
        <Input aria-label={`${terms.path} 이름`} maxLength={80} value={d.path.title} onChange={(e) => edit((x) => ({ ...x, path: { ...x.path, title: e.target.value } }))} />
        <Textarea aria-label="접근 방식" rows={2} maxLength={1000} value={d.path.approach} onChange={(e) => edit((x) => ({ ...x, path: { ...x.path, approach: e.target.value } }))} />
        <Textarea
          aria-label="포기하는 것"
          rows={2}
          maxLength={1000}
          value={d.path.tradeOffs ?? ""}
          onChange={(e) => edit((x) => ({ ...x, path: { ...x.path, tradeOffs: e.target.value || null } }))}
        />
      </Card>

      <Card label={`초안 ${terms.protocol}`}>
        {d.protocols.map((p, i) => (
          <Row
            key={i}
            why={p.why}
            onRemove={d.protocols.length > 1 ? () => edit((x) => removeProtocol(x, i)) : undefined}
            removeLabel={`${terms.protocol} ${i + 1} 삭제`}
          >
            <Input aria-label={`${terms.protocol} ${i + 1}`} maxLength={80} value={p.title} onChange={(e) => edit((x) => setProtocol(x, i, { title: e.target.value }))} />
            <div className="flex flex-wrap items-center gap-2">
              <Textarea
                aria-label={`${terms.protocol} ${i + 1} 단계 (한 줄에 하나)`}
                rows={2}
                className="min-w-48 flex-1"
                value={p.steps.join("\n")}
                onChange={(e) => edit((x) => setProtocol(x, i, { steps: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12) }))}
              />
              <Input
                aria-label={`${terms.protocol} ${i + 1} 의도 시간(분)`}
                type="number"
                min={5}
                max={600}
                className="w-24"
                value={p.intendedMinutes ?? ""}
                onChange={(e) => edit((x) => setProtocol(x, i, { intendedMinutes: e.target.value ? Number(e.target.value) : null }))}
              />
            </div>
          </Row>
        ))}
      </Card>

      <Card label={`초안 ${terms.habits}`}>
        {d.habits.length === 0 && <p className="text-sm text-muted-foreground">{`${terms.habit} 없음`}</p>}
        {d.habits.map((h, i) => (
          <Row key={i} why={h.why} onRemove={() => edit((x) => removeHabit(x, i))} removeLabel={`${terms.habit} ${i + 1} 삭제`}>
            <Input aria-label={`${terms.habit} ${i + 1}`} maxLength={80} value={h.title} onChange={(e) => edit((x) => setHabit(x, i, { title: e.target.value }))} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select
                aria-label={`${terms.habit} ${i + 1} 규칙`}
                className={nativeSelectClass}
                value={h.rule}
                onChange={(e) =>
                  edit((x) =>
                    setHabit(x, i, e.target.value === "focus" ? { rule: "focus", targetMinutes: h.targetMinutes ?? 20, protocolIndex: h.protocolIndex ?? 0 } : { rule: "check", targetMinutes: null }),
                  )
                }
              >
                <option value="check">체크</option>
                <option value="focus">집중 시간</option>
              </select>
              {h.rule === "focus" && (
                <Input
                  aria-label={`${terms.habit} ${i + 1} 목표 시간(분)`}
                  type="number"
                  min={5}
                  max={600}
                  className="w-24"
                  value={h.targetMinutes ?? ""}
                  onChange={(e) => edit((x) => setHabit(x, i, { targetMinutes: e.target.value ? Number(e.target.value) : null }))}
                />
              )}
              <select
                aria-label={`${terms.habit} ${i + 1} ${terms.protocol}`}
                className={nativeSelectClass}
                value={h.protocolIndex ?? ""}
                onChange={(e) =>
                  edit((x) =>
                    setHabit(x, i, e.target.value === "" ? { protocolIndex: null, rule: "check", targetMinutes: null } : { protocolIndex: Number(e.target.value) }),
                  )
                }
              >
                <option value="">연결 안 함</option>
                {d.protocols.map((p, j) => (
                  <option key={j} value={j}>
                    {p.title}
                  </option>
                ))}
              </select>
              {WEEKDAYS.map((label, k) => (
                <label key={label} className="flex items-center gap-0.5">
                  <input
                    type="checkbox"
                    checked={h.weekdays.includes(k + 1)}
                    onChange={(e) =>
                      edit((x) =>
                        setHabit(x, i, {
                          weekdays: (e.target.checked ? [...h.weekdays, k + 1] : h.weekdays.filter((w) => w !== k + 1)).sort((a, b) => a - b),
                        }),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </Row>
        ))}
      </Card>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          disabled={pending}
          onClick={() =>
            run(() => applyDirectionDraftAction({ draftId, payload: d }), {
              success: "초안을 적용했습니다.",
              onSuccess: (r) => router.push(`/scheduler/directive?mission=${r.missionId}#mission-detail`),
            })
          }
        >
          적용
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => regenerateDirectionDraftAction({ draftId }), { onSuccess: (r) => onReplaced(r.draftId, r.draft) })}
        >
          <Sparkles aria-hidden />
          다시 만들기
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => run(() => discardDirectionDraftAction({ draftId }), { onSuccess: onDiscarded })}>
          버리기
        </Button>
      </div>
    </div>
  );
}

function setCriterion(d: DirectionDraft, i: number, patch: Partial<DirectionDraft["mission"]["criteria"][number]>): DirectionDraft {
  return { ...d, mission: { ...d.mission, criteria: d.mission.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) } };
}
function setProtocol(d: DirectionDraft, i: number, patch: Partial<DirectionDraft["protocols"][number]>): DirectionDraft {
  return { ...d, protocols: d.protocols.map((p, j) => (j === i ? { ...p, ...patch } : p)) };
}
function setHabit(d: DirectionDraft, i: number, patch: Partial<DirectionDraft["habits"][number]>): DirectionDraft {
  return { ...d, habits: d.habits.map((h, j) => (j === i ? { ...h, ...patch } : h)) };
}

function Card({ label, why, children }: { label: string; why?: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="space-y-2 rounded-md border border-border p-3">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{label.replace(/^초안 /, "")}</h3>
      {why && <p className="text-xs text-muted-foreground">{why}</p>}
      {children}
    </section>
  );
}

function Row({ why, onRemove, removeLabel, children }: { why?: string; onRemove?: () => void; removeLabel: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 border-t border-border pt-2 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="min-w-0 flex-1 space-y-1.5">
        {children}
        {why && <p className="text-xs text-muted-foreground">{why}</p>}
      </div>
      {onRemove && (
        <Button type="button" variant="ghost" size="icon" aria-label={removeLabel} onClick={onRemove}>
          <Trash2 aria-hidden />
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the setup page**

`src/app/(private)/scheduler/directive/setup/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { termsFor } from "@/lib/terms";
import { getPlayerProfile } from "@/features/gamification/queries/xp.queries";
import { DirectionSetupWizard } from "@/features/ai/components/direction-setup-wizard";
import { getExistingDirection, getOpenDirectionDraft } from "@/features/ai/queries/direction-draft.queries";

export const metadata: Metadata = { title: "AI와 함께 세팅하기", robots: { index: false } };

/** Setup wizard (ADR 0037). An open draft resumes on the review step. */
export default async function DirectionSetupPage() {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const [profile, existing, open] = await Promise.all([
    getPlayerProfile(supabase, user.id),
    getExistingDirection(supabase, user.id),
    getOpenDirectionDraft(supabase, user.id),
  ]);
  const terms = termsFor(!!profile?.gamification_enabled && !!profile.quest_terminology);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <div className="space-y-1">
        <Link href="/scheduler/directive" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" aria-hidden />
          {terms.directiveNav}
        </Link>
        <h1 className="text-2xl font-semibold">AI와 함께 세팅하기</h1>
        <p className="text-sm text-muted-foreground">
          {`질문에 답하면 AI가 ${terms.directive}부터 ${terms.habit}까지 초안을 만듭니다. 기존 항목은 바뀌지 않고, 적용하기 전에는 아무것도 만들어지지 않습니다.`}
        </p>
      </div>
      <DirectionSetupWizard initial={open} existingIdentities={existing.identities} hasPurpose={existing.hasPurpose} />
    </div>
  );
}
```

- [ ] **Step 5: Add the entry points**

In `src/app/(private)/scheduler/directive/page.tsx`:
- Add these imports:

```tsx
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
```

- After `const closed = …`, add:

```tsx
  const empty = !view.purpose && !view.identities.some((i) => i.status === "active") && view.missions.length === 0;
```

- Replace the header block

```tsx
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">{terms.directiveNav}</h1>
          <PageHelp page="directive" />
        </div>
```

  with

```tsx
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">{terms.directiveNav}</h1>
          <PageHelp page="directive" />
        </div>
        {empty && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p>{`질문 5개에 답하면 AI가 ${terms.directive}부터 ${terms.habit}까지 초안을 만들어 드려요.`}</p>
            <Link href="/scheduler/directive/setup" className={buttonVariants({ size: "sm" })}>
              <Sparkles aria-hidden />
              AI와 함께 세팅하기
            </Link>
          </div>
        )}
```

- Replace

```tsx
          <div className="border-b border-border p-4">
            <MissionCreateForm />
          </div>
```

  with

```tsx
          <div className="space-y-3 border-b border-border p-4">
            <MissionCreateForm />
            {!empty && (
              <Link href="/scheduler/directive/setup" className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}>
                <Sparkles aria-hidden />
                {`AI로 ${terms.mission} 추가`}
              </Link>
            )}
          </div>
```

In `src/features/manual/components/planner-manual.tsx`, inside `<Section id="setup" …>`, after
`<p>아래 순서대로 한 번만 해 두면 이후에는 하루 5분이면 충분합니다.</p>`, add:

```tsx
          <Tip>
            막막하다면 <TabLink href="/scheduler/directive/setup">AI와 함께 세팅하기</TabLink>로 시작하세요. 질문 5개에 답하면 아래 1~6단계의 초안이
            한 번에 만들어지고, 고친 뒤 적용할 수 있습니다.
          </Tip>
```

- [ ] **Step 6: Run the E2E to see it pass**

Run: `set -a && source .env.local && set +a && E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/direction-setup.spec.ts tests/e2e/directive.spec.ts tests/e2e/habits.spec.ts tests/e2e/manual.spec.ts`
Expected: all pass. If one fails only on timing, re-run that spec alone on an idle machine (see the E2E memory note)
before debugging.

- [ ] **Step 7: Check in the browser**

- Open `/scheduler/directive/setup` at 1280×900 and at 390×844 (Playwright MCP or next-devtools).
- Check: no horizontal page scroll; cards readable; delete buttons reachable; the interview form submits.
- With `AI_PROVIDER=fake` in `.env.local` (dev only), the interview generates the fake draft. Otherwise skip that
  part: the real provider is checked in Task 5.

- [ ] **Step 8: Type check, lint, commit**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors (the existing 3 warnings may remain).

```bash
git add src/features/ai/components/direction-setup-wizard.tsx "src/app/(private)/scheduler/directive/setup/page.tsx" \
  "src/app/(private)/scheduler/directive/page.tsx" src/features/manual/components/planner-manual.tsx \
  tests/e2e/helpers.ts tests/e2e/direction-setup.spec.ts
git commit -m "AI setup: wizard page, entry points on 정체성 and the manual, E2E"
```

---

### Task 5: Docs, full verification and smoke run

**Files:**
- Create: `docs/decisions/0037-ai-direction-setup.md`
- Modify: `docs/decisions/README.md`, `docs/schema.md`, `docs/architecture.md`, `docs/progress.md`

**Interfaces:**
- Consumes: everything above.
- Produces: docs only.

- [ ] **Step 1: Write the ADR**

`docs/decisions/0037-ai-direction-setup.md`:

```markdown
# 0037 — AI direction setup (setup wizard)

- Status: accepted
- Date: 2026-10-01
- Spec: docs/superpowers/specs/2026-10-01-ai-direction-setup-design.md

## Context
The planner manual's first step (belief → identity → outcome → system → intention → habit) is the hardest part to
start. The AI should draft it from a short interview without breaking the advisory-AI rule.

## Decisions
1. **Drafts, not writes.** AI output is validated, sanitized (`sanitizeDirectionDraft`) and stored in
   `direction_drafts` (`proposed`). The direction tables are written only by `apply_direction_draft`.
2. **One open draft per user** (partial unique index). Generating again discards the previous one. Drafts are history:
   there is no delete policy, and `proposed → applied | discarded` is the only allowed transition (guard trigger).
3. **One-step apply.** `apply_direction_draft(p_draft_id, p_payload)` is security invoker (RLS applies) and creates
   purpose (only if none is active), identities, mission + links + criteria, the active path, protocols and habits in
   one transaction. Any failure creates nothing.
4. **Existing data is never changed.** `reconcileDraft` re-checks the payload at apply time: it drops the purpose if
   one is now active, maps identity names that now exist to their ids, and drops unknown ids.
5. **Budget.** Generation and regeneration are `callAi(…, "direction_setup", …)` calls within the 30/day cap.
6. **E2E seeds drafts** (no LLM cost), as in ADR 0018. The prompt and the fake draft are checked against `DENY_LIST`.

## Consequences
- `applied` vs `draft` shows how much the user edited the AI's draft.
- Later sub-projects (routine coach, fixes when stuck, improving existing items) reuse the drafts pattern.
```

Add this row to `docs/decisions/README.md` after the 0036 row:

```markdown
| 0037 | AI direction setup (setup wizard) | accepted |
```

- [ ] **Step 2: Update schema, architecture and progress**

In `docs/schema.md`, after the `## Habits G2 (ADR 0021)` section, add:

```markdown
## AI direction setup (ADR 0037)
- `direction_drafts(answers jsonb, draft jsonb, applied jsonb, status proposed|applied|discarded, provider, model,
  prompt_version, applied_mission_id → missions on delete set null, applied_at)`. One `proposed` per user (partial
  unique). RLS select/insert/update own; no delete. Guard trigger: content immutable; closed drafts can't change status.
- `apply_direction_draft(p_draft_id, p_payload) → mission id`: security invoker, one transaction. Errors: P0002 draft
  or identity not found, P0001 draft closed, 22023 bad identity index.
```

In `docs/architecture.md`, in the Routes table after the `/scheduler/manual` row:

```markdown
| `/scheduler/directive/setup` | (private) | AI setup wizard: interview → draft review → one-step apply (ADR 0037) |
```

In `docs/progress.md`, after the manual entry:

```markdown
- [x] ADR 0037: AI setup wizard (`/scheduler/directive/setup`): `direction_drafts` + `apply_direction_draft`,
      entry card/button on 정체성 and in the manual. Tests: `tests/unit/direction-draft.test.ts`, RLS
      `direction_drafts.sql`, E2E `direction-setup.spec.ts`
- [ ] AI coach sub-projects: routine coach, fixes when stuck, improving existing items (next)
```

- [ ] **Step 3: Full verification**

Run each and read the output:

```bash
npx tsc --noEmit
npx eslint .
npx vitest run
npm run build
set -a && source .env.local && set +a && E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

Expected:
- no type errors;
- lint: only the 3 existing warnings;
- all unit tests pass;
- the build lists `/scheduler/directive/setup`;
- E2E: all pass. Re-run any timing-only failure alone before treating it as real.

- [ ] **Step 4: Manual smoke run with the real provider**

With the real provider configured (no `AI_PROVIDER=fake`), as the owner in the dev server:
1. Open `/scheduler/directive/setup` and answer the interview with realistic Korean text.
2. Check that the draft appears within the action time limit and its Korean reads naturally. Check the counts
   (identities ≤ 2, protocols ≤ 3, habits ≤ 3) and the two-minute wording.
3. Click [버리기] so no real data is created. Or apply it, if you want to keep it.
4. If generation times out as a Server Action, record it in ADR 0037 and move generation to
   `/api/ai/direction-setup` as the spec allows. That is a follow-up task, not part of this plan.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/0037-ai-direction-setup.md docs/decisions/README.md docs/schema.md docs/architecture.md docs/progress.md
git commit -m "docs: ADR 0037 AI direction setup; schema, architecture, progress"
```
