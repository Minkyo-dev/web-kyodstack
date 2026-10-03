/**
 * Learning log `learn-v1` (ADR 0044). Pure: an applied coaching proposal compared 28 days before its decision day
 * with up to 28 days after it. Dates are local yyyy-MM-dd strings; today is excluded.
 */
import { HabitDaysPayload, RuleMinutesPayload, weekdayRates } from "./coach";
import { TimeSlotPayload } from "./slot";

export const LEARN_VERSION = "learn-v1";
export const LEARN_KINDS = ["rule_minutes", "habit_days", "time_slot"] as const;
export const LEARN_WINDOW_DAYS = 28;
export const LEARN_LOOKBACK_DAYS = 180;
export const LEARN_MAX = 12;
const WATCH_DAYS = 14;
const MIN_DUE = 4;
const RATE_STEP = 0.15;
const WEEKLY_UP = 1.25;
const WEEKLY_MIN_GAIN = 0.5;
const WEEKLY_DOWN = 0.75;

export type Verdict = "better" | "same" | "worse";
export type Outcome =
  | { state: "watching"; daysLeft: number }
  | { state: "thin" }
  | { state: "result"; measure: "rate" | "weekly"; before: number; after: number; verdict: Verdict };

export type LearnEntry = { id: string; kind: string; title: string; decidedDate: string; payload: unknown };
export type LearnData = {
  habits: Map<string, { createdDate: string; checkedDates: Set<string> }>;
  /** Local start dates of finished timer sessions per protocol. */
  sessionDates: Map<string, string[]>;
};

const dayNumber = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
export const shiftDate = (d: string, days: number) => new Date((dayNumber(d) + days) * 86_400_000).toISOString().slice(0, 10);

function rate(weekdays: number[], from: string, to: string, checked: Set<string>) {
  let due = 0;
  let done = 0;
  for (const r of weekdayRates(weekdays, from, to, checked).values()) {
    due += r.due;
    done += r.done;
  }
  return { due, done };
}

function rateVerdict(before: number, after: number): Verdict {
  if (after - before >= RATE_STEP) return "better";
  if (after - before <= -RATE_STEP) return "worse";
  return "same";
}

function weeklyVerdict(before: number, after: number): Verdict {
  if (before === 0) return after > 0 ? "better" : "same";
  if (after >= before * WEEKLY_UP && after - before >= WEEKLY_MIN_GAIN) return "better";
  if (after <= before * WEEKLY_DOWN) return "worse";
  return "same";
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function learningOutcome(e: LearnEntry, data: LearnData, today: string): Outcome {
  const d = e.decidedDate;
  const afterEnd = [shiftDate(d, LEARN_WINDOW_DAYS), today].sort()[0];
  const afterDays = dayNumber(afterEnd) - dayNumber(d);
  if (afterDays < WATCH_DAYS) return { state: "watching", daysLeft: WATCH_DAYS - Math.max(afterDays, 0) };
  const beforeStart = shiftDate(d, -LEARN_WINDOW_DAYS);

  if (e.kind === "habit_days") {
    const p = HabitDaysPayload.safeParse(e.payload);
    const h = p.success ? data.habits.get(p.data.habitId) : undefined;
    if (!p.success || !h) return { state: "thin" };
    const from = h.createdDate > beforeStart ? h.createdDate : beforeStart;
    const before = rate(p.data.from, from, d, h.checkedDates);
    const after = rate(p.data.to, d, afterEnd, h.checkedDates);
    if (before.due < MIN_DUE || after.due < MIN_DUE) return { state: "thin" };
    const b = before.done / before.due;
    const a = after.done / after.due;
    return { state: "result", measure: "rate", before: b, after: a, verdict: rateVerdict(b, a) };
  }

  const p = e.kind === "rule_minutes" ? RuleMinutesPayload.safeParse(e.payload) : TimeSlotPayload.safeParse(e.payload);
  if (!p.success) return { state: "thin" };
  const dates = data.sessionDates.get(p.data.protocolId) ?? [];
  const before = (dates.filter((x) => x >= beforeStart && x < d).length / LEARN_WINDOW_DAYS) * 7;
  const after = (dates.filter((x) => x >= d && x < afterEnd).length / afterDays) * 7;
  return { state: "result", measure: "weekly", before: round1(before), after: round1(after), verdict: weeklyVerdict(before, after) };
}

export const VERDICT_TEXT: Record<Verdict, string> = { better: "좋아짐", same: "비슷함", worse: "줄어듦" };

/** "지킴 45% → 82% · 좋아짐" style; one line, words not colors. */
export function outcomeText(o: Outcome): string {
  if (o.state === "watching") return `지켜보는 중 · ${o.daysLeft}일 뒤 결과`;
  if (o.state === "thin") return "기록 부족";
  const pair =
    o.measure === "rate"
      ? `지킴 ${Math.round(o.before * 100)}% → ${Math.round(o.after * 100)}%`
      : `주당 세션 ${o.before.toFixed(1)} → ${o.after.toFixed(1)}회`;
  return `${pair} · ${VERDICT_TEXT[o.verdict]}`;
}
