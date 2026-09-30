# Classification + recommendation v2 (sub-project D1) — design

- Date: 2026-09-30
- Sources:
  - `docs/improve-requirements-2.md` §20, §25, §38–§40, §44–§46, §75
  - `docs/improve-requirements.md` §3, §19–§20
  - Umbrella `2026-09-30-growth-system-architecture.md` (D, decision 3; §8 recommendation v2)
- D is split into D1 (this spec: classification + recommendation v2), D2 (stat engine + progress page) and
  D3 (Today view, week summary, capacity notice).

## Goal
Classify tasks by a fixed **task type**, a user-owned hierarchical **practice domain** and free **tags**. Group
duration history by those classes, and recommend a duration with a **range, confidence and reason** instead of a
single number. Capturing a task stays "type → Enter".

## Decisions made with the user
1. Split D into D1 / D2 / D3, and do D1 first.
2. **Tags:** multiple free labels per task, used for organizing and filtering. In analysis they are a **fallback**
   recommendation group only; stats stay keyed by task type.
3. **Existing templates:** each template name becomes a tag on its tasks, so current learning continues through
   the tag fallback. Templates remain as presets (type + domain + tags + default estimate). Types are assigned later.
4. **Input:** inline `#tag` and `@domain` in the quick-add title, with autocomplete. The type is picked in the
   "더보기" row and in the drawer.
5. **Tag storage:** a `tags` table plus a `task_tags` join (not a `text[]` column).

## 1. Data

### Task type
- `tasks.task_type` and `task_templates.task_type`: nullable text, with a check on the fixed list:
  `reading, study, coding, debugging, documentation, writing, meeting, planning, design, research, exercise, other`.
- Korean labels live in `TASK_TYPE_LABEL` (읽기, 공부, 코딩, 디버깅, 문서화, 글쓰기, 회의, 계획, 디자인, 조사, 운동, 기타).

### Practice domains
- `practice_domains(id, user_id, name, parent_id null, created_at)`.
  - `unique (id, user_id)`, `unique (user_id, lower(name))`.
  - `(parent_id, user_id)` → `practice_domains(id, user_id)` on delete set null (parent_id).
  - Check `parent_id <> id`. Cycles are prevented in the service (reject when the new parent is a descendant).
- `tasks.practice_domain_id` and `task_templates.practice_domain_id` reference `(id, user_id)` with
  on delete set null (practice_domain_id).

### Tags
- `tags(id, user_id, name, color null, created_at)`:
  - `unique (id, user_id)`, `unique (user_id, lower(name))`.
  - `name` is 1–40 characters from `[\p{L}\p{N}_-]` (checked in Zod).
  - `color` is one of a small fixed palette key, or null.
- `task_tags(task_id, tag_id, user_id)`: primary key `(task_id, tag_id)`. FKs `(task_id, user_id)` → tasks and
  `(tag_id, user_id)` → tags, both on delete cascade.
- `template_tags(template_id, tag_id, user_id)`: the same pattern for templates.
- All new tables: RLS on own rows for select/insert/update/delete (the join tables have no update), and `anon` revoked.

### Template migration (idempotent, inside the migration)
1. For every `task_templates` row, insert a tag with the same name (`on conflict (user_id, lower(name)) do nothing`).
2. Insert `template_tags` for each template and its tag.
3. Insert `task_tags` for every task with `template_id` set, pointing at its template's tag.

Assigning a type or domain to a template later is a service action with an option to fill tasks of that template
whose value is still null.

### Duration groups (derived, rebuildable)
- `duration_groups(user_id, group_key, samples jsonb, sample_count, updated_at)`, primary key `(user_id, group_key)`.
- `group_key` is one of `type:<type>|domain:<domain_id>`, `type:<type>`, `tag:<tag_id>`.
- `samples` holds the 20 most recent `{ base: number|null, actual: number, completed_at }`:
  - `actual` = focused minutes from `task_plan_actual`.
  - `base` = the user estimate, else the template default. The generic 60 doesn't count.
- A task contributes to every group it belongs to.
- **Refresh:**
  - Complete, reopen, estimate change and classification change refresh the affected groups quietly (best-effort).
  - The nightly `duration_profile_refresh` job rebuilds all of a user's groups.
- **Contract:** after the code reads only `duration_groups`, a follow-up migration drops `task_duration_profiles`.
- **Complexity** is no longer part of grouping (umbrella §8). F revisits it as an AI-proposed feature.

## 2. Recommendation v2 (`ESTIMATOR_VERSION = "v2"`, pure TS)

### Choosing the group
Take the first group with ≥ 3 usable samples, in this order:
1. `type × domain`
2. `type`
3. The task's tag with the most samples
4. None: base estimate only, as today

### Quantity
- **Task has a base estimate:** use samples with `base`. The ratio `actual/base` is clamped to [0.5, 3], and the
  value is `base_task × ratio`.
- **Task has no base:** use sample `actual`.
- Usable samples are those that fit the chosen quantity. Both kinds count toward the 3-sample minimum.

### Output
```ts
type DurationRecommendation = {
  minutes: number;                // what a drop creates
  range: { low: number; high: number } | null;
  confidence: "high" | "medium" | "low" | "none";
  sampleCount: number;
  scope: "type_domain" | "type" | "tag" | "none";
  reason: string | null;          // e.g. "코딩 · Data Eng 비슷한 작업 9개"
};
```
- **Point:** median, rounded up to 5 minutes, then clamped to the block limits (existing `recommendBlockMinutes`).
- **Range:** p25–p75; the low end rounds down to 5, the high end rounds up to 5.
- **Confidence:**
  - high: n ≥ 5 and IQR/median ≤ 0.25
  - medium: n ≥ 3 and ≤ 0.5
  - low: otherwise
  - none: no group
- **Low confidence:** the UI shows only the range. A drop uses the task's base estimate if it has one, else the median.
- **Reason text:**
  - `type_domain`: "<유형> · <영역> 비슷한 작업 N개"
  - `type`: "<유형> 작업 N개"
  - `tag`: "#<태그> 태그 작업 N개"

### Consumers to update
- Task list item hint.
- Drawer `DurationInsight`.
- `scheduleTask` sizing and the `recommended_minutes` snapshot.
- The B drop mirror and toast (`sampleCount`, reason).
- The Today panel drop length (A's partial remainder still wins).

## 3. UI

### Quick add
- `parseQuickAdd(input) → { title, tags: string[], domain: string | null }` (pure):
  - Tokens are `#name` / `@name`, where name is `[\p{L}\p{N}_-]+`.
  - A token must start the string or follow whitespace, so `a@b.com` is not a token.
  - Tokens are removed and whitespace collapsed. Duplicates are removed case-insensitively.
  - The last `@` wins, because a task has one domain.
  - If the title would become empty, the input is rejected with "제목을 입력해 주세요.".
- **Autocomplete:** after `#` or `@`, a listbox of matching tags/domains (prefix, case-insensitive, max 8).
  Arrow keys move the highlight; Enter/Tab insert the item; Escape closes. While the list is open, Enter does not
  submit.
- **Unknown names:**
  - An unknown tag is created.
  - An unknown domain is created at the top level, with the toast "새 영역 <name>을 만들었어요".
- **"더보기" row:** type select, estimate, template. The existing "작업 유형" field is renamed "템플릿". Choosing a
  template pre-fills type, domain, tags and estimate; explicit inline tokens still add to them.

### Display
- **Task list item meta:** type label, domain, and tag chips (max 3, then `+N`), each chip with a text label.
- **Recommendation hint:**
  - high/medium: `→ 추천 1h 20m (1h 10m–1h 35m)`
  - low: `→ 예상 범위 45m–1h 30m`
- **Drawer:**
  - Type select.
  - Domain select, with the tree shown by indentation.
  - Tag chip editor with the same autocomplete and × to remove.
  - `DurationInsight` shows the reason and confidence.

### Filter
- A tag chip row above the Today task list. Multi-select means "any of".
- The selection is kept in `?tags=<id,id>`. The calendar is not filtered.

### Classification management
The ⚙ menu gets "분류 관리", which opens a dialog with three tabs:
- **태그:** rename, color, delete. Deleting removes the links.
- **영역:** add, rename, change the parent (cycles rejected), delete.
- **템플릿:** type, domain, tags and default estimate, plus the checkbox "값이 비어 있는 할 일 N개에도 적용".

A one-time banner appears when a template has no type: "템플릿에 유형을 지정하면 추천이 더 정확해집니다
[분류 관리]". Dismissing it is remembered in `localStorage`, wrapped in try/catch.

## 4. Code changes
- Migration `classification`: type columns, `practice_domains`, `tags`, `task_tags`, `template_tags`,
  `duration_groups`, the backfill. Contract migration `drop_duration_profiles` comes after the switch.
- New feature folder `src/features/classification/`:
  - `domain/` (types, labels)
  - `schemas/`
  - `services/` (tags, domains, templates, classify task)
  - `actions/`
  - `queries/` (list tags/domains, with task counts)
  - `utils/quick-add.ts` (`parseQuickAdd`)
  - `components/` (tag chips, tag editor, domain select, type select, autocomplete input, management dialog,
    filter row)
- Scheduler:
  - `utils/estimator.ts` → v2: `recommendDuration(task, groups, settings)`, pure.
  - `services/duration-profile.service.ts` → `duration-groups.service.ts`: refresh/rebuild groups.
  - `queries/select.ts`: `TASK_SELECT` adds `task_type`, domain `{id,name}` and `tags {id,name,color}`.
  - `createTask` / `updateTask` accept `taskType`, `domainId`, `tagIds` / `tagNames`.
  - The quick-add form uses the parser.
- Jobs: `runDurationProfileRefresh` rebuilds `duration_groups`.
- Dependency direction: `classification` depends on `scheduler` domain types. The scheduler estimator receives
  plain group data, so `scheduler` never imports `classification` services.

## 5. Errors
- Duplicate tag or domain name (case-insensitive) → `CONFLICT` "같은 이름이 이미 있습니다.".
- Domain cycle → `VALIDATION_ERROR` "하위 영역을 상위로 지정할 수 없습니다.".
- Another user's tag, domain or template id → the composite FK rejects it → `NOT_FOUND`.
- A group refresh failure never fails the primary write (logged, like today's profiles).

## 6. Tests
- **SQL** `supabase/tests/rls/classification.sql`:
  - RLS on all new tables.
  - Composite FKs reject cross-user links.
  - Case-insensitive uniqueness.
  - The domain `set null` on delete.
  - The backfill (N templates → N tags, links on tasks and templates; running it twice adds nothing).
- **Unit:**
  - `parseQuickAdd`: Korean tags, email not a token, last `@` wins, duplicates, an empty title.
  - Recommendation v2:
    - `59,62,61,58,60` → 60 high.
    - `30,95,42,120,55` → low with range 40–95.
    - Group order and fallbacks.
    - Ratio vs actual quantity.
    - Rounding and clamping.
- **E2E:**
  - Quick add `… #snowflake @DataEng` → chips shown → tag filter narrows the list.
  - Drawer type change → the reason text changes.
  - `duration-learning.spec.ts` still passes through the tag fallback (template name tag).
  - All existing suites keep passing.

## 7. Docs
`docs/schema.md` (new tables, groups, v2 rules), ADR 0013 (classification axes, tags, template migration,
estimator v2), `docs/progress.md`.

## Out of scope
- Stats and the progress page (D2).
- Today layout and capacity (D3).
- AI classification and embeddings (F).
- Filtering the calendar.
- Tag colors beyond a small fixed palette.
