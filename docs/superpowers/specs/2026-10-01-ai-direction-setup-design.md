# AI direction setup (setup wizard) — design

- Date: 2026-10-01
- Status: draft for review
- Related: planner manual §2 "처음 30분 세팅" (`/scheduler/manual`), ADR 0009 (provider, guardrails), ADR 0018 (budget,
  proposals), ADR 0020/0021 (direction layer, habits), ADR 0036 (Atomic Habits labels)

## 1. Intent

**Goal:** help the user get through the manual's initial setup: belief → identity → outcome goal → system →
implementation intention → habit. The user answers a short interview. The AI drafts the whole chain, the user edits
it, and one click creates it.

**Success:**
- A user with an empty 정체성 tab reaches an active outcome goal, with a system, 1–3 intentions and 1–3 small habits,
  in one sitting.
- A user who already has a setup can add a new outcome goal the same way without anything existing changing.

**Constraints (unchanged project rules):**
- AI is advisory. Its output is Zod-validated and stored as a draft. Real rows are created only when the user applies
  it.
- Deterministic cleanup happens in code, not in the LLM.
- Every call counts toward the 30-calls-per-local-day budget (`callAi`).
- Wording is neutral; `DENY_LIST` applies.

**Out of scope (later sub-projects):** a routine coach (daily/weekly prompts), fixes for "when you're stuck",
improvement suggestions for existing items, and multi-turn chat.

## 2. User flow

### Entry points
- 정체성 tab with no active purpose, identities or missions: an "AI와 함께 세팅하기" card at the top.
- Otherwise: an "AI로 결과 목표 추가" button next to the mission list.
- Manual §2: a link to the wizard.
- Route: `/scheduler/directive/setup`. The 정체성 tab stays active because the path is under `/scheduler/directive`.

### Step 1: interview (one screen)
| # | Question | Required | Notes |
|---|---|---|---|
| 1 | 어떤 사람이 되고 싶나요? | no | If identities exist, they are listed and the question reads "추가하고 싶은 모습이 있나요?" |
| 2 | 6개월 뒤 이루고 싶은 결과 한 가지는? | yes | |
| 3 | 하루 중 쓸 수 있는 시간과 장소는? | yes | Feeds the intentions' "when / where" |
| 4 | 이미 매일 하는 일은? | no | Used for habit stacking |
| 5 | 예전에 포기했던 이유는? | no | Used to make things easier (two-minute rule, smaller scope) |

Each answer is at most 500 characters. [초안 만들기] makes one AI call.

### Step 2: draft review
- **Cards per layer:**
  - belief (only when no active purpose exists);
  - new identities (0–2);
  - outcome goal (title, outcome, 1–3 success criteria) and the identities it links to;
  - system (title, approach, what to give up);
  - implementation intentions (1–3);
  - habits (1–3).
- Every item shows its one-line `why` and is editable with the same fields as the 정체성 forms.
- Identities, criteria (keeping at least 1), intentions (keeping at least 1) and habits can be removed. Removing an
  intention unlinks the habits that pointed to it: a focus-rule habit becomes a check-rule habit, and the screen says
  so.
- **[적용]:** creates everything and redirects to `/scheduler/directive?mission=<id>#mission-detail`.
- **[다시 만들기]:** generates again from the stored answers (one more call). The current draft becomes `discarded`.
- **[버리기]:** marks the draft `discarded` and returns to the interview.
- **Resume:** while a `proposed` draft exists, the page opens on step 2. Edits made on the review screen live in the
  client until [적용]. They are not saved on every keystroke.

### Rules
- Existing rows are never updated or archived. If an active purpose exists, no purpose is proposed or created.
- Nothing is created before [적용].

## 3. Data

### Table `direction_drafts`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid not null | FK auth.users, `default auth.uid()` |
| answers | jsonb not null | interview answers (validated) |
| draft | jsonb not null | the AI output after `sanitizeDirectionDraft` |
| applied | jsonb null | the payload actually applied (after user edits) |
| status | text not null | `proposed` \| `applied` \| `discarded` (check) |
| provider, model, prompt_version | text not null | provenance |
| applied_mission_id | uuid null | FK missions, set on apply |
| created_at | timestamptz default now() | |
| applied_at | timestamptz null | |

- **Partial unique index:** one `proposed` draft per user.
- **RLS:** select / insert / update with `user_id = (select auth.uid())`; no delete policy, since drafts are
  history.
- **Status transitions:** only `proposed → applied` and `proposed → discarded` are allowed, enforced by a trigger.

### Schemas (`features/ai/schemas/direction-setup.schema.ts`)
- `setupAnswersSchema`: `{ identity?, outcome, timePlace, existingRoutines?, pastBarriers? }`, each a trimmed
  string ≤ 500.
- `directionDraftSchema` (AI output and applied payload):
  - `purpose?: { statement ≤ 280, why ≤ 200 }`
  - `identities: { name ≤ 40, description? ≤ 280, why }[]` (0–2)
  - `mission: { title, outcome?, why, criteria: { label, kind check|numeric, targetValue?, unit? }[] (1–3) }`
  - `identityLinks: { existingId?: uuid, newIndex?: int }[]`. Exactly one of the two must be set.
  - `path: { title, approach, tradeOffs, why }`
  - `protocols: { title, steps: string[] ≤ 12, intendedMinutes 5–600 | null, why }[]` (1–3). The title is the
    implementation intention ("X할 때, Y에서, Z").
  - `habits: { title, rule check|focus, targetMinutes 5–600 | null, weekdays int[] ⊆ 1..7 (≥ 1), protocolIndex?, why }[]`
    (1–3). The title is the two-minute version.
- `aiDirectionDraftSchema` is the shape sent to the model as the output format. It is the same as
  `directionDraftSchema` except `identityLinks: string[]` (identity names, since the model never sees ids).
  `sanitizeDirectionDraft` converts it to `directionDraftSchema`: a name matching an existing active identity
  (case-insensitive) becomes `existingId`, a name matching a proposed identity becomes `newIndex`, and other names
  are dropped.
- Field lengths match the existing direction schemas (`direction.schema.ts`). Shared limits are imported, not
  copied.
- `why` is display-only. It is stored in the draft and not written to the direction tables.

## 4. AI generation

- **Prompt** `features/ai/prompts/direction-setup.prompt.ts`, `DIRECTION_SETUP_PROMPT_VERSION = "direction-setup-v1"`.
  - **Input:** the answers, the active purpose statement (if any), and the active identity names. No ids, emails or
    other user data.
  - **Instructions:** start from identity; express the outcome as measurable criteria; the system names what to give
    up; intentions state when, where and what; habits are two-minute versions stacked on the listed existing
    routines; respect the stated barriers; keep counts small; neutral Korean wording; no judgment words.
- **Service** `features/ai/services/direction-setup.service.ts`:
  1. Read the existing purpose and identities (RLS client).
  2. Call `callAi({ kind: "direction_setup" })` with the provider's `generateStructured` and the output schema.
  3. Run `sanitizeDirectionDraft`.
  4. In one statement sequence, discard any open draft and insert the new `proposed` row. A unique-index conflict
     maps to `CONFLICT`.
- **`sanitizeDirectionDraft`** (`features/ai/utils/direction-draft.ts`, pure; input is either the AI shape or an
  applied payload, output is `directionDraftSchema`):
  - Drop `purpose` when one is active.
  - Resolve identity link names (see §3).
  - Drop identities whose name matches an existing one (case-insensitive) and remap links to the existing id.
  - Cap counts.
  - Clamp minutes to 5–600 and fix weekdays (unique, sorted, within 1..7; empty → Mon–Fri).
  - A numeric criterion without a positive target becomes `check`.
  - A `focus` habit without a valid `protocolIndex` or `targetMinutes` becomes `check`.
  - Trim strings to the limits.
- **Errors:**
  - budget → `AI_BUDGET_EXCEEDED` ("오늘 AI 사용량을 다 썼습니다. 내일 다시 시도해 주세요.");
  - invalid output → `AI_OUTPUT_INVALID` (retry offered);
  - provider → `AI_PROVIDER_ERROR`.
  - Nothing is stored on failure.
- **Fake provider:** returns a fixed, valid draft for `direction_setup`.

## 5. Apply

- **Service `applyDirectionDraft(draftId, payload)`:**
  - Validate `payload` with `directionDraftSchema`.
  - Re-run `sanitizeDirectionDraft` against the current existing rows (state may have changed since generation).
  - Check that every `existingId` is the user's active identity.
  - Call the RPC.
- **RPC `apply_direction_draft(p_draft_id uuid, p_payload jsonb) returns uuid`**, `security invoker`,
  `set search_path = ''`. In one transaction:
  1. `select … for update` the draft and require `user_id = auth.uid()` and `status = 'proposed'`; otherwise raise
     `P0001` (mapped to `CONFLICT`).
  2. Insert the purpose if one is provided and none is active.
  3. Insert identities, appended after the current max `sort_order`.
  4. Insert the mission (`purpose_id` = the active purpose), then `mission_identities` for the resolved ids.
     Existing ids are re-checked against `identities.user_id`.
  5. Insert `mission_criteria` with positions.
  6. Insert the active path, then protocols with `(path_id, mission_id)`.
  7. Insert habits with `(protocol_id, mission_id)` when linked, otherwise null mission (maintenance), following ADR
     0021.
  8. Update the draft: `status = 'applied'`, `applied = p_payload`, `applied_mission_id`, `applied_at`.
  9. Return the mission id.
- Any error rolls back everything. RLS applies to every insert because the function is security invoker.
- The action calls `revalidatePath("/scheduler", "layout")`.

## 6. Code layout

```
src/features/ai/
  prompts/direction-setup.prompt.ts
  schemas/direction-setup.schema.ts
  utils/direction-draft.ts                    sanitizeDirectionDraft (pure)
  services/direction-setup.service.ts         generate / regenerate / discard / apply
  queries/direction-draft.queries.ts          open draft for the page
  actions/direction-setup.actions.ts          Zod → user → service → ActionResult
  components/direction-setup-wizard.tsx       "use client": interview + review
  providers/fake.ts                           + direction_setup output
src/app/(private)/scheduler/directive/setup/page.tsx   loads the open draft + existing purpose/identities
src/app/(private)/scheduler/directive/page.tsx         entry card / button
src/features/manual/components/planner-manual.tsx      link in §2
supabase/migrations/<ts>_direction_drafts.sql          table, RLS, trigger, apply_direction_draft
supabase/tests/rls/direction_drafts.sql
```

- **Generation transport:** a Server Action, like classification. If generation exceeds the action time limit in the
  manual smoke run, move it to a Route Handler (`/api/ai/direction-setup`) like the weekly review.
- **Dependency direction:** `features/ai` may call `features/direction` queries and read its schema limits.
  `direction` does not import `ai`.

## 7. Testing

- **Unit:**
  - `sanitizeDirectionDraft`: every rule in §4;
  - `directionDraftSchema`: limits and the exactly-one link rule;
  - the prompt's fixed text and the fake draft contain no `DENY_LIST` word;
  - name → id mapping for identity links.
- **SQL (RLS):**
  - another user cannot select or update a draft or apply it;
  - applying an `applied` or `discarded` draft raises;
  - another user's identity id in the payload raises and nothing is inserted;
  - a payload that fails a table constraint partway (e.g. a habit with weekday 9) leaves no rows;
  - a second `proposed` draft violates the unique index.
- **E2E**, following the ADR 0018 pattern: seed a `proposed` draft row directly, with no LLM cost.
  - Empty user: the 정체성 card → setup page opens on review → remove one habit → apply → mission detail shows the
    criteria, path, intentions and the remaining habit; the scheduler habit panel shows it on its weekdays.
  - User with an existing purpose and identity: no purpose card in review; after apply the old purpose and identities
    are unchanged.
  - `[e2e]` title prefix on everything created, for cleanup.
- **Manual smoke run** with the real provider: one generation, checking latency and the quality of the Korean
  wording.

## 8. Docs

- **ADR 0037:** AI direction setup (drafts table, one-step apply RPC, `direction_setup` budget kind, existing data
  never changed).
- `docs/schema.md` (`direction_drafts`, RPC), `docs/architecture.md` (route, files), `docs/progress.md`.
