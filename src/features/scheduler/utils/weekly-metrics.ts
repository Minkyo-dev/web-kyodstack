/**
 * Weekly metrics (spec §36, §37, §59, §60). Deterministic and pure: the LLM receives
 * this object and never computes statistics itself (spec §3.5).
 *
 * Definitions are versioned (METRICS_VERSION). docs/schema.md documents them.
 * Change a formula only together with the version.
 */
import { toLocalDate } from "./timezone";

export const METRICS_VERSION = "v1";
const DEEP_WORK_MIN_SESSION = 50; // minutes
const FOCUS_WINDOW_HOURS = 3;
const FOCUS_WINDOW_MIN_MINUTES = 60;
const UNDER_RATIO = 1.2;
const OVER_RATIO = 0.8;

export type WeekInput = {
  range: { start: string; end: string };
  timezone: string;
  weekStart: string;
  blocks: { starts_at: string; ends_at: string; status: string }[];
  sessions: {
    started_at: string;
    ended_at: string | null;
    focus_score: number | null;
    mood_score: number | null;
    energy_score: number | null;
    templateName: string | null;
  }[];
  reflections: { mood_score: number | null; focus_score: number | null; energy_score: number | null }[];
  /** Tasks completed inside the week, with their plan-vs-actual totals. */
  completedTasks: { templateName: string | null; baseMinutes: number | null; actualMinutes: number }[];
  createdTaskCount: number;
  revisions: {
    change_type: string;
    previous_starts_at: string | null;
    new_starts_at: string | null;
  }[];
};

export type WeeklyMetrics = {
  version: string;
  weekStart: string;
  timezone: string;
  plannedMinutes: number;
  skippedMinutes: number;
  actualMinutes: number;
  /** actual / planned (spec §36); null when nothing was planned. */
  planCompletionRatio: number | null;
  completedTaskCount: number;
  createdTaskCount: number;
  skippedBlockCount: number;
  rescheduleCount: number;
  moveCount: number;
  resizeCount: number;
  minutesShifted: number;
  daysShifted: number;
  averageFocus: number | null;
  averageMood: number | null;
  averageEnergy: number | null;
  deepWorkMinutes: number;
  dailyActualMinutes: { date: string; minutes: number }[];
  topTaskTypes: { name: string; actualMinutes: number }[];
  underestimatedTaskTypes: { name: string; ratio: number; samples: number }[];
  overestimatedTaskTypes: { name: string; ratio: number; samples: number }[];
  bestFocusWindow: FocusWindow | null;
  worstFocusWindow: FocusWindow | null;
};

type FocusWindow = { start: string; end: string; averageFocus: number; minutes: number };

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

function clip(start: string, end: string, from: number, to: number) {
  const s = Math.max(new Date(start).getTime(), from);
  const e = Math.min(new Date(end).getTime(), to);
  return e > s ? (e - s) / 60_000 : 0;
}

function localHour(instant: string, zone: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(
    new Date(instant),
  );
  return Number(h);
}

export function computeWeeklyMetrics(input: WeekInput): WeeklyMetrics {
  const from = new Date(input.range.start).getTime();
  const to = new Date(input.range.end).getTime();
  const tz = input.timezone;

  let plannedMinutes = 0;
  let skippedMinutes = 0;
  let skippedBlockCount = 0;
  for (const b of input.blocks) {
    if (b.status === "cancelled") continue;
    const m = clip(b.starts_at, b.ends_at, from, to);
    plannedMinutes += m;
    if (b.status === "skipped") {
      skippedMinutes += m;
      if (m > 0) skippedBlockCount += 1;
    }
  }

  let actualMinutes = 0;
  let deepWorkMinutes = 0;
  const daily = new Map<string, number>();
  const byType = new Map<string, number>();
  const focus: number[] = [];
  const mood: number[] = [];
  const energy: number[] = [];
  const windows = new Map<number, { weighted: number; minutes: number }>();

  for (const s of input.sessions) {
    if (!s.ended_at) continue; // running sessions never enter finalized metrics (§60)
    const m = clip(s.started_at, s.ended_at, from, to);
    if (m <= 0) continue;
    actualMinutes += m;
    if (m >= DEEP_WORK_MIN_SESSION) deepWorkMinutes += m;
    const day = toLocalDate(s.started_at, tz);
    daily.set(day, (daily.get(day) ?? 0) + m);
    if (s.templateName) byType.set(s.templateName, (byType.get(s.templateName) ?? 0) + m);
    if (s.focus_score !== null) {
      focus.push(s.focus_score);
      const w = Math.floor(localHour(s.started_at, tz) / FOCUS_WINDOW_HOURS);
      const cur = windows.get(w) ?? { weighted: 0, minutes: 0 };
      windows.set(w, { weighted: cur.weighted + s.focus_score * m, minutes: cur.minutes + m });
    }
    if (s.mood_score !== null) mood.push(s.mood_score);
    if (s.energy_score !== null) energy.push(s.energy_score);
  }
  // Daily reflections count as ratings too (v1: plain mean over all ratings).
  for (const r of input.reflections) {
    if (r.focus_score !== null) focus.push(r.focus_score);
    if (r.mood_score !== null) mood.push(r.mood_score);
    if (r.energy_score !== null) energy.push(r.energy_score);
  }

  const qualified = [...windows.entries()]
    .filter(([, v]) => v.minutes >= FOCUS_WINDOW_MIN_MINUTES)
    .map(([w, v]) => ({
      start: `${String(w * FOCUS_WINDOW_HOURS).padStart(2, "0")}:00`,
      end: `${String((w + 1) * FOCUS_WINDOW_HOURS).padStart(2, "0")}:00`,
      averageFocus: r1(v.weighted / v.minutes),
      minutes: Math.round(v.minutes),
    }))
    .sort((a, b) => b.averageFocus - a.averageFocus || b.minutes - a.minutes);

  const perType = new Map<string, { actual: number; base: number; n: number }>();
  for (const t of input.completedTasks) {
    if (!t.templateName || !t.baseMinutes || t.actualMinutes <= 0) continue;
    const cur = perType.get(t.templateName) ?? { actual: 0, base: 0, n: 0 };
    perType.set(t.templateName, { actual: cur.actual + t.actualMinutes, base: cur.base + t.baseMinutes, n: cur.n + 1 });
  }
  const ratios = [...perType.entries()].map(([name, v]) => ({ name, ratio: r2(v.actual / v.base), samples: v.n }));

  let moveCount = 0;
  let resizeCount = 0;
  let minutesShifted = 0;
  let daysShifted = 0;
  for (const rv of input.revisions) {
    if (rv.change_type === "moved") moveCount += 1;
    else if (rv.change_type === "resized") resizeCount += 1;
    else continue;
    if (rv.previous_starts_at && rv.new_starts_at) {
      minutesShifted += Math.abs(
        (new Date(rv.new_starts_at).getTime() - new Date(rv.previous_starts_at).getTime()) / 60_000,
      );
      if (toLocalDate(rv.previous_starts_at, tz) !== toLocalDate(rv.new_starts_at, tz)) daysShifted += 1;
    }
  }

  return {
    version: METRICS_VERSION,
    weekStart: input.weekStart,
    timezone: tz,
    plannedMinutes: Math.round(plannedMinutes),
    skippedMinutes: Math.round(skippedMinutes),
    actualMinutes: Math.round(actualMinutes),
    planCompletionRatio: plannedMinutes > 0 ? r2(actualMinutes / plannedMinutes) : null,
    completedTaskCount: input.completedTasks.length,
    createdTaskCount: input.createdTaskCount,
    skippedBlockCount,
    rescheduleCount: moveCount + resizeCount,
    moveCount,
    resizeCount,
    minutesShifted: Math.round(minutesShifted),
    daysShifted,
    averageFocus: mean(focus),
    averageMood: mean(mood),
    averageEnergy: mean(energy),
    deepWorkMinutes: Math.round(deepWorkMinutes),
    dailyActualMinutes: [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) })),
    topTaskTypes: [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, m]) => ({ name, actualMinutes: Math.round(m) })),
    underestimatedTaskTypes: ratios.filter((x) => x.ratio >= UNDER_RATIO).sort((a, b) => b.ratio - a.ratio),
    overestimatedTaskTypes: ratios.filter((x) => x.ratio <= OVER_RATIO).sort((a, b) => a.ratio - b.ratio),
    bestFocusWindow: qualified[0] ?? null,
    worstFocusWindow: qualified.length >= 2 ? qualified[qualified.length - 1] : null,
  };
}
