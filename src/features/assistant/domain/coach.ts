/**
 * Weekly coaching `coach-v1` (ADR 0040, assistant P2 spec §2). Pure and deterministic: thresholds are named so a
 * change needs `coach-v2`; reason texts are templates (no LLM).
 */
import { z } from "zod";
import { TERMS } from "@/lib/terms";
import { DIAGNOSIS_TEXT } from "@/features/direction/domain/status-text";
import { LAYERS, type Layer } from "@/features/direction/domain/diagnosis";
import { formatWeekdays, isoWeekday } from "@/features/direction/domain/habits";

export const COACH_VERSION = "coach-v1";
export const COACH_WINDOW_DAYS = 28;
const RULE_MIN_SESSIONS = 3;
const RULE_SHARE = 0.6;
const HABIT_MIN_DUE = 8;
const HABIT_RATE = 0.5;
const DAY_RATE = 0.5;
const MAX_PROPOSALS = 3;
export const DISMISS_QUIET_DAYS = 28;

export const PROPOSAL_KINDS = ["rule_minutes", "habit_days", "review"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const RuleMinutesPayload = z.object({
  protocolId: z.uuid(),
  from: z.number().int().positive(),
  to: z.number().int().positive(),
  habits: z.array(z.object({ id: z.uuid(), from: z.number().int().positive(), to: z.number().int().positive() })),
});
export const HabitDaysPayload = z.object({
  habitId: z.uuid(),
  from: z.array(z.number().int().min(1).max(7)).min(1),
  to: z.array(z.number().int().min(1).max(7)).min(1),
});
export const ReviewPayload = z.object({ missionId: z.uuid(), layer: z.enum(LAYERS), href: z.string().startsWith("/scheduler") });
export type RuleMinutes = z.infer<typeof RuleMinutesPayload>;
export type HabitDays = z.infer<typeof HabitDaysPayload>;
export type Review = z.infer<typeof ReviewPayload>;

export type ProposalDraft = {
  kind: ProposalKind;
  targetKey: string;
  title: string;
  reason: string;
  payload: RuleMinutes | HabitDays | Review;
  evidence: Record<string, number | string>;
  focus: boolean;
};

export type CoachInput = {
  /** Local dates [windowStart, windowEnd) — today excluded. */
  windowStart: string;
  windowEnd: string;
  protocols: {
    id: string;
    title: string;
    intendedMinutes: number | null;
    /** Focused minutes of finished timer sessions on tasks linked to it, in the window. */
    sessionMinutes: number[];
    focusHabits: { id: string; targetMinutes: number }[];
  }[];
  habits: { id: string; title: string; weekdays: number[]; createdDate: string; checkedDates: string[] }[];
  signals: { missionId: string; missionTitle: string; layer: Layer; evidence: Record<string, number> }[];
  /** `kind:targetKey` dismissed within the quiet period. */
  quiet: Set<string>;
};

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const round5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);

function* days(from: string, to: string) {
  const [y, m, d] = from.split("-").map(Number);
  for (let t = Date.UTC(y, m - 1, d); ; t += 86_400_000) {
    const s = new Date(t).toISOString().slice(0, 10);
    if (s >= to) return;
    yield s;
  }
}

/** Per ISO weekday: due and done counts over [from, to), only on the habit's weekdays. */
export function weekdayRates(weekdays: number[], from: string, to: string, checked: Set<string>) {
  const out = new Map<number, { due: number; done: number }>();
  for (const day of days(from, to)) {
    const wd = isoWeekday(day);
    if (!weekdays.includes(wd)) continue;
    const r = out.get(wd) ?? { due: 0, done: 0 };
    r.due += 1;
    if (checked.has(day)) r.done += 1;
    out.set(wd, r);
  }
  return out;
}

function ruleMinutes(p: CoachInput["protocols"][number]): ProposalDraft | null {
  const med = median(p.sessionMinutes);
  if (!p.intendedMinutes || p.sessionMinutes.length < RULE_MIN_SESSIONS || med === null || med >= RULE_SHARE * p.intendedMinutes) return null;
  const to = round5(med);
  if (to >= p.intendedMinutes) return null;
  return {
    kind: "rule_minutes",
    targetKey: p.id,
    title: `'${p.title}' ${p.intendedMinutes}분 → ${to}분`.slice(0, 80),
    reason: `최근 ${p.sessionMinutes.length}번의 세션은 보통 ${Math.round(med)}분이었습니다. 규칙을 ${to}분으로 줄이면 시작하기가 쉬워지고, 더 하고 싶은 날은 더 하면 됩니다.`,
    payload: {
      protocolId: p.id,
      from: p.intendedMinutes,
      to,
      habits: p.focusHabits.filter((h) => h.targetMinutes > to).map((h) => ({ id: h.id, from: h.targetMinutes, to })),
    },
    evidence: { sessions: p.sessionMinutes.length, medianMinutes: Math.round(med), intendedMinutes: p.intendedMinutes },
    focus: false,
  };
}

function habitDays(h: CoachInput["habits"][number], input: CoachInput): ProposalDraft | null {
  const from = h.createdDate > input.windowStart ? h.createdDate : input.windowStart;
  const rates = weekdayRates(h.weekdays, from, input.windowEnd, new Set(h.checkedDates));
  let due = 0;
  let done = 0;
  for (const r of rates.values()) {
    due += r.due;
    done += r.done;
  }
  if (due < HABIT_MIN_DUE || done / due >= HABIT_RATE) return null;
  const rated = [...rates.entries()].map(([wd, r]) => ({ wd, rate: r.due ? r.done / r.due : 0 }));
  let keep = rated.filter((r) => r.rate >= DAY_RATE).map((r) => r.wd);
  const fallback = keep.length === 0;
  if (fallback) {
    const best = rated.sort((a, b) => b.rate - a.rate || a.wd - b.wd)[0];
    keep = best ? [best.wd] : [];
  }
  keep.sort((a, b) => a - b);
  if (keep.length === 0 || keep.length >= h.weekdays.length) return null;
  return {
    kind: "habit_days",
    targetKey: h.id,
    title: `'${h.title}' ${formatWeekdays(h.weekdays)} → ${formatWeekdays(keep)}`.slice(0, 80),
    reason: fallback
      ? `최근 4주 ${done}/${due}번 지켜졌습니다. 하루로 줄여 작게 다시 시작하고, 자리가 잡히면 요일을 늘려요.`
      : `최근 4주 ${done}/${due}번 지켜졌습니다. 잘 지켜진 요일만 남겨 성공을 먼저 쌓고, 자리가 잡히면 다시 늘려요.`,
    payload: { habitId: h.id, from: [...h.weekdays].sort((a, b) => a - b), to: keep },
    evidence: { done, due },
    focus: false,
  };
}

function review(s: CoachInput["signals"][number]): ProposalDraft {
  const choice = DIAGNOSIS_TEXT.choice[s.layer];
  return {
    kind: "review",
    targetKey: `${s.missionId}:${s.layer}`,
    title: `'${s.missionTitle}' — ${choice.label}`.slice(0, 80),
    reason: `${DIAGNOSIS_TEXT.question[s.layer]} ${DIAGNOSIS_TEXT.observation(s.layer, s.evidence)}`.slice(0, 300),
    payload: {
      missionId: s.missionId,
      layer: s.layer,
      href: choice.target === "mission" ? `/scheduler/directive?mission=${s.missionId}#mission-detail` : "/scheduler",
    },
    evidence: s.evidence,
    focus: false,
  };
}

/** This week's proposals, best first; the first is the focus ("이번 주 1% 변화"). */
export function coachProposals(input: CoachInput): ProposalDraft[] {
  const concrete = [
    ...input.protocols.map(ruleMinutes),
    ...input.habits.map((h) => habitDays(h, input)),
  ].filter((d): d is ProposalDraft => d !== null);
  // A concrete fix already covers a tactic signal; other layers become reviews, lowest layer first (ADR 0023).
  const reviews = input.signals
    .filter((s) => !(s.layer === "tactic" && concrete.length > 0))
    .sort((a, b) => LAYERS.indexOf(b.layer) - LAYERS.indexOf(a.layer))
    .map(review);
  const all = [...concrete, ...reviews].filter((d) => !input.quiet.has(`${d.kind}:${d.targetKey}`));
  const seen = new Set<string>();
  const unique = all.filter((d) => (seen.has(`${d.kind}:${d.targetKey}`) ? false : (seen.add(`${d.kind}:${d.targetKey}`), true)));
  return unique.slice(0, MAX_PROPOSALS).map((d, i) => ({ ...d, focus: i === 0 }));
}

export const KIND_LABEL: Record<ProposalKind, string> = {
  rule_minutes: `${TERMS.protocol} 시간`,
  habit_days: `${TERMS.habit} 요일`,
  review: "다시 보기",
};
