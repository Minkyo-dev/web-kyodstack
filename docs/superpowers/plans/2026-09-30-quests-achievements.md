# Quests, achievements, titles, terminology (E2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily/weekly/recovery quests built from the user's own data, an achievement and title catalog, and a quest-terminology label layer, all on top of E1's ledger and notifier.

**Architecture:** Pure rules generate quest drafts and evaluate objectives from facts; `create_quest` / `swap_quest_objective` DB functions keep writes atomic. `ensureQuests` runs on scheduler page load and nightly; `evaluateProgress` (E1) also evaluates quests and achievements and extends the `ProgressDelta`. The page passes a `QuestPanel` slot into the scheduler workspace, so scheduler code never imports gamification. Terms live in `src/lib/terms.ts` + a client provider.

**Tech Stack:** Next.js 16 server actions/RSC, Supabase Postgres (RLS, plpgsql), React 19 context, sonner, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-quests-achievements-design.md` (E1 spec, umbrella §10)

## Global Constraints
- Daily +50 XP ("모멘텀 쌓기"), weekly +300 ("모멘텀 유지"), recovery +40 ("다시 시작"); no penalty on expiry.
- One objective swap per daily quest; never to a duplicate metric; never a completed objective.
- Achievements give no XP and are never re-locked; titles unlock with their achievement; one equipped title.
- Quest XP 1–300, other rules 1–120.
- Quest terminology only counts while gamification is on. Covered: every visible label in the private area. Not covered: public pages, AI prompts, server `AppError` messages, `metadata` titles, code/DB names, quest objects.
- Every query filters `user_id` explicitly; the nightly job uses the service role with `p_user_id`.
- Scheduler/projects/analytics code must not import `features/gamification`; the app layer composes.
- Status never by color alone; calm UI; radius ≤ 8px.
- E2E data uses `[e2e]`; quests/achievements created by E2E are restored/removed in `finally`/cleanup.
- Stage explicit paths only.

## Review Focus
1. Quest generation racing (two tabs load at once) → exactly one daily/weekly quest. Test: Task 1 SQL (create_quest twice returns null the second time).
2. A quest with no objectives must never clear. Test: Task 2 `evaluateQuest` with `[]` objectives → not cleared.
3. Objective progress going down (a session deleted) after completion keeps `completed_at`. Test: Task 2 `evaluateQuest` keeps completed.
4. Terms with Korean particles for both modes (할 일을 / 퀘스트를, 프로젝트로 / 메인 퀘스트로). Test: Task 3 `josa`.
5. Gamification off → no quest generation, no panel, no toasts. Test: Task 4 `ensureQuests` guarded by the profile check (covered by E2E turning it off in `finally` and the panel absent before enabling).

---

### Task 1: Database — quests, objectives, achievements, titles, per-rule XP limit

**Files:**
- Create: `supabase/migrations/<ts>_gamification_quests.sql`, `supabase/tests/rls/quests.sql`
- Modify: `src/types/database.ts` (regenerated)

**Interfaces:**
- Produces: tables `quests`, `quest_objectives`, `user_achievements`, `user_titles`; `player_profiles.equipped_title`;
  `create_quest(p_quest jsonb, p_objectives jsonb, p_user_id uuid default null) → uuid | null` (null when the period already has that quest type);
  `swap_quest_objective(p_objective_id uuid, p_objective jsonb, p_spare jsonb) → void`;
  `xp_events.rule` includes `quest` (xp ≤ 300).

- [ ] **Step 1: SQL test** `supabase/tests/rls/quests.sql`

```sql
-- Gamification E2: quests RLS, atomic create/swap, one active recovery, per-rule XP limit, equipped title check.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

-- service role creates a quest for B
select public.create_quest(
  '{"type":"daily","title":"모멘텀 쌓기","period_start":"2026-09-30","period_end":"2026-09-30","reward_xp":50,"rules_version":"quest-v1","spare":[]}',
  '[{"position":1,"metric":"focus_minutes","params":{},"target_value":60}]',
  '00000000-0000-4000-a000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare q uuid; q2 uuid; o uuid; begin
  q := public.create_quest(
    '{"type":"daily","title":"모멘텀 쌓기","period_start":"2026-09-30","period_end":"2026-09-30","reward_xp":50,"rules_version":"quest-v1","spare":[{"metric":"early_session","params":{"before":"12:00"},"target_value":1}]}',
    '[{"position":1,"metric":"focus_minutes","params":{},"target_value":60},{"position":2,"metric":"complete_tasks","params":{},"target_value":1}]');
  assert q is not null, 'created';
  q2 := public.create_quest(
    '{"type":"daily","title":"x","period_start":"2026-09-30","period_end":"2026-09-30","reward_xp":50,"rules_version":"quest-v1","spare":[]}',
    '[{"position":1,"metric":"focus_minutes","params":{},"target_value":30}]');
  assert q2 is null, 'second daily for the same day is a no-op';
  assert (select count(*) from public.quests) = 1, 'A sees only own quest';
  assert (select count(*) from public.quest_objectives where quest_id = q) = 2, 'objectives created with the quest';

  select id into o from public.quest_objectives where quest_id = q and position = 2;
  perform public.swap_quest_objective(o, '{"metric":"early_session","params":{"before":"12:00"},"target_value":1}', '[]');
  assert (select metric from public.quest_objectives where id = o) = 'early_session', 'swapped';
  assert (select swap_used from public.quests where id = q), 'swap used';
  begin
    perform public.swap_quest_objective(o, '{"metric":"kept_commitments","params":{},"target_value":1}', '[]');
    raise exception 'FAIL: second swap';
  exception when check_violation then null; end;

  -- one active recovery quest
  perform public.create_quest('{"type":"recovery","title":"다시 시작","period_start":"2026-09-28","period_end":"2026-09-29","reward_xp":40,"rules_version":"quest-v1","spare":[]}',
    '[{"position":1,"metric":"started_session","params":{},"target_value":1}]');
  begin
    perform public.create_quest('{"type":"recovery","title":"다시 시작","period_start":"2026-09-30","period_end":"2026-10-01","reward_xp":40,"rules_version":"quest-v1","spare":[]}',
      '[{"position":1,"metric":"started_session","params":{},"target_value":1}]');
    raise exception 'FAIL: two active recovery quests';
  exception when unique_violation then null; end;

  -- quest XP up to 300, others up to 120
  perform public.award_xp(format('[{"rule":"quest","source_type":"quest","source_id":"%s","local_date":"2026-09-30","xp":300}]', q)::jsonb);
  begin
    perform public.award_xp('[{"rule":"focus","source_type":"work_session","source_id":"00000000-0000-4000-c000-000000000001","local_date":"2026-09-30","xp":121}]');
    raise exception 'FAIL: focus over 120';
  exception when check_violation then null; end;

  -- achievements/titles: insert own, no update; equip only unlocked
  insert into public.player_profiles (user_id, gamification_enabled) values ('00000000-0000-4000-a000-00000000000a', true);
  begin
    update public.player_profiles set equipped_title = 'builder';
    raise exception 'FAIL: equipped a locked title';
  exception when check_violation then null; end;
  insert into public.user_achievements (user_id, key) values ('00000000-0000-4000-a000-00000000000a', 'first_step');
  insert into public.user_titles (user_id, key) values ('00000000-0000-4000-a000-00000000000a', 'builder');
  update public.player_profiles set equipped_title = 'builder';
  update public.player_profiles set equipped_title = null;
  begin
    update public.user_titles set key = 'system_thinker';
    raise exception 'FAIL: user updated a title';
  exception when insufficient_privilege then null; end;
  -- own delete (E2E cleanup) cascades objectives
  delete from public.quests where id = q;
  assert (select count(*) from public.quest_objectives where quest_id = q) = 0, 'objectives cascade';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.quests where user_id = '00000000-0000-4000-a000-00000000000b') = 1, 'B untouched';
end $$;
rollback;
```

- [ ] **Step 2: Run before the migration** (MCP `execute_sql`). Expected: FAIL — `function public.create_quest(...) does not exist`.

- [ ] **Step 3: Migration** `supabase/migrations/<ts>_gamification_quests.sql`

```sql
-- Gamification E2: quests, objectives, achievements, titles.
-- Spec: docs/superpowers/specs/2026-09-30-quests-achievements-design.md

alter table public.xp_events drop constraint xp_events_rule_check;
alter table public.xp_events add constraint xp_events_rule_check
  check (rule in ('focus', 'completion', 'commitment', 'quest'));
alter table public.xp_events drop constraint xp_events_xp_check;
alter table public.xp_events add constraint xp_events_xp_check
  check (xp >= 1 and xp <= case when rule = 'quest' then 300 else 120 end);

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('daily', 'weekly', 'recovery')),
  status text not null default 'active' check (status in ('active', 'cleared', 'expired')),
  title text not null check (char_length(title) between 1 and 60),
  period_start date not null,
  period_end date not null,
  reward_xp integer not null check (reward_xp between 1 and 300),
  swap_used boolean not null default false,
  spare jsonb not null default '[]',
  generated_by text not null default 'system' check (generated_by = 'system'),
  rules_version text not null,
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  check (period_end >= period_start),
  unique (user_id, type, period_start),
  unique (id, user_id)
);
create unique index quests_one_active_recovery on public.quests (user_id) where type = 'recovery' and status = 'active';
create index quests_user_status_idx on public.quests (user_id, status);

create table public.quest_objectives (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  metric text not null check (metric in (
    'focus_minutes', 'complete_planned_tasks', 'complete_tasks', 'domain_minutes', 'domain_sessions',
    'kept_commitments', 'kept_commitment_rate', 'days_within_capacity', 'early_session', 'booked_block',
    'started_session')),
  params jsonb not null default '{}',
  target_value numeric not null check (target_value > 0),
  current_value numeric not null default 0,
  completed_at timestamptz,
  foreign key (quest_id, user_id) references public.quests(id, user_id) on delete cascade,
  unique (quest_id, position)
);
create index quest_objectives_user_idx on public.quest_objectives (user_id);

create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);
create table public.user_titles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.quests enable row level security;
alter table public.quest_objectives enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_titles enable row level security;

create policy quests_select_own on public.quests for select to authenticated using (user_id = (select auth.uid()));
create policy quests_insert_own on public.quests for insert to authenticated with check (user_id = (select auth.uid()));
create policy quests_update_own on public.quests for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy quest_objectives_select_own on public.quest_objectives for select to authenticated using (user_id = (select auth.uid()));
create policy quest_objectives_insert_own on public.quest_objectives for insert to authenticated with check (user_id = (select auth.uid()));
create policy quest_objectives_update_own on public.quest_objectives for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_achievements_select_own on public.user_achievements for select to authenticated using (user_id = (select auth.uid()));
create policy user_achievements_insert_own on public.user_achievements for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_titles_select_own on public.user_titles for select to authenticated using (user_id = (select auth.uid()));
create policy user_titles_insert_own on public.user_titles for insert to authenticated with check (user_id = (select auth.uid()));

-- Own delete exists only so E2E cleanup can remove what a test created (same stance as xp_events, ADR 0016).
create policy quests_delete_own on public.quests for delete to authenticated using (user_id = (select auth.uid()));
create policy user_achievements_delete_own on public.user_achievements for delete to authenticated using (user_id = (select auth.uid()));
create policy user_titles_delete_own on public.user_titles for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.quests, public.quest_objectives, public.user_achievements, public.user_titles from anon;
revoke delete on public.quest_objectives from authenticated;
revoke update on public.user_achievements, public.user_titles from authenticated;

alter table public.player_profiles add column equipped_title text;
grant update (equipped_title) on public.player_profiles to authenticated;

create or replace function public.check_equipped_title()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.equipped_title is not null and not exists (
    select 1 from public.user_titles t where t.user_id = new.user_id and t.key = new.equipped_title
  ) then
    raise exception 'title not unlocked' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger player_profiles_check_title before insert or update of equipped_title on public.player_profiles
  for each row execute function public.check_equipped_title();

-- Quest + objectives in one transaction; null when that type already exists for the period.
create or replace function public.create_quest(p_quest jsonb, p_objectives jsonb, p_user_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user_id);
  v_id uuid;
begin
  if v_user is null then
    raise exception 'user required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_objectives) <> 'array' or jsonb_array_length(p_objectives) = 0 then
    raise exception 'objectives required' using errcode = '22023';
  end if;
  insert into public.quests (user_id, type, title, period_start, period_end, reward_xp, spare, rules_version)
  values (v_user, p_quest->>'type', p_quest->>'title', (p_quest->>'period_start')::date, (p_quest->>'period_end')::date,
          (p_quest->>'reward_xp')::integer, coalesce(p_quest->'spare', '[]'::jsonb), p_quest->>'rules_version')
  on conflict (user_id, type, period_start) do nothing
  returning id into v_id;
  if v_id is null then
    return null;
  end if;
  insert into public.quest_objectives (quest_id, user_id, position, metric, params, target_value)
  select v_id, v_user, (o->>'position')::smallint, o->>'metric', coalesce(o->'params', '{}'::jsonb), (o->>'target_value')::numeric
  from jsonb_array_elements(p_objectives) as o;
  return v_id;
end $$;
revoke execute on function public.create_quest(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.create_quest(jsonb, jsonb, uuid) to authenticated, service_role;

-- One swap per daily quest; the objective must be incomplete and the quest active.
create or replace function public.swap_quest_objective(p_objective_id uuid, p_objective jsonb, p_spare jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quest uuid;
begin
  select o.quest_id into v_quest
  from public.quest_objectives o
  join public.quests q on q.id = o.quest_id and q.user_id = o.user_id
  where o.id = p_objective_id and o.completed_at is null
    and q.type = 'daily' and q.status = 'active' and not q.swap_used
  for update of q;
  if v_quest is null then
    raise exception 'swap not allowed' using errcode = '23514';
  end if;
  update public.quests set swap_used = true, spare = coalesce(p_spare, '[]'::jsonb) where id = v_quest;
  update public.quest_objectives
  set metric = p_objective->>'metric', params = coalesce(p_objective->'params', '{}'::jsonb),
      target_value = (p_objective->>'target_value')::numeric, current_value = 0, completed_at = null
  where id = p_objective_id;
end $$;
revoke execute on function public.swap_quest_objective(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.swap_quest_objective(uuid, jsonb, jsonb) to authenticated;
```

- [ ] **Step 4: Apply** (`apply_migration` name `gamification_quests`), `list_migrations`, rename the local file to the remote version, `generate_typescript_types` → `src/types/database.ts`.

- [ ] **Step 5: Run the SQL test** — Expected: completes (rollback).

- [ ] **Step 6: Advisors (security)** — Expected: only the known generic warnings.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/<version>_gamification_quests.sql supabase/tests/rls/quests.sql src/types/database.ts
git commit -m "E2-1: quests, objectives, achievements, titles; create/swap functions; quest XP limit"
```

---

### Task 2: Pure quest rules

**Files:**
- Create: `src/features/gamification/domain/quest.types.ts`, `src/features/gamification/utils/quest-rules.ts`
- Test: `tests/unit/quest-rules.test.ts`

**Interfaces:**
- Produces:
  - `QUEST_METRICS`, `QuestMetric`, `QuestType`, `ObjectiveDraft { metric; params; target }`, `QuestDraft`, `QuestFacts`,
    `QUEST_RULES_VERSION`, `QUEST_META: Record<QuestType, { title; reward }>`
  - `dailyQuest(ctx: DailyContext) → QuestDraft`, `weeklyQuest(ctx: WeeklyContext) → QuestDraft`,
    `recoveryQuest(today, tomorrow) → QuestDraft`, `recoveryDue(input) → boolean`,
    `nextSwap(current: { metric; completed }[], spare: ObjectiveDraft[]) → { replacement; spare } | null`,
    `objectiveValue(obj, quest, facts) → number`,
    `evaluateQuest(quest, objectives, facts) → { updates: { id; current; completedAt }[]; cleared: boolean }`

- [ ] **Step 1: Failing tests** `tests/unit/quest-rules.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  dailyQuest, evaluateQuest, nextSwap, objectiveValue, recoveryDue, recoveryQuest, weeklyQuest,
} from "@/features/gamification/utils/quest-rules";
import type { QuestFacts } from "@/features/gamification/domain/quest.types";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const TZ = "America/Toronto";

describe("dailyQuest", () => {
  it("builds focus, planned tasks and domain objectives with the rest as spare", () => {
    const q = dailyQuest({ date: "2026-09-30", capacity: 180, plannedMinutes: 240, plannedTaskIds: [id(1), id(2), id(3)], topDomainId: id(9) });
    expect(q).toMatchObject({ type: "daily", title: "모멘텀 쌓기", periodStart: "2026-09-30", periodEnd: "2026-09-30", rewardXp: 50 });
    expect(q.objectives).toEqual([
      { metric: "focus_minutes", params: {}, target: 110 },
      { metric: "complete_planned_tasks", params: { taskIds: [id(1), id(2), id(3)] }, target: 2 },
      { metric: "domain_minutes", params: { domainId: id(9) }, target: 30 },
    ]);
    expect(q.spare.map((s) => s.metric)).toEqual(["early_session", "kept_commitments"]);
  });

  it("falls back without capacity, plans or domains", () => {
    const q = dailyQuest({ date: "2026-09-30", capacity: null, plannedMinutes: 0, plannedTaskIds: [], topDomainId: null });
    expect(q.objectives).toEqual([
      { metric: "focus_minutes", params: {}, target: 60 },
      { metric: "complete_tasks", params: {}, target: 1 },
      { metric: "kept_commitments", params: {}, target: 1 },
    ]);
    expect(q.spare.map((s) => s.metric)).toEqual(["early_session"]);
  });

  it("never asks for less than 30 focus minutes", () => {
    expect(dailyQuest({ date: "2026-09-30", capacity: 40, plannedMinutes: 20, plannedTaskIds: [id(1)], topDomainId: null }).objectives[0].target).toBe(30);
  });
});

describe("weeklyQuest", () => {
  it("scales focus by capacity and work days", () => {
    const q = weeklyQuest({ weekStart: "2026-09-28", weekEnd: "2026-10-04", capacity: 200, plannedWorkDayCount: 5, topDomainId: id(9) });
    expect(q).toMatchObject({ type: "weekly", title: "모멘텀 유지", periodStart: "2026-09-28", periodEnd: "2026-10-04", rewardXp: 300 });
    expect(q.objectives).toEqual([
      { metric: "focus_minutes", params: {}, target: 600 },
      { metric: "kept_commitment_rate", params: { min: 4 }, target: 75 },
      { metric: "domain_sessions", params: { domainId: id(9) }, target: 3 },
      { metric: "days_within_capacity", params: {}, target: 4 },
    ]);
    expect(q.spare).toEqual([]);
  });

  it("drops the capacity objective when capacity is unknown", () => {
    const q = weeklyQuest({ weekStart: "2026-09-28", weekEnd: "2026-10-04", capacity: null, plannedWorkDayCount: 5, topDomainId: null });
    expect(q.objectives.map((o) => [o.metric, o.target])).toEqual([
      ["focus_minutes", 300],
      ["kept_commitment_rate", 75],
      ["complete_tasks", 5],
    ]);
  });
});

describe("recovery", () => {
  it("is due after two quiet work days with earlier activity and no recent recovery", () => {
    const base = { today: "2026-09-30", minMeaningful: 30, lastTwoWorkDays: [{ date: "2026-09-29", focused: 0 }, { date: "2026-09-28", focused: 10 }], hadEarlierActivity: true, lastRecoveryStart: null };
    expect(recoveryDue(base)).toBe(true);
    expect(recoveryDue({ ...base, lastTwoWorkDays: [{ date: "2026-09-29", focused: 45 }, { date: "2026-09-28", focused: 0 }] })).toBe(false);
    expect(recoveryDue({ ...base, hadEarlierActivity: false })).toBe(false);
    expect(recoveryDue({ ...base, lastRecoveryStart: "2026-09-25" })).toBe(false);
    expect(recoveryDue({ ...base, lastRecoveryStart: "2026-09-23" })).toBe(true);
    expect(recoveryDue({ ...base, lastTwoWorkDays: [{ date: "2026-09-29", focused: 0 }] })).toBe(false);
  });
  it("books a block and starts a session; ends tomorrow", () => {
    const q = recoveryQuest("2026-09-30", "2026-10-01");
    expect(q).toMatchObject({ type: "recovery", title: "다시 시작", periodStart: "2026-09-30", periodEnd: "2026-10-01", rewardXp: 40 });
    expect(q.objectives).toEqual([
      { metric: "booked_block", params: { minMinutes: 30 }, target: 1 },
      { metric: "started_session", params: {}, target: 1 },
    ]);
  });
});

describe("nextSwap", () => {
  const spare = [
    { metric: "early_session" as const, params: { before: "12:00" }, target: 1 },
    { metric: "kept_commitments" as const, params: {}, target: 1 },
  ];
  it("takes the first spare whose metric is not already used", () => {
    const r = nextSwap([{ metric: "focus_minutes", completed: false }, { metric: "early_session", completed: false }], spare);
    expect(r).toEqual({ replacement: spare[1], spare: [spare[0]] });
  });
  it("returns null when nothing fits", () => {
    expect(nextSwap([{ metric: "early_session", completed: false }, { metric: "kept_commitments", completed: false }], spare)).toBeNull();
    expect(nextSwap([], [])).toBeNull();
  });
});

const facts = (over: Partial<QuestFacts> = {}): QuestFacts => ({
  timezone: TZ,
  now: "2026-09-30T20:00:00Z",
  plannedWorkDays: [1, 2, 3, 4, 5],
  capacity: 120,
  sessions: [],
  tasks: {},
  domainParent: {},
  commitments: [],
  blocks: [],
  ...over,
});
const daily = { periodStart: "2026-09-30", periodEnd: "2026-09-30", createdAt: "2026-09-30T12:00:00Z" };

describe("objectiveValue", () => {
  const s = (n: number, start: string, end: string, task = id(50), source = "timer") => ({ id: id(n), task_id: task, source, started_at: start, ended_at: end, pauses: [] });

  it("focus minutes in the local day, manual included", () => {
    const f = facts({ sessions: [s(1, "2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z"), s(2, "2026-09-30T15:00:00Z", "2026-09-30T15:30:00Z", id(50), "manual"), s(3, "2026-09-29T13:00:00Z", "2026-09-29T14:00:00Z")] });
    expect(objectiveValue({ metric: "focus_minutes", params: {} }, daily, f)).toBe(90);
  });

  it("planned tasks completed, and any tasks completed in the period", () => {
    const f = facts({ tasks: {
      [id(1)]: { status: "completed", completedAt: "2026-09-30T15:00:00Z", domainId: null },
      [id(2)]: { status: "planned", completedAt: null, domainId: null },
      [id(3)]: { status: "completed", completedAt: "2026-09-30T16:00:00Z", domainId: null },
      [id(4)]: { status: "completed", completedAt: "2026-09-29T16:00:00Z", domainId: null },
    } });
    expect(objectiveValue({ metric: "complete_planned_tasks", params: { taskIds: [id(1), id(2)] } }, daily, f)).toBe(1);
    expect(objectiveValue({ metric: "complete_tasks", params: {} }, daily, f)).toBe(2);
  });

  it("domain minutes and sessions include child domains", () => {
    const f = facts({
      domainParent: { [id(9)]: null, [id(8)]: id(9) },
      tasks: { [id(60)]: { status: "planned", completedAt: null, domainId: id(8) }, [id(61)]: { status: "planned", completedAt: null, domainId: null } },
      sessions: [s(1, "2026-09-30T13:00:00Z", "2026-09-30T13:40:00Z", id(60)), s(2, "2026-09-30T14:00:00Z", "2026-09-30T14:05:00Z", id(60)), s(3, "2026-09-30T15:00:00Z", "2026-09-30T16:00:00Z", id(61))],
    });
    expect(objectiveValue({ metric: "domain_minutes", params: { domainId: id(9) } }, daily, f)).toBe(45);
    expect(objectiveValue({ metric: "domain_sessions", params: { domainId: id(9) } }, daily, f)).toBe(1);
  });

  it("kept commitments and the kept rate with a minimum", () => {
    const c = (n: number, kept: boolean, at = "2026-09-30T14:00:00Z") => ({ blockId: id(n), resolvedAt: at, score: kept ? 1 : 0, kept });
    const f3 = facts({ commitments: [c(1, true), c(2, true), c(3, false)] });
    expect(objectiveValue({ metric: "kept_commitments", params: {} }, daily, f3)).toBe(2);
    expect(objectiveValue({ metric: "kept_commitment_rate", params: { min: 4 } }, daily, f3)).toBe(0);
    const f4 = facts({ commitments: [c(1, true), c(2, true), c(3, true), c(4, false)] });
    expect(objectiveValue({ metric: "kept_commitment_rate", params: { min: 4 } }, daily, f4)).toBe(75);
  });

  it("days within capacity counts elapsed planned work days without overload", () => {
    const week = { periodStart: "2026-09-28", periodEnd: "2026-10-04", createdAt: "2026-09-28T12:00:00Z" };
    const b = (day: string, h: number) => ({ id: `${day}-${h}`, created_at: "2026-09-27T00:00:00Z", starts_at: `${day}T13:00:00Z`, ends_at: `${day}T${13 + h}:00:00Z`, status: "planned" });
    // capacity 120: Mon 2h ok, Tue 5h overload, Wed = today (not elapsed)
    const f = facts({ blocks: [b("2026-09-28", 2), b("2026-09-29", 5), b("2026-09-30", 1)] });
    expect(objectiveValue({ metric: "days_within_capacity", params: {} }, week, f)).toBe(1);
    expect(objectiveValue({ metric: "days_within_capacity", params: {} }, week, facts({ capacity: null }))).toBe(0);
  });

  it("early session, booked block and started session", () => {
    // 12:00 Toronto = 16:00Z on 2026-09-30
    const early = facts({ sessions: [s(1, "2026-09-30T15:30:00Z", "2026-09-30T16:30:00Z")] });
    expect(objectiveValue({ metric: "early_session", params: { before: "12:00" } }, daily, early)).toBe(1);
    const late = facts({ sessions: [s(1, "2026-09-30T16:30:00Z", "2026-09-30T17:30:00Z")] });
    expect(objectiveValue({ metric: "early_session", params: { before: "12:00" } }, daily, late)).toBe(0);

    const blocks = [
      { id: "a", created_at: "2026-09-30T11:00:00Z", starts_at: "2026-09-30T18:00:00Z", ends_at: "2026-09-30T19:00:00Z", status: "planned" },
      { id: "b", created_at: "2026-09-30T13:00:00Z", starts_at: "2026-10-01T13:00:00Z", ends_at: "2026-10-01T13:20:00Z", status: "planned" },
    ];
    expect(objectiveValue({ metric: "booked_block", params: { minMinutes: 30 } }, daily, facts({ blocks }))).toBe(0);
    blocks.push({ id: "c", created_at: "2026-09-30T13:00:00Z", starts_at: "2026-10-02T13:00:00Z", ends_at: "2026-10-02T13:30:00Z", status: "planned" });
    expect(objectiveValue({ metric: "booked_block", params: { minMinutes: 30 } }, daily, facts({ blocks }))).toBe(1);

    expect(objectiveValue({ metric: "started_session", params: {} }, daily, facts({ sessions: [s(1, "2026-09-30T11:00:00Z", "2026-09-30T11:30:00Z")] }))).toBe(0);
    expect(objectiveValue({ metric: "started_session", params: {} }, daily, facts({ sessions: [s(1, "2026-09-30T12:30:00Z", "2026-09-30T12:40:00Z")] }))).toBe(1);
  });
});

describe("evaluateQuest", () => {
  const f = facts({ sessions: [{ id: id(1), task_id: id(50), source: "timer", started_at: "2026-09-30T13:00:00Z", ended_at: "2026-09-30T14:00:00Z", pauses: [] }] });
  const obj = (n: number, metric: "focus_minutes" | "started_session", target: number, completedAt: string | null = null) => ({ id: id(n), metric, params: {}, target, completedAt });

  it("updates values, marks completion once and clears when all are complete", () => {
    const r = evaluateQuest(daily, [obj(1, "focus_minutes", 60), obj(2, "started_session", 1)], f);
    expect(r.updates).toEqual([
      { id: id(1), current: 60, completedAt: f.now },
      { id: id(2), current: 1, completedAt: f.now },
    ]);
    expect(r.cleared).toBe(true);
  });

  it("keeps a completion when the value later drops", () => {
    const r = evaluateQuest(daily, [obj(1, "focus_minutes", 90, "2026-09-30T15:00:00Z")], f);
    expect(r.updates[0]).toEqual({ id: id(1), current: 60, completedAt: "2026-09-30T15:00:00Z" });
    expect(r.cleared).toBe(true);
  });

  it("never clears a quest without objectives", () => {
    expect(evaluateQuest(daily, [], f).cleared).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/quest-rules.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/features/gamification/domain/quest.types.ts`
```ts
import type { PauseLike } from "@/features/analytics/domain/stats.types";

export const QUEST_METRICS = [
  "focus_minutes", "complete_planned_tasks", "complete_tasks", "domain_minutes", "domain_sessions",
  "kept_commitments", "kept_commitment_rate", "days_within_capacity", "early_session", "booked_block", "started_session",
] as const;
export type QuestMetric = (typeof QUEST_METRICS)[number];
export type QuestType = "daily" | "weekly" | "recovery";
export const QUEST_META: Record<QuestType, { title: string; reward: number; label: string }> = {
  daily: { title: "모멘텀 쌓기", reward: 50, label: "DAILY QUEST" },
  weekly: { title: "모멘텀 유지", reward: 300, label: "WEEKLY QUEST" },
  recovery: { title: "다시 시작", reward: 40, label: "RECOVERY QUEST" },
};

export type ObjectiveParams = { taskIds?: string[]; domainId?: string; min?: number; before?: string; minMinutes?: number };
export type ObjectiveDraft = { metric: QuestMetric; params: ObjectiveParams; target: number };
export type QuestDraft = {
  type: QuestType;
  title: string;
  periodStart: string;
  periodEnd: string;
  rewardXp: number;
  objectives: ObjectiveDraft[];
  spare: ObjectiveDraft[];
};
export type DailyContext = { date: string; capacity: number | null; plannedMinutes: number; plannedTaskIds: string[]; topDomainId: string | null };
export type WeeklyContext = { weekStart: string; weekEnd: string; capacity: number | null; plannedWorkDayCount: number; topDomainId: string | null };

export type QuestFacts = {
  timezone: string;
  now: string;
  plannedWorkDays: number[];
  capacity: number | null;
  sessions: { id: string; task_id: string; source: string; started_at: string; ended_at: string | null; pauses: PauseLike[] }[];
  tasks: Record<string, { status: string; completedAt: string | null; domainId: string | null }>;
  domainParent: Record<string, string | null>;
  commitments: { blockId: string; resolvedAt: string; score: number; kept: boolean }[];
  blocks: { id: string; created_at: string; starts_at: string; ends_at: string; status: string }[];
};
export type QuestWindow = { periodStart: string; periodEnd: string; createdAt: string };
```

`src/features/gamification/utils/quest-rules.ts`
```ts
/** Quest rules v1 (E2 spec §2). Pure: generation from context, objective values from facts. */
import { focusStats, focusedMinutesInWindow } from "@/features/scheduler/utils/focus";
import { addLocalDays, localDateTimeToIso, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { dayPlannedMinutes, overloadFor } from "@/features/scheduler/utils/today";
import {
  QUEST_META, type DailyContext, type ObjectiveDraft, type ObjectiveParams, type QuestDraft, type QuestFacts,
  type QuestMetric, type QuestWindow, type WeeklyContext,
} from "../domain/quest.types";

export const QUEST_RULES_VERSION = "quest-v1";
const t = (iso: string) => new Date(iso).getTime();
const round5 = (x: number) => Math.round(x / 5) * 5;
const round30 = (x: number) => Math.round(x / 30) * 30;

function splitUnique(pool: ObjectiveDraft[], take: number) {
  const seen = new Set<QuestMetric>();
  const unique = pool.filter((o) => (seen.has(o.metric) ? false : (seen.add(o.metric), true)));
  return { objectives: unique.slice(0, take), spare: unique.slice(take) };
}

export function dailyQuest(ctx: DailyContext): QuestDraft {
  const focus =
    ctx.capacity === null || ctx.plannedMinutes <= 0
      ? 60
      : Math.max(30, round5(Math.min(0.6 * ctx.capacity, ctx.plannedMinutes)));
  const pool: ObjectiveDraft[] = [
    { metric: "focus_minutes", params: {}, target: focus },
    ctx.plannedTaskIds.length
      ? { metric: "complete_planned_tasks", params: { taskIds: ctx.plannedTaskIds }, target: Math.min(2, ctx.plannedTaskIds.length) }
      : { metric: "complete_tasks", params: {}, target: 1 },
    ctx.topDomainId
      ? { metric: "domain_minutes", params: { domainId: ctx.topDomainId }, target: 30 }
      : { metric: "kept_commitments", params: {}, target: 1 },
    { metric: "early_session", params: { before: "12:00" }, target: 1 },
    { metric: "kept_commitments", params: {}, target: 1 },
  ];
  const { objectives, spare } = splitUnique(pool, 3);
  const meta = QUEST_META.daily;
  return { type: "daily", title: meta.title, periodStart: ctx.date, periodEnd: ctx.date, rewardXp: meta.reward, objectives, spare };
}

export function weeklyQuest(ctx: WeeklyContext): QuestDraft {
  const objectives: ObjectiveDraft[] = [
    { metric: "focus_minutes", params: {}, target: ctx.capacity === null ? 300 : Math.max(30, round30(0.6 * ctx.capacity * ctx.plannedWorkDayCount)) },
    { metric: "kept_commitment_rate", params: { min: 4 }, target: 75 },
    ctx.topDomainId
      ? { metric: "domain_sessions", params: { domainId: ctx.topDomainId }, target: 3 }
      : { metric: "complete_tasks", params: {}, target: 5 },
  ];
  if (ctx.capacity !== null) objectives.push({ metric: "days_within_capacity", params: {}, target: Math.max(1, ctx.plannedWorkDayCount - 1) });
  const meta = QUEST_META.weekly;
  return { type: "weekly", title: meta.title, periodStart: ctx.weekStart, periodEnd: ctx.weekEnd, rewardXp: meta.reward, objectives, spare: [] };
}

export function recoveryQuest(today: string, tomorrow: string): QuestDraft {
  const meta = QUEST_META.recovery;
  return {
    type: "recovery",
    title: meta.title,
    periodStart: today,
    periodEnd: tomorrow,
    rewardXp: meta.reward,
    objectives: [
      { metric: "booked_block", params: { minMinutes: 30 }, target: 1 },
      { metric: "started_session", params: {}, target: 1 },
    ],
    spare: [],
  };
}

/** Two most recent planned work days before today were quiet, there was activity before, no recovery in 7 days. */
export function recoveryDue(input: {
  today: string;
  minMeaningful: number;
  lastTwoWorkDays: { date: string; focused: number }[];
  hadEarlierActivity: boolean;
  lastRecoveryStart: string | null;
}): boolean {
  if (input.lastTwoWorkDays.length < 2 || !input.hadEarlierActivity) return false;
  if (input.lastTwoWorkDays.some((d) => d.focused >= input.minMeaningful)) return false;
  if (input.lastRecoveryStart) {
    const days = (t(`${input.today}T12:00:00Z`) - t(`${input.lastRecoveryStart}T12:00:00Z`)) / 86_400_000;
    if (days < 7) return false;
  }
  return true;
}

export function nextSwap(current: { metric: QuestMetric; completed: boolean }[], spare: ObjectiveDraft[]) {
  const used = new Set(current.map((c) => c.metric));
  const i = spare.findIndex((s) => !used.has(s.metric));
  if (i < 0) return null;
  return { replacement: spare[i], spare: spare.filter((_, j) => j !== i) };
}

function inDomain(taskId: string, domainId: string, facts: QuestFacts): boolean {
  let d = facts.tasks[taskId]?.domainId ?? null;
  for (let hops = 0; d && hops < 10; hops++) {
    if (d === domainId) return true;
    d = facts.domainParent[d] ?? null;
  }
  return false;
}

export function objectiveValue(obj: { metric: QuestMetric; params: ObjectiveParams }, q: QuestWindow, facts: QuestFacts): number {
  const tz = facts.timezone;
  const from = t(localDayRange(q.periodStart, tz).start);
  const to = t(localDayRange(q.periodEnd, tz).end);
  const now = t(facts.now);
  const within = (iso: string | null) => !!iso && t(iso) >= from && t(iso) < to;
  const focusIn = (s: QuestFacts["sessions"][number]) => focusedMinutesInWindow(s, s.pauses, from, to, now);
  const p = obj.params;

  switch (obj.metric) {
    case "focus_minutes":
      return Math.round(facts.sessions.reduce((sum, s) => sum + focusIn(s), 0));
    case "complete_planned_tasks":
      return (p.taskIds ?? []).filter((id) => facts.tasks[id]?.status === "completed").length;
    case "complete_tasks":
      return Object.values(facts.tasks).filter((x) => x.status === "completed" && within(x.completedAt)).length;
    case "domain_minutes":
      return Math.round(facts.sessions.filter((s) => p.domainId && inDomain(s.task_id, p.domainId, facts)).reduce((sum, s) => sum + focusIn(s), 0));
    case "domain_sessions":
      return facts.sessions.filter(
        (s) => p.domainId && inDomain(s.task_id, p.domainId, facts) && within(s.ended_at) && focusStats(s, s.pauses).focusedMs >= 10 * 60_000,
      ).length;
    case "kept_commitments":
      return facts.commitments.filter((c) => c.kept && within(c.resolvedAt)).length;
    case "kept_commitment_rate": {
      const all = facts.commitments.filter((c) => within(c.resolvedAt));
      if (all.length < (p.min ?? 1)) return 0;
      return Math.round((all.filter((c) => c.kept).length / all.length) * 100);
    }
    case "days_within_capacity": {
      if (facts.capacity === null) return 0;
      const today = toLocalDate(facts.now, tz);
      let count = 0;
      for (let d = q.periodStart; d <= q.periodEnd && d < today; d = addLocalDays(d, 1, tz)) {
        if (!facts.plannedWorkDays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) continue;
        if (!overloadFor(dayPlannedMinutes(facts.blocks, localDayRange(d, tz)), facts.capacity)) count++;
      }
      return count;
    }
    case "early_session": {
      const cutoff = t(localDateTimeToIso(q.periodStart, p.before ?? "12:00", tz));
      return facts.sessions.some((s) => s.source === "timer" && t(s.started_at) >= from && t(s.started_at) < cutoff) ? 1 : 0;
    }
    case "booked_block":
      return facts.blocks.some(
        (b) =>
          t(b.created_at) >= t(q.createdAt) &&
          t(b.starts_at) > t(b.created_at) &&
          (t(b.ends_at) - t(b.starts_at)) / 60_000 >= (p.minMinutes ?? 30) &&
          b.status !== "cancelled",
      )
        ? 1
        : 0;
    case "started_session":
      return facts.sessions.some((s) => s.source === "timer" && t(s.started_at) >= t(q.createdAt)) ? 1 : 0;
  }
}

export function evaluateQuest(
  q: QuestWindow,
  objectives: { id: string; metric: QuestMetric; params: ObjectiveParams; target: number; completedAt: string | null }[],
  facts: QuestFacts,
) {
  const updates = objectives.map((o) => {
    const current = objectiveValue(o, q, facts);
    return { id: o.id, current, completedAt: o.completedAt ?? (current >= o.target ? facts.now : null) };
  });
  return { updates, cleared: updates.length > 0 && updates.every((u) => u.completedAt !== null) };
}
```

- [ ] **Step 4: Run** `npx vitest run` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/gamification/domain/quest.types.ts src/features/gamification/utils/quest-rules.ts tests/unit/quest-rules.test.ts
git commit -m "E2-2: pure quest rules (daily/weekly/recovery, swap, objective values)"
```

---

### Task 3: Pure achievements and terms

**Files:**
- Create: `src/features/gamification/utils/achievements.ts`, `src/lib/terms.ts`
- Test: `tests/unit/achievements.test.ts`, `tests/unit/terms.test.ts`

**Interfaces:**
- Produces:
  - `ACHIEVEMENTS: Achievement[]` (`key, name, description, titleKey | null, progress(f, unlocked) → { current; target }`),
    `TITLES: Record<string, string>` (key → display name), `AchievementFacts`, `newlyUnlocked(facts, unlocked: Set<string>) → string[]`, `ACHIEVEMENTS_VERSION`
  - `Terms`, `PLAIN_TERMS`, `QUEST_TERMS`, `termsFor(questTerminology: boolean) → Terms`, `josa(word, pair) → string`

- [ ] **Step 1: Failing tests**

`tests/unit/achievements.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, newlyUnlocked, TITLES } from "@/features/gamification/utils/achievements";

const empty = { sessionFocus: [], calibrationErrors: [], perfectCommitments: 0, weeklyCleared: 0, recoveryCleared: 0 };

describe("achievements", () => {
  it("unlocks at the boundaries", () => {
    expect(newlyUnlocked({ ...empty, sessionFocus: [9.9] }, new Set())).toEqual([]);
    expect(newlyUnlocked({ ...empty, sessionFocus: [10] }, new Set())).toEqual(["first_step"]);
    expect(newlyUnlocked({ ...empty, sessionFocus: Array(10).fill(60) }, new Set()).sort()).toEqual(["deep_session", "first_step"]);
    expect(newlyUnlocked({ ...empty, calibrationErrors: [...Array(9).fill(0.1), 0.11] }, new Set())).toEqual([]);
    expect(newlyUnlocked({ ...empty, calibrationErrors: Array(10).fill(0.1) }, new Set())).toEqual(["reliable_planner"]);
    expect(newlyUnlocked({ ...empty, perfectCommitments: 10 }, new Set())).toEqual(["early_starter"]);
    expect(newlyUnlocked({ ...empty, weeklyCleared: 4 }, new Set())).toEqual(["consistent_builder"]);
    expect(newlyUnlocked({ ...empty, recoveryCleared: 1 }, new Set())).toEqual(["comeback"]);
  });

  it("system thinker follows five others, including ones unlocked in the same pass", () => {
    const all = { sessionFocus: Array(10).fill(60), calibrationErrors: Array(10).fill(0), perfectCommitments: 10, weeklyCleared: 4, recoveryCleared: 0 };
    expect(newlyUnlocked(all, new Set()).sort()).toEqual(["consistent_builder", "deep_session", "early_starter", "first_step", "reliable_planner", "system_thinker"]);
  });

  it("never returns already unlocked keys (no re-lock, no repeat)", () => {
    expect(newlyUnlocked(empty, new Set(["first_step"]))).toEqual([]);
    expect(newlyUnlocked({ ...empty, sessionFocus: [30] }, new Set(["first_step"]))).toEqual([]);
  });

  it("every title key has a name and progress is reported", () => {
    for (const a of ACHIEVEMENTS) if (a.titleKey) expect(TITLES[a.titleKey]).toBeTruthy();
    const deep = ACHIEVEMENTS.find((a) => a.key === "deep_session")!;
    expect(deep.progress({ ...empty, sessionFocus: [60, 61, 30] }, new Set())).toEqual({ current: 2, target: 10 });
  });
});
```

`tests/unit/terms.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { josa, PLAIN_TERMS, QUEST_TERMS, termsFor } from "@/lib/terms";

describe("josa", () => {
  it("follows the final consonant", () => {
    expect(josa("할 일", "을/를")).toBe("할 일을");
    expect(josa("퀘스트", "을/를")).toBe("퀘스트를");
    expect(josa("프로젝트", "이/가")).toBe("프로젝트가");
    expect(josa("할 일", "이/가")).toBe("할 일이");
    expect(josa("메인 퀘스트", "은/는")).toBe("메인 퀘스트는");
    expect(josa("프로젝트", "과/와")).toBe("프로젝트와");
    expect(josa("할 일", "으로/로")).toBe("할 일로"); // ㄹ takes 로
    expect(josa("메인 퀘스트", "으로/로")).toBe("메인 퀘스트로");
    expect(josa("책", "으로/로")).toBe("책으로");
    expect(josa("XP", "을/를")).toBe("XP를");
  });
});

describe("terms", () => {
  it("switches the nouns", () => {
    expect(termsFor(false)).toBe(PLAIN_TERMS);
    expect(termsFor(true)).toBe(QUEST_TERMS);
    expect(PLAIN_TERMS).toEqual({ task: "할 일", project: "프로젝트" });
    expect(QUEST_TERMS).toEqual({ task: "퀘스트", project: "메인 퀘스트" });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/achievements.test.ts tests/unit/terms.test.ts` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/features/gamification/utils/achievements.ts`
```ts
/** Achievement catalog v1 (E2 spec §3). Recognition only: no XP; never re-locked. Names are original. */
export const ACHIEVEMENTS_VERSION = "ach-v1";

export type AchievementFacts = {
  sessionFocus: number[]; // focused minutes of each ended timer session
  calibrationErrors: number[]; // |actual/estimate − 1| of completed tasks with an estimate
  perfectCommitments: number; // final commitments with score 1
  weeklyCleared: number;
  recoveryCleared: number;
};
export type Achievement = {
  key: string;
  name: string;
  description: string;
  titleKey: string | null;
  progress: (f: AchievementFacts, unlocked: Set<string>) => { current: number; target: number };
};

export const TITLES: Record<string, string> = {
  builder: "BUILDER",
  deep_worker: "DEEP WORKER",
  reliable_planner: "RELIABLE PLANNER",
  early_starter: "EARLY STARTER",
  consistent_operator: "CONSISTENT OPERATOR",
  system_thinker: "SYSTEM THINKER",
};

const count = (xs: number[], ok: (x: number) => boolean) => xs.filter(ok).length;

export const ACHIEVEMENTS: Achievement[] = [
  { key: "first_step", name: "FIRST STEP", description: "처음으로 10분 이상 집중한 타이머 세션", titleKey: "builder",
    progress: (f) => ({ current: Math.min(1, count(f.sessionFocus, (m) => m >= 10)), target: 1 }) },
  { key: "deep_session", name: "DEEP SESSION", description: "60분 이상 집중한 세션 10번", titleKey: "deep_worker",
    progress: (f) => ({ current: count(f.sessionFocus, (m) => m >= 60), target: 10 }) },
  { key: "reliable_planner", name: "RELIABLE PLANNER", description: "예상 시간 ±10% 안에 끝낸 완료 10번", titleKey: "reliable_planner",
    progress: (f) => ({ current: count(f.calibrationErrors, (e) => e <= 0.1), target: 10 }) },
  { key: "early_starter", name: "EARLY STARTER", description: "약속 블록을 제시간에 시작한 10번", titleKey: "early_starter",
    progress: (f) => ({ current: f.perfectCommitments, target: 10 }) },
  { key: "consistent_builder", name: "CONSISTENT BUILDER", description: "주간 퀘스트 4번 달성", titleKey: "consistent_operator",
    progress: (f) => ({ current: f.weeklyCleared, target: 4 }) },
  { key: "comeback", name: "COMEBACK", description: "회복 퀘스트로 다시 시작", titleKey: null,
    progress: (f) => ({ current: Math.min(1, f.recoveryCleared), target: 1 }) },
  { key: "system_thinker", name: "SYSTEM THINKER", description: "다른 업적 5개 달성", titleKey: "system_thinker",
    progress: (_f, unlocked) => ({ current: [...unlocked].filter((k) => k !== "system_thinker").length, target: 5 }) },
];

export function newlyUnlocked(facts: AchievementFacts, unlocked: Set<string>): string[] {
  const all = new Set(unlocked);
  const out: string[] = [];
  // Two passes so system_thinker sees achievements unlocked in this evaluation.
  for (let pass = 0; pass < 2; pass++) {
    for (const a of ACHIEVEMENTS) {
      if (all.has(a.key)) continue;
      const p = a.progress(facts, all);
      if (p.current >= p.target) {
        all.add(a.key);
        out.push(a.key);
      }
    }
  }
  return out;
}
```

`src/lib/terms.ts`
```ts
/** Quest terminology (E2 spec §4): a label layer only. Code and DB always say task/project. */
export type Terms = { task: string; project: string };
export const PLAIN_TERMS: Terms = { task: "할 일", project: "프로젝트" };
export const QUEST_TERMS: Terms = { task: "퀘스트", project: "메인 퀘스트" };

export function termsFor(questTerminology: boolean): Terms {
  return questTerminology ? QUEST_TERMS : PLAIN_TERMS;
}

type Pair = "을/를" | "이/가" | "은/는" | "과/와" | "으로/로";

/** Final consonant index of the last Hangul syllable (0 = none); non-Hangul counts as none. */
function finalConsonant(word: string): number {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return 0;
  return (c - 0xac00) % 28;
}

export function josa(word: string, pair: Pair): string {
  const [withFinal, withoutFinal] = pair.split("/");
  const jong = finalConsonant(word);
  if (pair === "으로/로") return word + (jong !== 0 && jong !== 8 ? withFinal : withoutFinal); // ㄹ(8) takes 로
  return word + (jong !== 0 ? withFinal : withoutFinal);
}
```

- [ ] **Step 4: Run** `npx vitest run` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/gamification/utils/achievements.ts src/lib/terms.ts tests/unit/achievements.test.ts tests/unit/terms.test.ts
git commit -m "E2-3: achievement catalog and terminology helpers"
```

---

### Task 4: Loaders, services, actions, nightly

**Files:**
- Create: `src/features/gamification/queries/quest.queries.ts`, `src/features/gamification/services/quest.service.ts`,
  `src/features/gamification/services/achievement.service.ts`, `src/features/gamification/actions/quest.actions.ts`
- Modify: `src/lib/progress.ts`, `src/features/gamification/domain/xp.types.ts` (rule `quest`, sourceType `quest`, label),
  `src/features/gamification/utils/xp-rules.ts` (`DAY_CAP.quest = null`), `src/features/gamification/utils/delta.ts`,
  `src/features/gamification/services/progress.service.ts`, `src/features/gamification/schemas/gamification.schema.ts`,
  `src/features/gamification/queries/xp.queries.ts` (`PlayerProfile.equipped_title`), `src/features/gamification/components/enable-card.tsx`
- Test: `tests/unit/progress-delta.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 functions; Task 2/3 pure rules; E1 `loadXpRaw`, `award`, `commitments`, `loadDailyCapacity`.
- Produces:
  - `ProgressDelta` gains `questsCleared?: { type: string; title: string; xp: number }[]`, `achievements?: { key: string; name: string }[]`
  - `deltaFrom(events, awards: AwardResult[], extra?: { questsCleared?; achievements? }) → ProgressDelta | null`
  - `ensureQuests(ctx, now, admin=false) → Promise<void>`, `evaluateQuests(ctx, now, admin) → Promise<{ cleared: { id; type; title; xp }[] }>`,
    `swapObjective(ctx, objectiveId) → Promise<void>`, `listQuestViews(supabase, userId, today) → Promise<QuestView[]>`
  - `evaluateAchievements(ctx) → Promise<string[]>` (new keys), `loadAchievementFacts(supabase, userId) → AchievementFacts`, `equipTitle(ctx, key | null)`
  - actions `swapQuestObjectiveAction({ objectiveId })`, `equipTitleAction({ titleKey })`
  - `QuestView = { id; type; title; status; rewardXp; swapUsed; canSwap: boolean; objectives: { id; metric; params; current; target; done; domainName: string | null }[] }`

- [ ] **Step 1: Extend the failing delta test** (append to `tests/unit/progress-delta.test.ts`):
```ts
describe("deltaFrom with quests and achievements", () => {
  it("combines awards: first previous level, last level", () => {
    const d = deltaFrom([ev("focus", 5), { ...ev("completion", 20), rule: "quest" as never }], [
      { total_xp: 140, level: 1, previous_level: 1 },
      { total_xp: 190, level: 2, previous_level: 1 },
    ], { questsCleared: [{ type: "daily", title: "모멘텀 쌓기", xp: 50 }] });
    expect(d?.levelUp).toEqual({ from: 1, to: 2 });
    expect(d?.questsCleared).toEqual([{ type: "daily", title: "모멘텀 쌓기", xp: 50 }]);
  });
  it("reports achievements even without XP", () => {
    expect(deltaFrom([], [], { achievements: [{ key: "first_step", name: "FIRST STEP" }] })).toEqual({
      xp: [], levelUp: null, questsCleared: [], achievements: [{ key: "first_step", name: "FIRST STEP" }],
    });
  });
});
```
and change the two existing calls to pass arrays: `deltaFrom([], [{ … }])`, `deltaFrom([ev("focus", 5)], [])`, `deltaFrom([...], [{ total_xp: 160, level: 2, previous_level: 1 }])`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/progress-delta.test.ts` — Expected: FAIL (signature).

- [ ] **Step 3: Implement**

`src/lib/progress.ts`
```ts
export type ProgressDelta = {
  xp: { rule: string; xp: number }[];
  levelUp: { from: number; to: number } | null;
  questsCleared?: { type: string; title: string; xp: number }[];
  achievements?: { key: string; name: string }[];
};
```

`xp.types.ts`: `XP_RULES = ["focus", "completion", "commitment", "quest"]`, `XP_RULE_LABEL.quest = "퀘스트"`, `NewXpEvent.sourceType` adds `"quest"`.
`xp-rules.ts`: `DAY_CAP` adds `quest: null`; `used` initializer adds `quest: 0`.

`utils/delta.ts`
```ts
export function deltaFrom(
  events: NewXpEvent[],
  awards: AwardResult[],
  extra: { questsCleared?: NonNullable<ProgressDelta["questsCleared"]>; achievements?: NonNullable<ProgressDelta["achievements"]> } = {},
): ProgressDelta | null {
  const questsCleared = extra.questsCleared ?? [];
  const achievements = extra.achievements ?? [];
  if (events.length === 0 && questsCleared.length === 0 && achievements.length === 0) return null;
  const sums = new Map<string, number>();
  for (const e of events) sums.set(e.rule, (sums.get(e.rule) ?? 0) + e.xp);
  const first = awards[0];
  const last = awards[awards.length - 1];
  const levelUp = first && last && last.level > first.previous_level ? { from: first.previous_level, to: last.level } : null;
  const base: ProgressDelta = { xp: [...sums].map(([rule, xp]) => ({ rule, xp })), levelUp };
  return extra.questsCleared || extra.achievements ? { ...base, questsCleared, achievements } : base;
}
```

`queries/quest.queries.ts` — context for generation, facts for evaluation, views:
```ts
import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { commitments } from "@/features/analytics/utils/stats";
import { loadDailyCapacity } from "@/features/analytics/queries/capacity.queries";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { focusedMinutesInWindow } from "@/features/scheduler/utils/focus";
import { addLocalDays, localDayRange, localWeek, toLocalDate } from "@/features/scheduler/utils/timezone";
import { dayPlannedMinutes } from "@/features/scheduler/utils/today";
import type { DailyContext, QuestFacts, QuestMetric, QuestType, ObjectiveParams, WeeklyContext } from "../domain/quest.types";
import { loadXpRaw } from "./xp.queries";

const PAUSES = "pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at)";
const isWorkDay = (d: string, days: number[]) => days.includes(new Date(`${d}T12:00:00Z`).getUTCDay());

function rootOf(domainId: string | null, parent: Record<string, string | null>): string | null {
  let d = domainId;
  for (let i = 0; d && parent[d] && i < 10; i++) d = parent[d];
  return d;
}

export type QuestGenContext = {
  today: string;
  tomorrow: string;
  week: { start: string; end: string };
  daily: DailyContext;
  weekly: WeeklyContext;
  recovery: { minMeaningful: number; lastTwoWorkDays: { date: string; focused: number }[]; hadEarlierActivity: boolean; lastRecoveryStart: string | null };
};

export async function loadQuestGenContext(supabase: SupabaseServerClient, userId: string, now: Date): Promise<QuestGenContext> {
  const { timezone: tz, settings } = await getSchedulerContext(supabase, userId);
  const today = toLocalDate(now, tz);
  const week = localWeek(today, tz, settings.week_starts_on);
  const todayRange = localDayRange(today, tz);
  const since = localDayRange(addLocalDays(today, -28, tz), tz).start;

  const [capacity, blocks, targetTasks, sessions, domains, earliest, lastRecovery] = await Promise.all([
    loadDailyCapacity(supabase, userId, now, settings, tz),
    supabase.from("schedule_blocks").select("task_id, starts_at, ends_at, status").eq("user_id", userId)
      .lt("starts_at", todayRange.end).gt("ends_at", todayRange.start),
    supabase.from("tasks").select("id").eq("user_id", userId).eq("target_date", today).not("status", "in", "(completed,cancelled)"),
    supabase.from("work_sessions").select(`task_id, started_at, ended_at, ${PAUSES}, task:tasks!work_sessions_task_id_user_id_fkey(practice_domain_id)`)
      .eq("user_id", userId).gte("started_at", since).limit(5000),
    supabase.from("practice_domains").select("id, parent_id").eq("user_id", userId),
    supabase.from("work_sessions").select("started_at").eq("user_id", userId).order("started_at").limit(1).maybeSingle(),
    supabase.from("quests").select("period_start").eq("user_id", userId).eq("type", "recovery").order("period_start", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [blocks, targetTasks, sessions, domains, earliest, lastRecovery]) if (r.error) throw fromDbError(r.error);

  const parent = Object.fromEntries(domains.data!.map((d) => [d.id, d.parent_id]));
  const nowMs = now.getTime();
  const sessionRows = sessions.data!.map((s) => ({ ...s, pauses: s.pauses ?? [] }));

  // Top root domain by focused minutes over the last 28 days.
  const byRoot = new Map<string, number>();
  for (const s of sessionRows) {
    const task = Array.isArray(s.task) ? s.task[0] : s.task;
    const root = rootOf(task?.practice_domain_id ?? null, parent);
    if (!root) continue;
    byRoot.set(root, (byRoot.get(root) ?? 0) + focusedMinutesInWindow(s, s.pauses, 0, nowMs, nowMs));
  }
  const topDomainId = [...byRoot].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const plannedBlocks = blocks.data!.filter((b) => b.status === "planned");
  const plannedTaskIds = [...new Set([...plannedBlocks.map((b) => b.task_id), ...targetTasks.data!.map((t) => t.id)])];

  // Last two planned work days before today and their focused minutes.
  const lastTwoWorkDays: { date: string; focused: number }[] = [];
  for (let d = addLocalDays(today, -1, tz), i = 0; lastTwoWorkDays.length < 2 && i < 14; d = addLocalDays(d, -1, tz), i++) {
    if (!isWorkDay(d, settings.planned_work_days)) continue;
    const r = localDayRange(d, tz);
    const from = new Date(r.start).getTime();
    const to = new Date(r.end).getTime();
    lastTwoWorkDays.push({ date: d, focused: sessionRows.reduce((sum, s) => sum + focusedMinutesInWindow(s, s.pauses, from, to, nowMs), 0) });
  }
  const oldest = lastTwoWorkDays[lastTwoWorkDays.length - 1]?.date;
  const hadEarlierActivity = !!earliest.data && !!oldest && earliest.data.started_at < localDayRange(oldest, tz).start;

  const weekEnd = addLocalDays(week.endDate, -1, tz);
  return {
    today,
    tomorrow: addLocalDays(today, 1, tz),
    week: { start: week.startDate, end: weekEnd },
    daily: { date: today, capacity, plannedMinutes: dayPlannedMinutes(blocks.data!, todayRange), plannedTaskIds, topDomainId },
    weekly: {
      weekStart: week.startDate,
      weekEnd,
      capacity,
      plannedWorkDayCount: week.days.filter((d) => isWorkDay(d, settings.planned_work_days)).length,
      topDomainId,
    },
    recovery: { minMeaningful: settings.min_meaningful_minutes, lastTwoWorkDays, hadEarlierActivity, lastRecoveryStart: lastRecovery.data?.period_start ?? null },
  };
}

/** Facts for evaluating quests over local days [from, to] (from E1's loader plus task domains, capacity and blocks booked since). */
export async function loadQuestFacts(supabase: SupabaseServerClient, userId: string, from: string, to: string, bookedSince: string, now: Date): Promise<QuestFacts> {
  const raw = await loadXpRaw(supabase, userId, from, to, now);
  const { settings } = await getSchedulerContext(supabase, userId);
  const taskIds = [...new Set([...raw.sessions.map((s) => s.task_id), ...raw.completedTasks.map((t) => t.id)])];
  const [tasks, domains, booked, capacity] = await Promise.all([
    taskIds.length
      ? supabase.from("tasks").select("id, status, completed_at, practice_domain_id").eq("user_id", userId).in("id", taskIds.slice(0, 1000))
      : Promise.resolve({ data: [], error: null }),
    supabase.from("practice_domains").select("id, parent_id").eq("user_id", userId),
    supabase.from("schedule_blocks").select("id, created_at, starts_at, ends_at, status").eq("user_id", userId).gte("created_at", bookedSince),
    loadDailyCapacity(supabase, userId, now, settings, raw.timezone),
  ]);
  for (const r of [tasks, domains, booked]) if (r.error) throw fromDbError(r.error);
  const status = new Map(raw.blocks.map((b) => [b.id, b.status]));
  const finals = commitments({ now: raw.now, settings: raw.settings, blocks: raw.blocks, revisions: raw.revisions, sessions: raw.sessions.map((s) => ({ ...s, focus_score: null })) })
    .filter((c) => c.kind === "final")
    .map((c) => {
      const st = status.get(c.blockId);
      return { blockId: c.blockId, resolvedAt: c.resolvedAt, score: c.score, kept: c.score >= 0.75 && st !== "skipped" && st !== "cancelled" };
    });
  const blocks = new Map([...raw.blocks, ...booked.data!].map((b) => [b.id, b]));
  return {
    timezone: raw.timezone,
    now: raw.now,
    plannedWorkDays: raw.settings.planned_work_days,
    capacity,
    sessions: raw.sessions.map((s) => ({ id: s.id, task_id: s.task_id, source: s.source, started_at: s.started_at, ended_at: s.ended_at, pauses: s.pauses })),
    tasks: Object.fromEntries(tasks.data!.map((t) => [t.id, { status: t.status, completedAt: t.completed_at, domainId: t.practice_domain_id }])),
    domainParent: Object.fromEntries(domains.data!.map((d) => [d.id, d.parent_id])),
    commitments: finals,
    blocks: [...blocks.values()],
  };
}

export type QuestRow = {
  id: string; type: QuestType; title: string; status: string; period_start: string; period_end: string;
  reward_xp: number; swap_used: boolean; spare: unknown; created_at: string;
  objectives: { id: string; position: number; metric: QuestMetric; params: ObjectiveParams; target_value: number; current_value: number; completed_at: string | null }[];
};

export async function listQuests(supabase: SupabaseServerClient, userId: string, filter: { active?: boolean; visibleOn?: string }): Promise<QuestRow[]> {
  let q = supabase
    .from("quests")
    .select("id, type, title, status, period_start, period_end, reward_xp, swap_used, spare, created_at, objectives:quest_objectives!quest_objectives_quest_id_user_id_fkey(id, position, metric, params, target_value, current_value, completed_at)")
    .eq("user_id", userId);
  if (filter.active) q = q.eq("status", "active");
  if (filter.visibleOn) q = q.in("status", ["active", "cleared"]).gte("period_end", filter.visibleOn).lte("period_start", filter.visibleOn);
  const { data, error } = await q.order("created_at");
  if (error) throw fromDbError(error);
  return (data as unknown as QuestRow[]).map((r) => ({ ...r, objectives: [...r.objectives].sort((a, b) => a.position - b.position) }));
}
```
(If the generated FK names differ, use the names from `src/types/database.ts`.)

`services/quest.service.ts`
```ts
import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { Json } from "@/types/database";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { toLocalDate } from "@/features/scheduler/utils/timezone";
import type { ObjectiveDraft, QuestDraft } from "../domain/quest.types";
import { listQuests, loadQuestFacts, loadQuestGenContext } from "../queries/quest.queries";
import { getPlayerProfile } from "../queries/xp.queries";
import { dailyQuest, evaluateQuest, nextSwap, QUEST_RULES_VERSION, recoveryDue, recoveryQuest, weeklyQuest } from "../utils/quest-rules";

const obj = (o: ObjectiveDraft, position?: number) => ({ ...(position ? { position } : {}), metric: o.metric, params: o.params, target_value: o.target });

async function create(ctx: ActionContext, d: QuestDraft, admin: boolean) {
  const { error } = await ctx.supabase.rpc("create_quest", {
    p_quest: { type: d.type, title: d.title, period_start: d.periodStart, period_end: d.periodEnd, reward_xp: d.rewardXp, rules_version: QUEST_RULES_VERSION, spare: d.spare.map((s) => obj(s)) } as unknown as Json,
    p_objectives: d.objectives.map((o, i) => obj(o, i + 1)) as unknown as Json,
    ...(admin ? { p_user_id: ctx.user.id } : {}),
  });
  // A concurrent recovery insert loses the partial unique index race: fine, one exists.
  if (error && error.code !== "23505") throw fromDbError(error);
}

/** Expire past quests and create today's/this week's/recovery quests (idempotent). No-op while gamification is off. */
export async function ensureQuests(ctx: ActionContext, now: Date, admin = false): Promise<void> {
  const profile = await getPlayerProfile(ctx.supabase, ctx.user.id);
  if (!profile?.gamification_enabled) return;
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const today = toLocalDate(now, timezone);
  const exp = await ctx.supabase.from("quests").update({ status: "expired" }).eq("user_id", ctx.user.id).eq("status", "active").lt("period_end", today);
  if (exp.error) throw fromDbError(exp.error);

  const existing = await ctx.supabase.from("quests").select("type, period_start, status").eq("user_id", ctx.user.id).gte("period_end", today);
  if (existing.error) throw fromDbError(existing.error);
  const g = await loadQuestGenContext(ctx.supabase, ctx.user.id, now);
  const has = (type: string, start: string) => existing.data.some((q) => q.type === type && q.period_start === start);
  if (!has("daily", g.today)) await create(ctx, dailyQuest(g.daily), admin);
  if (!has("weekly", g.week.start)) await create(ctx, weeklyQuest(g.weekly), admin);
  const activeRecovery = existing.data.some((q) => q.type === "recovery" && q.status === "active");
  if (!activeRecovery && recoveryDue({ today: g.today, ...g.recovery })) await create(ctx, recoveryQuest(g.today, g.tomorrow), admin);
}

/** Recompute active quests' objectives; clear completed quests. Returns what cleared now. */
export async function evaluateQuests(ctx: ActionContext, now: Date) {
  const quests = await listQuests(ctx.supabase, ctx.user.id, { active: true });
  if (quests.length === 0) return { cleared: [] as { id: string; type: string; title: string; xp: number }[] };
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const today = toLocalDate(now, timezone);
  const from = quests.map((q) => q.period_start).sort()[0];
  const bookedSince = quests.map((q) => q.created_at).sort()[0];
  const facts = await loadQuestFacts(ctx.supabase, ctx.user.id, from, today, bookedSince, now);
  const cleared: { id: string; type: string; title: string; xp: number }[] = [];
  for (const q of quests) {
    const r = evaluateQuest(
      { periodStart: q.period_start, periodEnd: q.period_end, createdAt: q.created_at },
      q.objectives.map((o) => ({ id: o.id, metric: o.metric, params: o.params, target: Number(o.target_value), completedAt: o.completed_at })),
      facts,
    );
    for (const u of r.updates) {
      const prev = q.objectives.find((o) => o.id === u.id)!;
      if (Number(prev.current_value) === u.current && prev.completed_at === u.completedAt) continue;
      const up = await ctx.supabase.from("quest_objectives").update({ current_value: u.current, completed_at: u.completedAt }).eq("id", u.id).eq("user_id", ctx.user.id);
      if (up.error) throw fromDbError(up.error);
    }
    if (r.cleared) {
      const up = await ctx.supabase.from("quests").update({ status: "cleared", cleared_at: facts.now }).eq("id", q.id).eq("user_id", ctx.user.id).eq("status", "active").select("id");
      if (up.error) throw fromDbError(up.error);
      if (up.data.length) cleared.push({ id: q.id, type: q.type, title: q.title, xp: q.reward_xp });
    }
  }
  return { cleared };
}

export async function swapObjective(ctx: ActionContext, objectiveId: string): Promise<void> {
  const quests = await listQuests(ctx.supabase, ctx.user.id, { active: true });
  const quest = quests.find((q) => q.type === "daily" && q.objectives.some((o) => o.id === objectiveId));
  if (!quest) throw new AppError("NOT_FOUND");
  const target = quest.objectives.find((o) => o.id === objectiveId)!;
  if (quest.swap_used || target.completed_at) throw new AppError("CONFLICT", "이 목표는 교체할 수 없습니다.");
  const spare = (quest.spare as { metric: ObjectiveDraft["metric"]; params: ObjectiveDraft["params"]; target_value: number }[]).map((s) => ({ metric: s.metric, params: s.params, target: Number(s.target_value) }));
  const next = nextSwap(quest.objectives.map((o) => ({ metric: o.metric, completed: !!o.completed_at })), spare);
  if (!next) throw new AppError("CONFLICT", "바꿀 수 있는 다른 목표가 없습니다.");
  const { error } = await ctx.supabase.rpc("swap_quest_objective", {
    p_objective_id: objectiveId,
    p_objective: obj(next.replacement) as unknown as Json,
    p_spare: next.spare.map((s) => obj(s)) as unknown as Json,
  });
  if (error) throw error.code === "23514" ? new AppError("CONFLICT", "이 목표는 교체할 수 없습니다.") : fromDbError(error);
}
```

`services/achievement.service.ts`
```ts
import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { commitments } from "@/features/analytics/utils/stats";
import { focusStats } from "@/features/scheduler/utils/focus";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { ACHIEVEMENTS, newlyUnlocked, TITLES, type AchievementFacts } from "../utils/achievements";

const LIMIT = 10000;
const PAUSES = "pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at)";

export async function listUnlocked(supabase: SupabaseServerClient, userId: string) {
  const [a, t] = await Promise.all([
    supabase.from("user_achievements").select("key, unlocked_at").eq("user_id", userId),
    supabase.from("user_titles").select("key, unlocked_at").eq("user_id", userId),
  ]);
  if (a.error) throw fromDbError(a.error);
  if (t.error) throw fromDbError(t.error);
  return { achievements: a.data, titles: t.data };
}

/** Lifetime facts. Only loaded when something is still locked. */
export async function loadAchievementFacts(supabase: SupabaseServerClient, userId: string, now: Date): Promise<AchievementFacts> {
  const { settings } = await getSchedulerContext(supabase, userId);
  const [sessions, plan, blocks, revisions, quests] = await Promise.all([
    supabase.from("work_sessions").select(`id, task_id, schedule_block_id, source, started_at, ended_at, ${PAUSES}`).eq("user_id", userId).limit(LIMIT),
    supabase.from("task_plan_actual").select("user_estimated_minutes, actual_minutes, status").eq("user_id", userId).eq("status", "completed").limit(LIMIT),
    supabase.from("schedule_blocks").select("id, task_id, starts_at, ends_at, status, created_at, updated_at").eq("user_id", userId).limit(LIMIT),
    supabase.from("schedule_block_revisions").select("schedule_block_id, change_type, previous_starts_at, new_starts_at, created_at").eq("user_id", userId).limit(LIMIT),
    supabase.from("quests").select("type").eq("user_id", userId).eq("status", "cleared"),
  ]);
  for (const r of [sessions, plan, blocks, revisions, quests]) if (r.error) throw fromDbError(r.error);
  const s = sessions.data!.map((x) => ({ ...x, pauses: x.pauses ?? [], focus_score: null }));
  const perfect = commitments({
    now: now.toISOString(),
    settings: { planned_work_days: settings.planned_work_days, min_meaningful_minutes: settings.min_meaningful_minutes, commit_lead_minutes: settings.commit_lead_minutes },
    blocks: blocks.data!,
    revisions: revisions.data!.map((r) => ({ ...r, block_id: r.schedule_block_id })),
    sessions: s,
  }).filter((c) => c.kind === "final" && c.score === 1).length;
  return {
    sessionFocus: s.filter((x) => x.source === "timer" && x.ended_at).map((x) => focusStats(x, x.pauses).focusedMs / 60_000),
    calibrationErrors: plan.data!
      .filter((p) => p.user_estimated_minutes && p.actual_minutes)
      .map((p) => Math.abs(Number(p.actual_minutes) / Number(p.user_estimated_minutes) - 1)),
    perfectCommitments: perfect,
    weeklyCleared: quests.data!.filter((q) => q.type === "weekly").length,
    recoveryCleared: quests.data!.filter((q) => q.type === "recovery").length,
  };
}

/** Unlock what the facts now satisfy (and its title). Returns the new keys. */
export async function evaluateAchievements(ctx: ActionContext, now: Date): Promise<string[]> {
  const { achievements } = await listUnlocked(ctx.supabase, ctx.user.id);
  const unlocked = new Set(achievements.map((a) => a.key));
  if (ACHIEVEMENTS.every((a) => unlocked.has(a.key))) return [];
  const keys = newlyUnlocked(await loadAchievementFacts(ctx.supabase, ctx.user.id, now), unlocked);
  if (keys.length === 0) return [];
  const rows = keys.map((key) => ({ user_id: ctx.user.id, key }));
  const titles = keys.map((k) => ACHIEVEMENTS.find((a) => a.key === k)!.titleKey).filter((k): k is string => !!k).map((key) => ({ user_id: ctx.user.id, key }));
  const a = await ctx.supabase.from("user_achievements").upsert(rows, { onConflict: "user_id,key", ignoreDuplicates: true });
  if (a.error) throw fromDbError(a.error);
  if (titles.length) {
    const t = await ctx.supabase.from("user_titles").upsert(titles, { onConflict: "user_id,key", ignoreDuplicates: true });
    if (t.error) throw fromDbError(t.error);
  }
  return keys;
}

export async function equipTitle(ctx: ActionContext, key: string | null): Promise<void> {
  if (key !== null && !TITLES[key]) throw new AppError("VALIDATION_ERROR");
  const { error } = await ctx.supabase.from("player_profiles").update({ equipped_title: key }).eq("user_id", ctx.user.id);
  if (error) throw error.code === "23514" ? new AppError("CONFLICT", "아직 얻지 않은 칭호입니다.") : fromDbError(error);
}
```
(`upsert` with `ignoreDuplicates` is `INSERT … ON CONFLICT DO NOTHING`, which needs no update privilege.)

`progress.service.ts` changes:
- `award` is reused for quest XP; `evaluateProgress` becomes:
```ts
export async function evaluateProgress(ctx: ActionContext, now = new Date(), admin = false): Promise<ProgressDelta | null> {
  try {
    const profile = await getPlayerProfile(ctx.supabase, ctx.user.id);
    if (!profile?.gamification_enabled) return null;
    return await evaluateAll(ctx, now, admin);
  } catch (error) {
    log({ action: "gamification.evaluate", userId: ctx.user.id, success: false, errorCode: "INTERNAL_ERROR", detail: String(error) });
    return null;
  }
}

async function evaluateAll(ctx: ActionContext, now: Date, admin: boolean): Promise<ProgressDelta | null> {
  const { from, to } = await recentRange(ctx, now);
  const xp = await evaluateRange(ctx, from, to, now, admin);
  const { cleared } = await evaluateQuests(ctx, now);
  const questEvents: NewXpEvent[] = cleared.map((q) => ({ rule: "quest", sourceType: "quest", sourceId: q.id, localDate: to, xp: q.xp, metadata: {} }));
  const questAward = questEvents.length ? await award(ctx, questEvents, admin) : null;
  const keys = await evaluateAchievements(ctx, now);
  const awards = [xp.result, questAward].filter((a): a is AwardResult => !!a);
  return deltaFrom([...xp.events, ...questEvents], awards, {
    questsCleared: cleared.map((q) => ({ type: q.type, title: q.title, xp: q.xp })),
    achievements: keys.map((k) => ({ key: k, name: ACHIEVEMENTS.find((a) => a.key === k)!.name })),
  });
}
```
- `reconcileProgress(ctx, now)`: when enabled → `await ensureQuests(ctx, now, true); const d = await evaluateAll(ctx, now, true); return d ? d.xp.length : 0;`
- `enableGamification`: after the backfill windows and flag update → `const keys = await evaluateAchievements(ctx, now); await ensureQuests(ctx, now);` and return `{ level, total, achievements: keys.length }`.
- `updateGamificationSettings` input gains `quest_terminology`.

`gamification.schema.ts`: `gamificationSettingsSchema` adds `quest_terminology: z.boolean()`; add
`swapObjectiveSchema = z.object({ objectiveId: z.uuid() })`, `equipTitleSchema = z.object({ titleKey: z.string().max(40).nullable() })`.

`xp.queries.ts`: `PlayerProfile` + select include `equipped_title`.

`actions/quest.actions.ts`
```ts
"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { equipTitleSchema, swapObjectiveSchema } from "../schemas/gamification.schema";
import { equipTitle } from "../services/achievement.service";
import { swapObjective } from "../services/quest.service";

export async function swapQuestObjectiveAction(input: unknown) {
  return runAction("quest.swap", swapObjectiveSchema, input, async ({ objectiveId }, ctx) => {
    await swapObjective(ctx, objectiveId);
    revalidatePath("/scheduler", "layout");
  });
}

export async function equipTitleAction(input: unknown) {
  return runAction("title.equip", equipTitleSchema, input, async ({ titleKey }, ctx) => {
    await equipTitle(ctx, titleKey);
    revalidatePath("/", "layout");
  });
}
```

`enable-card.tsx`: success toast `지금까지 기록으로 Lv.${r.level}에서 시작${r.achievements ? ` · 업적 ${r.achievements}개 달성` : ""}`.

- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run` — Expected: clean, all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/progress.ts src/features/gamification tests/unit/progress-delta.test.ts
git commit -m "E2-4: quest/achievement loaders and services, swap/equip actions, quests in evaluateProgress and nightly"
```

---

### Task 5: Quest panel, notifier toasts, scheduler page wiring

**Files:**
- Create: `src/features/gamification/components/quest-panel.tsx`, `src/features/gamification/utils/quest-view.ts`
- Modify: `src/features/gamification/components/progress-notifier.tsx` (toasts; `PlayerView.achievementToasts`, `title`),
  `src/app/(private)/layout.tsx` (PlayerView fields), `src/app/(private)/scheduler/page.tsx`,
  `src/features/scheduler/components/scheduler-workspace.tsx`, `src/features/scheduler/components/today-task-panel.tsx`
- Test: `tests/unit/quest-view.test.ts`

**Interfaces:**
- Consumes: `listQuests`, `ensureQuests`, `QUEST_META`, `useTerms` (Task 7 provides the provider; until then `useTerms` returns plain terms via the default context — create `src/hooks/use-terms.ts` here with the default).
- Produces: `toQuestViews(rows, domainNames) → QuestView[]`, `objectiveText(o, terms) → string`, `<QuestPanel quests>`, workspace/panel prop `questPanel?: React.ReactNode`.

- [ ] **Step 1: Failing test** `tests/unit/quest-view.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { objectiveText, toQuestViews } from "@/features/gamification/utils/quest-view";
import { PLAIN_TERMS, QUEST_TERMS } from "@/lib/terms";

const o = (metric: string, current: number, target: number, params = {}) => ({ id: metric, position: 1, metric, params, target_value: target, current_value: current, completed_at: current >= target ? "2026-09-30T15:00:00Z" : null });

describe("objectiveText", () => {
  it("renders progress as text", () => {
    const [v] = toQuestViews([{ id: "q", type: "daily", title: "모멘텀 쌓기", status: "active", period_start: "2026-09-30", period_end: "2026-09-30", reward_xp: 50, swap_used: false, spare: [{ metric: "early_session" }], created_at: "", objectives: [
      o("focus_minutes", 45, 90) as never, o("complete_planned_tasks", 1, 2) as never, o("domain_minutes", 30, 30, { domainId: "d" }) as never,
    ] }], { d: "영어" });
    expect(v.canSwap).toBe(true);
    expect(v.objectives.map((x) => objectiveText(x, PLAIN_TERMS))).toEqual(["집중 45m / 1h 30m", "계획한 할 일 완료 1/2", "영어 연습 30m / 30m"]);
    expect(objectiveText(v.objectives[1], QUEST_TERMS)).toBe("계획한 퀘스트 완료 1/2");
    expect(v.objectives[2].done).toBe(true);
  });
  it("cannot swap once used or without spare", () => {
    const base = { id: "q", type: "daily" as const, title: "t", status: "active", period_start: "", period_end: "", reward_xp: 50, created_at: "", objectives: [] };
    expect(toQuestViews([{ ...base, swap_used: true, spare: [{}] }], {})[0].canSwap).toBe(false);
    expect(toQuestViews([{ ...base, swap_used: false, spare: [] }], {})[0].canSwap).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/hooks/use-terms.ts` (client context, default plain):
```ts
"use client";

import { createContext, useContext } from "react";
import { PLAIN_TERMS, type Terms } from "@/lib/terms";

export const TermsContext = createContext<Terms>(PLAIN_TERMS);
export const useTerms = () => useContext(TermsContext);
```

`src/features/gamification/utils/quest-view.ts`
```ts
import { formatMinutes } from "@/features/scheduler/utils/duration";
import type { Terms } from "@/lib/terms";
import type { QuestMetric, QuestType } from "../domain/quest.types";
import type { QuestRow } from "../queries/quest.queries";

export type ObjectiveView = { id: string; metric: QuestMetric; current: number; target: number; done: boolean; domainName: string | null; before: string | null; minMinutes: number | null };
export type QuestView = { id: string; type: QuestType; title: string; status: string; rewardXp: number; canSwap: boolean; swapUsed: boolean; objectives: ObjectiveView[] };

export function toQuestViews(rows: QuestRow[], domainNames: Record<string, string>): QuestView[] {
  return rows.map((q) => ({
    id: q.id,
    type: q.type,
    title: q.title,
    status: q.status,
    rewardXp: q.reward_xp,
    swapUsed: q.swap_used,
    canSwap: q.type === "daily" && q.status === "active" && !q.swap_used && Array.isArray(q.spare) && q.spare.length > 0,
    objectives: q.objectives.map((o) => ({
      id: o.id,
      metric: o.metric,
      current: Number(o.current_value),
      target: Number(o.target_value),
      done: o.completed_at !== null,
      domainName: o.params?.domainId ? (domainNames[o.params.domainId] ?? "영역") : null,
      before: o.params?.before ?? null,
      minMinutes: o.params?.minMinutes ?? null,
    })),
  }));
}

export function objectiveText(o: ObjectiveView, terms: Terms): string {
  const m = (x: number) => formatMinutes(x);
  switch (o.metric) {
    case "focus_minutes": return `집중 ${m(o.current)} / ${m(o.target)}`;
    case "complete_planned_tasks": return `계획한 ${terms.task} 완료 ${o.current}/${o.target}`;
    case "complete_tasks": return `${terms.task} 완료 ${o.current}/${o.target}`;
    case "domain_minutes": return `${o.domainName} 연습 ${m(o.current)} / ${m(o.target)}`;
    case "domain_sessions": return `${o.domainName} 세션 ${o.current}/${o.target}`;
    case "kept_commitments": return `약속 블록 지키기 ${o.current}/${o.target}`;
    case "kept_commitment_rate": return `약속 블록 ${o.target}% 이상 지키기 · 현재 ${o.current}%`;
    case "days_within_capacity": return `작업량 안에서 계획한 날 ${o.current}/${o.target}`;
    case "early_session": return `${o.before ?? "12:00"} 전에 타이머 시작`;
    case "booked_block": return `${o.minMinutes ?? 30}분 블록 잡기`;
    case "started_session": return "타이머 시작하기";
  }
}
```
(Check `formatMinutes(90)` output; the test expects `1h 30m` and `formatMinutes(30)` → `30m`.)

`src/features/gamification/components/quest-panel.tsx`
```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import { QUEST_META } from "../domain/quest.types";
import { swapQuestObjectiveAction } from "../actions/quest.actions";
import { objectiveText, type QuestView } from "../utils/quest-view";

const KEY = "kyod.quests.collapsed";
const readCollapsed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** Quests above the Today sections (E2 spec §5). Symbols + text, never color alone. */
export function QuestPanel({ quests }: { quests: QuestView[] }) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [open, setOpen] = useState<string | null>(null);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // storage blocked: state just resets next time
    }
  };
  const daily = quests.find((q) => q.type === "daily");
  const others = quests.filter((q) => q.type !== "daily");

  return (
    <section aria-label="퀘스트" className="mx-4 mb-2 rounded-md border border-border text-xs">
      <button type="button" onClick={toggle} aria-expanded={!collapsed} className="flex w-full items-center gap-1.5 px-3 py-2 font-mono tracking-wider">
        {collapsed ? <ChevronRight className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
        QUESTS
        <span className="ml-auto text-muted-foreground">
          {quests.filter((q) => q.status === "cleared").length}/{quests.length} CLEARED
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {daily && <QuestBlock quest={daily} expanded />}
          {others.map((q) => (
            <div key={q.id}>
              <button type="button" onClick={() => setOpen(open === q.id ? null : q.id)} aria-expanded={open === q.id} className="flex w-full items-center gap-1.5 text-left">
                <span className="font-mono tracking-wider">{QUEST_META[q.type].label}</span>
                <span className="text-muted-foreground">· {q.title}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {q.status === "cleared" ? "CLEARED" : `${q.objectives.filter((o) => o.done).length}/${q.objectives.length}`}
                </span>
              </button>
              {open === q.id && <QuestBlock quest={q} />}
            </div>
          ))}
        </div>
      )}
    </section>
  );

  function QuestBlock({ quest, expanded = false }: { quest: QuestView; expanded?: boolean }) {
    return (
      <div aria-label={`${QUEST_META[quest.type].label} ${quest.title}`} className="space-y-1">
        {expanded && (
          <p className="flex items-baseline gap-1.5">
            <span className="font-mono tracking-wider">{QUEST_META[quest.type].label}</span>
            <span className="text-muted-foreground">· {quest.title} · +{quest.rewardXp} XP</span>
            {quest.status === "cleared" && <span className="ml-auto font-mono">CLEARED</span>}
          </p>
        )}
        <ul className="space-y-0.5">
          {quest.objectives.map((o) => (
            <li key={o.id} className="flex items-center gap-2">
              <span aria-hidden>{o.done ? "☑" : "☐"}</span>
              <span className="min-w-0 flex-1 tabular-nums">
                <span className="sr-only">{o.done ? "완료: " : "진행 중: "}</span>
                {objectiveText(o, terms)}
              </span>
              {quest.canSwap && !o.done && (
                <Button size="xs" variant="ghost" disabled={pending} aria-label={`${objectiveText(o, terms)} 교체`}
                  onClick={() => run(() => swapQuestObjectiveAction({ objectiveId: o.id }), { success: "목표를 바꿨습니다." })}>
                  <Repeat aria-hidden /> 교체
                </Button>
              )}
            </li>
          ))}
        </ul>
        {quest.type === "daily" && quest.swapUsed && <p className="text-muted-foreground">교체 사용함</p>}
      </div>
    );
  }
}
```
(`useState(readCollapsed)` runs on the server too, where it returns `false`; if a hydration warning appears in the browser check, switch to `useSyncExternalStore` like `capacity-notice.tsx`.)

`progress-notifier.tsx`: in `push`, after the chip/level handling:
```ts
for (const q of d.questsCleared ?? []) toast.success(`QUEST CLEARED · ${q.title} +${q.xp} XP`);
if (player?.achievementToasts) for (const a of d.achievements ?? []) toast(`ACHIEVEMENT · ${a.name}`);
```
(`push` now depends on `player`; add it to `useCallback` deps.) `PlayerView` gains `achievementToasts: boolean; title: string | null`.

`layout.tsx`: `player` adds `achievementToasts: profile.achievement_toasts, title: profile.equipped_title ? TITLES[profile.equipped_title] ?? null : null`.

`scheduler/page.tsx` (after the existing reads):
```tsx
const profile = await getPlayerProfile(supabase, user.id);
let quests: QuestView[] = [];
if (profile?.gamification_enabled) {
  try {
    await ensureQuests({ user, supabase }, new Date());
    const [rows, domainRows] = await Promise.all([listQuests(supabase, user.id, { visibleOn: today }), supabase.from("practice_domains").select("id, name").eq("user_id", user.id)]);
    quests = toQuestViews(rows, Object.fromEntries((domainRows.data ?? []).map((d) => [d.id, d.name])));
  } catch (error) {
    log({ action: "quests.ensure", userId: user.id, success: false, errorCode: "INTERNAL_ERROR", detail: String(error) });
  }
}
// <SchedulerWorkspace … questPanel={quests.length ? <QuestPanel quests={quests} /> : null} />
```
`scheduler-workspace.tsx`: add `questPanel?: React.ReactNode` to props and pass it to `TodayTaskPanel`;
`today-task-panel.tsx`: add the prop and render `{questPanel}` right after `<TagFilter … />`.

- [ ] **Step 4: Run** `npx tsc --noEmit && npx eslint src && npx vitest run` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-terms.ts src/features/gamification/utils/quest-view.ts src/features/gamification/components/quest-panel.tsx src/features/gamification/components/progress-notifier.tsx "src/app/(private)/layout.tsx" "src/app/(private)/scheduler/page.tsx" src/features/scheduler/components/scheduler-workspace.tsx src/features/scheduler/components/today-task-panel.tsx tests/unit/quest-view.test.ts
git commit -m "E2-5: quest panel, quest/achievement toasts, scheduler wiring"
```

---

### Task 6: Progress page — achievements, titles, player quests, settings terminology, level-line title

**Files:**
- Create: `src/features/gamification/components/achievements-section.tsx`, `src/features/gamification/components/title-list.tsx`
- Modify: `src/features/gamification/components/player-section.tsx`, `src/features/gamification/components/gamification-settings-dialog.tsx`,
  `src/features/gamification/components/level-line.tsx`, `src/app/(private)/scheduler/progress/page.tsx`

- [ ] **Step 1: Implement**
- `AchievementsSection` (server): props `facts: AchievementFacts`, `unlocked: { key; unlocked_at }[]`, `timezone`. Renders
  `<section aria-labelledby="achievements-heading">` with a `<ul>` of cards: name (mono), description, and either
  `달성 · {date}` (`toLocalDate(unlocked_at, tz)`) or `{current} / {target}` from `a.progress(facts, unlockedSet)`; a
  `☑`/`☐` symbol with sr-only "달성"/"미달성".
- `TitleList` (client): props `titles: { key; unlocked_at }[]`, `equipped: string | null`. Each row: `TITLES[key]`,
  `[장착]` or `장착 중 · [해제]` via `equipTitleAction`. Empty state "업적을 달성하면 칭호가 열립니다."
- `PlayerSection`: show `profile.equipped_title` name under the level (`text-xs tracking-widest`); accept `quests: QuestView[]` and render one summary line per quest (`DAILY QUEST · 모멘텀 쌓기 · 2/3` or `CLEARED`).
- Settings dialog: enable a `quest_terminology` row ("퀘스트 용어", hint "할 일 → 퀘스트, 프로젝트 → 메인 퀘스트"); send it with the others; remove the "(E2)" note from 업적 알림.
- `LevelLine`: under the link, `{player.title && <p className="hidden px-0 font-mono text-[10px] tracking-widest text-muted-foreground md:block">{player.title}</p>}`.
- Progress page (when enabled): load `listUnlocked`, `loadAchievementFacts`, `listQuests(visibleOn: today)` in parallel; render PlayerSection (with quests), then AchievementsSection and TitleList after the practice domains.

- [ ] **Step 2: Run** `npx tsc --noEmit && npx eslint src && npx vitest run` — Expected: clean.

- [ ] **Step 3: Browser check** (temporary Playwright script, screenshots in the scratchpad): progress page with gamification on (achievements, titles, settings dialog) and the scheduler quest panel; no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/gamification/components/achievements-section.tsx src/features/gamification/components/title-list.tsx src/features/gamification/components/player-section.tsx src/features/gamification/components/gamification-settings-dialog.tsx src/features/gamification/components/level-line.tsx "src/app/(private)/scheduler/progress/page.tsx"
git commit -m "E2-6: achievements and titles on the progress page, terminology setting, title under the level line"
```

---

### Task 7: Terminology provider and label replacement

**Files:**
- Create: `src/components/terms-provider.tsx`
- Modify: `src/app/(private)/layout.tsx` and every file in the table below.

- [ ] **Step 1: Provider**
```tsx
"use client";

import { TermsContext } from "@/hooks/use-terms";
import { termsFor } from "@/lib/terms";

export function TermsProvider({ quest, children }: { quest: boolean; children: React.ReactNode }) {
  return <TermsContext.Provider value={termsFor(quest)}>{children}</TermsContext.Provider>;
}
```
Layout: wrap inside `ProgressNotifier` with `<TermsProvider quest={!!profile?.gamification_enabled && !!profile.quest_terminology}>`.

- [ ] **Step 2: Replace labels.** Client components use `const terms = useTerms();`; server components/pages compute
`const terms = termsFor(!!profile?.gamification_enabled && !!profile?.quest_terminology)` (load `getPlayerProfile`) and pass
`terms` as a prop to server children. `metadata` titles and `AppError` messages stay. Use `josa` wherever a particle follows.

| File | Current | New |
|---|---|---|
| `components/layout/private-nav.tsx` | nav label "프로젝트" | `terms.project` (map NAV inside the component) |
| `scheduler/components/today-task-panel.tsx` | "진행 중인 프로젝트와 오늘 남은 시간을 보고 할 일을 제안합니다." | `` `진행 중인 ${josa(terms.project, "과/와")} 오늘 남은 시간을 보고 ${josa(terms.task, "을/를")} 제안합니다.` `` |
| same | "새 할 일" / placeholder "할 일 추가 (#태그 @영역)" / aria "할 일 추가" | `새 ${terms.task}` / `${terms.task} 추가 (#태그 @영역)` / `${terms.task} 추가` |
| `scheduler/components/work-summary-dialog.tsx` | "할 일을 완료했습니다." / "할 일 완료" | `${josa(terms.task, "을/를")} 완료했습니다.` / `${terms.task} 완료` |
| `scheduler/components/task-detail-drawer.tsx` | Field "프로젝트" | `terms.project` |
| `scheduler/components/today-sections.tsx` | "미배정 할 일이 없습니다." / aria "미배정 할 일" | `미배정 ${josa(terms.task, "이/가")} 없습니다.` / `미배정 ${terms.task}` |
| `scheduler/components/create-in-range-dialog.tsx` | Label "할 일" | `terms.task` |
| `scheduler/components/block-actions.tsx` | "할 일 완료" | `${terms.task} 완료` |
| `projects/components/project-detail.tsx` | "프로젝트 진행률", "마일스톤 없는 할 일", "…이 프로젝트 관련 제안…", "프로젝트 설정" | `${terms.project} 진행률`, `마일스톤 없는 ${terms.task}`, `이 ${terms.project} 관련 제안`, `${terms.project} 설정` |
| `projects/components/project-forms.tsx` | "새 프로젝트", "프로젝트를 만들었습니다.", "프로젝트 이름", "프로젝트 편집", "{label}에 할 일 추가" (×2), "{label} 할 일", placeholder "할 일 추가" | `새 ${terms.project}`, `${josa(terms.project, "을/를")} 만들었습니다.`, `${terms.project} 이름`, `${terms.project} 편집`, `${label}에 ${terms.task} 추가`, `${label} ${terms.task}`, `${terms.task} 추가` |
| `app/(private)/scheduler/projects/page.tsx` | heading "프로젝트", empty "아직 프로젝트가 없습니다. 목표가 있는 작업 묶음을 프로젝트로 만들어 보세요.", aria "프로젝트 목록", "프로젝트 상세", "프로젝트를 찾을 수 없습니다.", "왼쪽에서 프로젝트를 선택하거나 새로 만드세요." | `terms.project`, `` `아직 ${josa(terms.project, "이/가")} 없습니다. 목표가 있는 작업 묶음을 ${josa(terms.project, "으로/로")} 만들어 보세요.` ``, `${terms.project} 목록`, `${terms.project} 상세`, `${josa(terms.project, "을/를")} 찾을 수 없습니다.`, `왼쪽에서 ${josa(terms.project, "을/를")} 선택하거나 새로 만드세요.` |
| `ai/components/ai-recommendation-list.tsx` | "할 일로 추가했습니다." (×2) | `${josa(terms.task, "으로/로")} 추가했습니다.` |
| `classification/components/classification-dialog.tsx` | "할 일에 #태그를 …", "값이 비어 있는 할 일 N개에도 적용" | `${terms.task}에 #태그를 …`, `값이 비어 있는 ${terms.task} N개에도 적용` |
| `analytics/components/domain-bars.tsx` (server) | "할 일에 영역(@영역)을 붙이면 …" | prop `terms`: `${terms.task}에 영역(@영역)을 붙이면 …` |
| `analytics/components/pattern-list.tsx` (server) | "완료한 할 일이 더 필요합니다" | prop `terms`: `완료한 ${josa(terms.task, "이/가")} 더 필요합니다` |

If a listed component turns out to be a Server Component, use the prop form. After the table, grep again:
`grep -rn "할 일\|프로젝트" src --include=*.tsx | grep -v "(public)"` and handle any remaining visible label the same way
(leave comments, `metadata`, and `AppError` strings).

- [ ] **Step 3: Run** `npx tsc --noEmit && npx eslint src && npx vitest run` — Expected: clean. Run the existing E2E suites touching these labels
  (`scheduler`, `projects`, `today`) — Expected: PASS (terminology is off by default).

- [ ] **Step 4: Commit**

```bash
git add src/components/terms-provider.tsx "src/app/(private)/layout.tsx" src/components/layout/private-nav.tsx src/features/scheduler/components src/features/projects/components "src/app/(private)/scheduler/projects/page.tsx" "src/app/(private)/scheduler/progress/page.tsx" src/features/ai/components/ai-recommendation-list.tsx src/features/classification/components/classification-dialog.tsx src/features/analytics/components/domain-bars.tsx src/features/analytics/components/pattern-list.tsx
git commit -m "E2-7: quest terminology across the private UI"
```

---

### Task 8: E2E, cleanup, docs, full verification

**Files:**
- Create: `tests/e2e/quests.spec.ts`, `docs/decisions/0017-quests-achievements-terminology.md`
- Modify: `tests/e2e/helpers.ts`, `docs/decisions/README.md`, `docs/progress.md`, `docs/schema.md`, `docs/architecture.md`

- [ ] **Step 1: E2E** `tests/e2e/quests.spec.ts` — flow (same helpers and `at`/`localDate` as `gamification.spec.ts`):
  1. Record `before` = profile (`gamification_enabled, quest_terminology, equipped_title, backfilled_at`) and the ids of the
     user's existing `quests`, `user_achievements`, `user_titles` rows (to leave real ones alone).
  2. Seed `[e2e] 퀘스트 ${stamp}` task with target date today.
  3. Login → progress → [게임 요소 켜기] → go to `/scheduler`: `getByRole("region", { name: "퀘스트" })` shows `DAILY QUEST`.
  4. Swap: click the first `/교체$/` button → toast "목표를 바꿨습니다." → no `/교체$/` buttons remain and "교체 사용함" shows.
  5. Clear the daily quest deterministically: in the DB, set every daily objective's `target_value` to 1 and metric
     `started_session` (`update quest_objectives … where quest_id = <today's daily>`), then start and stop a timer on the
     seeded task through the UI (▶ then the focus bar's stop flow) → toast `/QUEST CLEARED · 모멘텀 쌓기 \+50 XP/`.
  6. FIRST STEP: seed a finished timer session of 15 minutes yesterday on the task → trigger evaluation by completing the task
     → progress page shows `FIRST STEP` with `달성`; click `[장착]` on BUILDER → level line shows `BUILDER` (desktop).
  7. Terminology: settings → check "퀘스트 용어" → save → nav link "메인 퀘스트" visible; `/scheduler` placeholder
     `퀘스트 추가 (#태그 @영역)`; turn it off again.
  8. `finally`: restore the profile (`before` or `{ gamification_enabled: false, quest_terminology: false, equipped_title: null, backfilled_at: null }`) first, then delete rows this test created: `quests` created at/after the test start (objectives cascade) and their `quest` XP events (`xp_events` where `source_type = 'quest'` and `source_id` in those ids), `user_titles` and `user_achievements` unlocked at/after the test start.
- [ ] **Step 1b: helpers cleanup** — `cleanup(db)` also deletes `xp_events` with `source_type = 'quest'` whose quest no longer exists is not needed; keep cleanup generic (tasks/sources only) and do the quest-specific removal in the spec's `finally`.
- [ ] **Step 2: Run the spec** — Expected: PASS.
- [ ] **Step 3: Docs** — ADR 0017 (spec §8 deviations + E2E residue note), README row `| 0017 | Quests, achievements, titles and quest terminology | accepted |`, `progress.md` E2 checklist, `schema.md` rows, `architecture.md` gamification line update.
- [ ] **Step 4: Full verification** — tsc, eslint, vitest, build (then delete `.next/dev/types/*` only if tsc reports a corrupted generated file, and restart the dev server with separate commands — never `pkill -f` a pattern that matches the running shell), all E2E (14 specs), DB check (no `[e2e]` tasks, profile restored).
- [ ] **Step 5: Commit + push**

```bash
git add tests/e2e/quests.spec.ts tests/e2e/helpers.ts docs/decisions/0017-quests-achievements-terminology.md docs/decisions/README.md docs/progress.md docs/schema.md docs/architecture.md
git commit -m "E2-8: quests E2E; ADR 0017, docs"
git push
```
