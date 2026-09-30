# XP, level, notifications, practice levels (sub-project E1) — design

- Date: 2026-09-30
- Sources:
  - `docs/improve-requirements-2.md` §17–20, §35, §58–62
  - Umbrella `docs/superpowers/specs/2026-09-30-growth-system-architecture.md` §2, §4 (E), §5, §7, §10, §11, §14
  - D2 (`commitments`, practice domains on the progress page)
- First part of E. E2 (quests, achievements, titles, quest terminology UI) follows.

## Goal
Add light, honest feedback on top of real work: an XP ledger, a level that never goes down, three notification
tiers, and practice levels per domain. The scheduler stays the center of the screen. Turning gamification off
removes every trace from the UI, and the core flows work unchanged.

## Decisions made with the user
1. E is split into **E1** (XP ledger, level, notifications, practice levels, settings) and **E2** (quests,
   achievements, titles).
2. Turning gamification on runs a **one-time backfill** over past activity with the same rules and caps.

## 1. Data

### `player_profiles`
`user_id pk → auth.users, level int not null default 1, total_xp int not null default 0,
gamification_enabled bool not null default false, quest_terminology bool not null default false,
animations_enabled bool not null default true, achievement_toasts bool not null default true,
backfilled_at timestamptz, created_at, updated_at`.
- `level` and `total_xp` are a cache, rebuildable from `xp_events`.
- RLS: users select, insert and update their own row. Column privileges limit `authenticated` updates to the
  settings columns and `backfilled_at`; `level` and `total_xp` are written only by the ledger trigger.
- `quest_terminology` is stored now; its UI arrives in E2.

### `xp_events`
`id uuid pk, user_id, rule text check in ('focus','completion','commitment'), source_type text, source_id uuid,
local_date date not null, xp int not null check (xp > 0), metadata jsonb not null default '{}', created_at`.
- Unique `(user_id, rule, source_id)`. Index `(user_id, local_date)`.
- RLS: select, insert and delete own rows; no update. Checks: `rule` in the set, `xp` between 1 and 120.
- `local_date` is the user's local day the XP belongs to (session end, completion time, commitment resolution).
  It makes daily caps a simple sum.
- An after-statement trigger (security definer, not callable) recomputes `player_profiles.total_xp`/`level` from the
  ledger on insert and delete. The owner can technically write their own ledger (the server evaluates with the
  user's JWT); in a single-owner tool this protects against accidents, not against the owner. Own delete exists so
  E2E cleanup can remove XP from test sources.

### `award_xp(p_events jsonb, p_user_id uuid default null) returns table(total_xp int, level int, previous_level int)`
- `security invoker`, `search_path = ''`, executable by `authenticated` and `service_role`.
- The user is `coalesce(auth.uid(), p_user_id)`: an authenticated caller always awards to themselves; the nightly
  job (service role) passes `p_user_id`.
- Inserts events with `on conflict do nothing` (idempotent) and returns the cached totals plus the level before the
  call. `xp_level(total)` mirrors `levelFor`.

## 2. Rules (pure, `features/gamification/utils/xp-rules.ts`, `XP_RULES_VERSION = "xp-v1"`)

### Facts per local day
```ts
type DayFacts = {
  date: string;                                    // local yyyy-MM-dd
  sessions: { id: string; source: "timer" | "manual"; endedAt: string; focusedMinutes: number }[];
  completions: { taskId: string; completedAt: string; focusedMinutes: number }[]; // lifetime focus on the task
  commitments: { blockId: string; resolvedAt: string; score: number }[];         // kind "final" only
};
type Existing = { rule: XpRule; sourceId: string; xp: number }[];                // already in the ledger that day
```

### `evaluateDay(facts, existing) → NewXpEvent[]`
- **Focus:** timer sessions with ≥ 10 focused minutes. `focusXp(m) = 0.5·min(m,30) + 0.2·clamp(m−30,0,60) +
  0.05·max(m−90,0)`, rounded down, capped at 30 per session. Manual sessions earn nothing.
- **Completion:** +20 per completed task whose total focused minutes are ≥ 10.
- **Commitment:** +10 per kept final commitment (resolved by a session or completion) with score ≥ 0.75. Proactive
  moves and early skips/cancels earn nothing.
- **Order and caps:** sources are taken in time order (session end, completion time, resolution time). Sources
  already in `existing` are skipped. The remaining day budget per rule is `cap − Σ existing xp for that rule`
  (focus 120, completion 5 × 20 = 100, commitment no cap). An event that would pass the budget is trimmed to the
  budget; a zero-XP event is not emitted.
- Evaluating twice with the ledger from the first run returns `[]`. Deleting a source never removes XP, and the
  day's total never exceeds the cap.

### Level
- XP needed to go from level L to L+1 = `100 + 50·L`. Level 1 at 0 XP.
- `levelFor(totalXp) → { level, into, need }` where `into` is XP past the current level start and `need` the
  step size. Mirrored in SQL inside `award_xp`.

### Practice level
- `practiceLevel(focusedHours) = floor(√h) + 1` per domain over lifetime focused time. Parents sum their children
  before the level is taken. Computed on read, never stored.

## 3. Evaluation flow (`features/gamification/services/progress.service.ts`)
- `evaluateProgress(ctx, { dates })`:
  - No-op returning an empty delta when the profile is missing or `gamification_enabled = false`.
  - Loads facts for the given local dates (sessions, completions, commitments via `commitments(loadStatInput…)`
    limited to blocks resolving on those days) and the ledger rows for those dates.
  - Calls `evaluateDay` per date, then `award_xp` once.
  - Returns `ProgressDelta = { xp: { rule, xp }[], levelUp: { from, to } | null }`.
  - Any failure is logged and returns an empty delta. The core action never fails because of gamification.
- **Call sites** (action layer only, after success): stop session, switch session, complete task, complete block.
  Manual entries earn nothing and are not evaluated. The action puts the delta on `ActionResult` success as
  `progress`.
- **Nightly:** the existing `duration_profile_refresh` job re-evaluates yesterday and today for every user with
  gamification on (admin client, explicit `user_id`). This settles commitment XP, which resolves after a block
  ends.
- **Backfill:** `enableGamification` sets the flag, evaluates every local day from the first activity through
  today (facts loaded once, grouped by day in memory, one `award_xp` call), sets `backfilled_at`, and returns the
  resulting level. Re-enabling runs the same full evaluation again (idempotent) and fills any days missed while
  off.

## 4. UI

### Level line
- Desktop: sidebar, under the logo. Mobile: right side of the top nav.
- `Lv.7 ▓▓▓▓░░ 320 / 450 XP` as text plus a thin bar; links to `/scheduler/progress`. Not rendered when off.
- The private layout loads the profile once and passes it to a `GamificationProvider` (settings + level).

### Notifications (`ProgressNotifier`, client context in the private layout)
- `useProgressFeedback()` returns `push(delta)`; call sites pass `result.progress` after a successful action.
  The provider then refreshes the level line.
- **Tiny:** `+12 XP` chip beside the level line for ~1.5 s, `aria-live="polite"`. Deltas within 500 ms merge.
- **Toast (sonner):** in E1 only the backfill result "지금까지 기록으로 Lv.N에서 시작". E2 adds quest/achievement
  toasts gated by `achievement_toasts`.
- **Event:** level up only. Full-screen overlay in the "SYSTEM" style (dark, thin border, monospace
  `LEVEL UP 6 → 7`). Closes on click, Esc, or after 4 s. It is a dialog (focus moves in and back). Several level-ups
  at once show one event. With `animations_enabled` off or `prefers-reduced-motion`, it appears without motion.
- No sound. Everything else stays calm.

### Progress page
- When off: a card "게임 요소 켜기" explaining that XP measures activity, not ability, with a button that runs the
  backfill.
- When on, a player section above the stats: level, XP bar, total XP, and XP by rule over the last 7 days, plus
  one line "XP는 능력이 아니라 활동량입니다". A ⚙ opens the settings dialog.
- Practice domain bars gain `Practice Lv.N` (parents roll up). The label never says skill.
- The four behavior stats are unchanged.

### Settings dialog
Gamification mode, system animations, achievement toasts (noted as used from E2). Turning the mode off keeps all
data.

## 5. Errors
- Gamification failures never surface on core actions (empty delta + log).
- The enable/settings actions follow Zod → user → service → `ActionResult`, mapping raw errors to `AppError`.
- A failed backfill leaves `backfilled_at` null and the flag off; retrying is safe.

## 6. Testing
- **Unit (`tests/unit/xp-rules.test.ts`, `level.test.ts`):** focus curve at 10/30/90/120 min; per-session cap 30;
  daily focus cap 120; completion cap 5/day and the ≥ 10 focused minute rule; manual = 0; commitment ≥ 0.75 only;
  idempotence (second run `[]`); cap holds after a source disappears; source order by time; DST day grouping;
  `levelFor` at 0, 149, 150, 349, 350; `practiceLevel` with parent roll-up.
- **SQL (`supabase/tests/rls/`):** RLS on both tables; users cannot insert/update/delete `xp_events` directly;
  `award_xp` is idempotent, recomputes the cache, rejects invalid events; the `p_user_id` overload is not
  executable by `authenticated`.
- **E2E (`tests/e2e/gamification.spec.ts`):** seed timer history → enable → toast + level line; a timer
  session stop shows the +XP chip; crossing a threshold shows the level-up overlay, Esc closes it; turning off
  hides the level line. The spec restores the profile state in `finally`. All existing suites keep passing.

## 7. Deviations (ADR 0016)
- Opt-in: gamification is off until enabled (requirements show ON by default); enabling runs the backfill.
- Ledger writes through `award_xp` (invoker) with insert/delete-own policies and a definer cache trigger.
- `xp_events.local_date` added for caps and per-day views.
- Commitment XP reuses D2's `commitments()` (final commitments only).
- Quest terminology is stored in E1, shown from E2.

## Out of scope (E2 / F)
Quests (daily, weekly, recovery, main-quest view), achievements, titles, quest terminology UI, AI quest
candidates, sound effects.
