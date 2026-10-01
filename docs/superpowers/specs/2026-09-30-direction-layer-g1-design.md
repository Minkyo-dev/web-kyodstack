# Direction layer (sub-project G1) — design

- Date: 2026-09-30
- Sources: `docs/improve-requirements-3.md` §2–16, §20–23, §37; umbrella
  `docs/superpowers/specs/2026-09-30-direction-layer-architecture.md` §1–3, §5
- First part of G. G2 (habits), G3 (evidence & status) and G4 (strategy review) build on it.

## Goal
Let the user write down why (directive), who (identities), what (missions with success criteria), how (one active
path per mission, with history) and the concrete ways (protocols), and link quests to them. A quest's detail
answers "why am I doing this?" with a breadcrumb. Unlinked quests are maintenance quests. Nothing here is required,
and the daily screen does not change.

Out of scope for G1: habits, mission progress bars, alignment, identity evidence, diagnosis, AI, quick-add syntax.

## 1. Data model

### Tables (one migration `<ts>_direction_layer.sql`)
All tables: `user_id uuid not null references auth.users on delete cascade`, `created_at`, `updated_at` (existing
`set_updated_at` trigger), `unique (id, user_id)`, RLS enabled with select/insert/update/delete policies on
`user_id = (select auth.uid())`, `anon` revoked. Text limits match the Zod schemas below.

| table | columns | constraints |
|---|---|---|
| `purposes` | `statement text`, `status text` (`active`\|`archived`) | partial unique `(user_id) where status = 'active'` |
| `identities` | `name text`, `description text null`, `status` (`active`\|`archived`), `sort_order int` | — |
| `missions` | `title text`, `outcome text null`, `deadline date null`, `status` (`active`\|`achieved`\|`dropped`), `purpose_id uuid null`, `closed_at timestamptz null` | FK `(purpose_id, user_id) → purposes(id, user_id)`; check `(status = 'active') = (closed_at is null)` |
| `mission_identities` | `mission_id`, `identity_id` | pk `(mission_id, identity_id)`; FKs `(mission_id, user_id)`, `(identity_id, user_id)` on delete cascade |
| `mission_criteria` | `mission_id`, `label text`, `kind` (`check`\|`numeric`), `target_value numeric null`, `current_value numeric null`, `unit text null`, `met_at timestamptz null`, `position smallint` | FK `(mission_id, user_id)` on delete cascade; check `kind = 'check' or target_value > 0` |
| `paths` | `mission_id`, `title text`, `approach text`, `trade_offs text null`, `status` (`active`\|`retired`), `started_at timestamptz`, `retired_at timestamptz null` | FK `(mission_id, user_id)`; `unique (id, mission_id)`; partial unique `(mission_id) where status = 'active'`; check `(status = 'retired') = (retired_at is not null)` |
| `protocols` | `path_id`, `mission_id`, `title text`, `steps text[]` (≤ 12), `intended_minutes smallint null` (5–600), `status` (`active`\|`archived`), `sort_order int` | FK `(path_id, mission_id) → paths(id, mission_id)`; FK `(mission_id, user_id)`; `unique (id, mission_id)` |

- **Retired paths are read-only:** a `before update` trigger on `paths` rejects any change to a retired row
  (`23514`), and on `protocols` rejects inserts/updates whose path is retired, except `status → archived`.
- A mission with paths, projects or tasks cannot be hard-deleted (NO ACTION). The UI only closes missions.

### Links on existing tables
- `tasks.mission_id uuid null`, `tasks.protocol_id uuid null`:
  - FK `(mission_id, user_id) → missions(id, user_id)`.
  - FK `(protocol_id, mission_id) → protocols(id, mission_id)` (MATCH SIMPLE; protocol set ⇒ mission set by check
    `protocol_id is null or mission_id is not null`).
- `projects.mission_id uuid null`: FK `(mission_id, user_id) → missions(id, user_id)`.
- Indexes on every new FK column.
- `task_plan_actual` is recreated with `mission_id`, `protocol_id` and
  `effective_mission_id = coalesce(t.mission_id, p.mission_id)` (left join `projects`). The view keeps
  `security_invoker = true`.

### `switch_path(p_mission_id uuid, p_title text, p_approach text, p_trade_offs text) returns paths`
- `security invoker`, `set search_path = ''`.
- Locks the mission row (`for update`), raises `P0002` if not found or not `active`.
- Archives the active protocols of the current active path (if any), then sets that path to
  `retired, retired_at = now()` (in this order, so the read-only trigger below does not block the archive), inserts
  the new active path, returns it. One transaction, so there is never zero-or-two active paths mid-switch.
- The first path of a mission is created through the same function (no active path to retire).

### Effective mission rule (service, ADR 0020)
- `effective mission = task.mission_id ?? project.mission_id`. Protocol implies its mission (composite FK).
- Creating/updating a task: if both the task's mission (direct or via protocol) and its project's mission are set
  and differ → `VALIDATION_ERROR` "프로젝트가 다른 목표에 연결되어 있습니다."
- Changing a project's mission: rejected if any of its tasks has an explicit `mission_id` that differs from the new
  value (message names the count). Clearing it is always allowed.
- A task may not be newly linked to a mission that is not `active` or a protocol that is not `active`, or whose
  path is retired. Existing links stay when a mission closes or a path retires.

## 2. Feature module `src/features/direction`
```
domain/direction.types.ts        statuses, row types, Breadcrumb type
domain/breadcrumb.ts             pure: buildBreadcrumb(task, project, mission, path, protocol) → crumbs | MAINTENANCE
schemas/direction.schema.ts      Zod for every action below
services/direction.service.ts    CRUD, switchPath (rpc), resolveDirectionLink(ctx, {missionId, protocolId})
queries/direction.queries.ts     loadDirective(ctx), listMissionOptions(ctx), getMissionDetail(ctx, id), loadBreadcrumbs(ctx, taskIds)
actions/direction.actions.ts     server actions (Zod → user → service → ActionResult)
components/                      directive page parts, MissionPicker, Breadcrumb
```
- Dependency direction: `scheduler` and `projects` services call `resolveDirectionLink`; `direction` imports neither.
- `resolveDirectionLink` returns `{ mission_id, protocol_id }`, checking ownership and `active` status of each ID,
  and filling `mission_id` from the protocol. `resolveTaskLink` (projects) is extended to return the project's
  `mission_id` so the task service can apply the mismatch rule.

### Actions
| action | input |
|---|---|
| `setPurposeAction` | `statement` (1–280). Archives the current active purpose, then inserts the new one. Two statements, no RPC: a concurrent call fails on the partial unique index (`CONFLICT`) instead of leaving two active rows. |
| `createIdentityAction` / `updateIdentityAction` | `name` (1–40), `description` (≤ 280), `status`, `sortOrder` |
| `createMissionAction` / `updateMissionAction` | `title` (1–120), `outcome` (≤ 500), `deadline` local date, `identityIds[]` (≤ 6), `status` |
| `upsertCriterionAction` / `deleteCriterionAction` / `setCriterionProgressAction` | `label` (1–120), `kind`, `targetValue`, `unit` (≤ 12); progress: `met` or `currentValue` |
| `switchPathAction` | `missionId`, `title` (1–80), `approach` (1–1000), `tradeOffs` (≤ 1000) |
| `updatePathAction` | edits title/approach/trade-offs of the active path only |
| `createProtocolAction` / `updateProtocolAction` | `pathId`, `title` (1–80), `steps[]` (each 1–120, ≤ 12), `intendedMinutes`, `status`, `sortOrder` |
| task create/update (existing) | gains `missionId?`, `protocolId?` |
| project update (existing) | gains `missionId?` |

All mutations `revalidatePath` the directive page, `/scheduler` and `/scheduler/projects` as touched. No
`evaluateProgress` call (no XP in G1).

## 3. UI

### Terminology
`termsFor()` gains `directive, identity, className, mission, path, protocol, growth, maintenance` per the umbrella
§2 table. Every string below goes through it.

### `/scheduler/directive`
- Added to `private-nav` between the scheduler and projects entries (label = `terms.directive` group name:
  "DIRECTIVE" / "방향").
- **Top block:** `SYSTEM DIRECTIVE` heading, the statement (or the empty state "SYSTEM DIRECTIVE가 설정되지
  않았습니다" + [설정]), edit in a dialog. Below it, identity chips; the first active identity is labeled
  `CLASS`. Identity management dialog: add, rename, archive, reorder with ↑/↓.
- **Left column:** missions grouped as active / achieved / dropped (the last two collapsed). Card: title, deadline
  (with the existing `DueBadge`), identity chips, criteria `met/total` as text. [+ MISSION] opens the create form.
- **Right column (`?mission=`):** mission header with edit and close (achieve / drop, with confirm); success
  criteria list (check toggles, numeric "current / target unit" inline edit); `SELECTED PATH` block (title,
  approach, "포기하는 것" = trade-offs; [편집], [PATH 교체] opening a dialog that states the current path will be
  retired); retired paths collapsed with their dates; protocol list (title, ordered steps, intended minutes,
  archive); linked projects as links to `/scheduler/projects?project=`.
- Layout and density follow the projects page (left list / right detail, stacked on mobile). Section dividers are
  `border-t`. Statuses always have text, not color alone.

### Task drawer and list
- Drawer: a `MISSION / PROTOCOL` picker (one combobox grouped by mission → active protocols; picking a protocol
  sets its mission; "연결 안 함" clears both). The project picker stays; the mismatch error shows inline.
- Drawer top: breadcrumb `Mission › Path › Protocol › task title`. Omitted levels are skipped; a project-derived
  mission shows `Mission › Project › task`. Closed missions get `(ACHIEVED)` / `(DROPPED)`. No effective mission
  → a `MAINTENANCE` label.
- Task list rows: Growth tasks get a small mission chip (first 12 characters, with a title tooltip). Maintenance
  rows get nothing (no noise).

### Projects page
- Project edit form gains the mission picker (active missions). Project header shows `MISSION › project`.

## 4. Errors
- DB errors map to `AppError` as elsewhere: `23505` on purposes/paths partial uniques → `CONFLICT`
  ("다시 시도해 주세요"), `23503` on mission delete → never reached from the UI, `23514` retired-path trigger →
  `VALIDATION_ERROR` ("교체된 PATH는 수정할 수 없습니다"), `P0002` from `switch_path` → `NOT_FOUND`.

## 5. Tests
- **SQL** `supabase/tests/rls/direction_layer.sql` (`begin … rollback`):
  - RLS: user B cannot select/insert/update/delete user A's rows in all seven tables.
  - Cross-user FKs rejected: task → other user's mission; mission_identities across users; project → other user's mission.
  - `protocol_id` with a different `mission_id` on a task is rejected.
  - Second active purpose / second active path rejected.
  - `switch_path`: old path retired with `retired_at`, its protocols archived, exactly one active path; retired path
    update rejected; protocol insert on a retired path rejected.
  - `task_plan_actual.effective_mission_id` comes from the project when the task has none.
- **Unit:** `buildBreadcrumb` (protocol chain, direct mission, project-derived, closed mission, maintenance);
  Zod schemas.
- **Service** (with the existing Supabase test doubles): `resolveDirectionLink` rejects foreign/closed IDs and fills
  the mission from the protocol; mission mismatch on task create/update; project mission change rejected when
  tasks conflict.
- **E2E** `tests/e2e/directive.spec.ts`: set directive → add identity → create mission with one criterion → create path →
  add protocol → create a task linked to the protocol → drawer shows the breadcrumb → switch path → the old path
  appears under history and the task breadcrumb still shows it. All titles `[e2e]`-prefixed; cleanup deletes
  tasks first, then protocols/paths/criteria/missions/identities/purposes with the prefix.
- Existing suites keep passing.

## 6. Docs
- ADR 0020: mission ↔ project, derived Growth/Maintenance, service-level mismatch rule, `mission`/`path` names in
  code, read-only retired paths.
- `docs/schema.md`: a "Direction layer G1 (ADR 0020)" section. `docs/architecture.md`: `features/direction` and
  its dependency direction. `docs/progress.md`: an "Improvement G1" checklist.
