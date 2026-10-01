/** Deterministic direction status (G3, ADR 0022). Pure; dates are local yyyy-MM-dd strings. */
import { isoWeekday } from "./habits";
import { STATUS_TEXT } from "./status-text";

export const MISSION_PROGRESS_VERSION = "mission-progress-v1";
export const ALIGNMENT_VERSION = "alignment-v1";
export const IDENTITY_EVIDENCE_VERSION = "identity-evidence-v1";

export type CriterionInput = {
  kind: "check" | "numeric";
  met_at: string | null;
  current_value: number | null;
  target_value: number | null;
};
export type MissionProgress = {
  kind: "criteria" | "projects" | "time";
  ratio: number | null;
  basis: { done: number; total: number } | null;
  focusMinutes: number;
};

/** Criteria first, then the mission projects' task ratio, else time only (no bar). */
export function missionProgress(i: {
  criteria: CriterionInput[];
  projectTasks: { status: string }[];
  focusMinutes: number;
}): MissionProgress {
  if (i.criteria.length > 0) {
    const score = (c: CriterionInput) =>
      c.kind === "check" ? (c.met_at ? 1 : 0) : Math.min(Number(c.current_value ?? 0) / Number(c.target_value), 1);
    const scores = i.criteria.map(score);
    const sum = scores.reduce((s, x) => s + x, 0);
    const done = scores.filter((x) => x >= 1).length;
    return { kind: "criteria", ratio: sum / i.criteria.length, basis: { done, total: i.criteria.length }, focusMinutes: i.focusMinutes };
  }
  const live = i.projectTasks.filter((t) => t.status !== "cancelled");
  if (live.length > 0) {
    const done = live.filter((t) => t.status === "completed").length;
    return { kind: "projects", ratio: done / live.length, basis: { done, total: live.length }, focusMinutes: i.focusMinutes };
  }
  return { kind: "time", ratio: null, basis: null, focusMinutes: i.focusMinutes };
}

const dayNumber = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;

export function nextDate(d: string): string {
  const t = new Date((dayNumber(d) + 1) * 86_400_000);
  return t.toISOString().slice(0, 10); // pure calendar math on a UTC midnight, not an instant
}

/** Elapsed share of [created, deadline] minus progress; null without a deadline or a ratio. */
export function paceGap(i: { createdDate: string; deadline: string | null; today: string; ratio: number | null }): number | null {
  if (!i.deadline || i.ratio === null) return null;
  const span = dayNumber(i.deadline) - dayNumber(i.createdDate);
  const elapsed = span <= 0 ? 1 : Math.min(Math.max((dayNumber(i.today) - dayNumber(i.createdDate)) / span, 0), 1);
  return elapsed - i.ratio;
}

export type AlignedSession = { focusedMinutes: number; missionId: string | null; protocolId: string | null; pathActive: boolean | null };

/** Active vs mission-aligned focused minutes; aligned time on a retired path's protocol is off-path. */
export function alignment(sessions: AlignedSession[]) {
  let activeMinutes = 0;
  let alignedMinutes = 0;
  let onPathMinutes = 0;
  for (const s of sessions) {
    activeMinutes += s.focusedMinutes;
    if (!s.missionId) continue;
    alignedMinutes += s.focusedMinutes;
    if (!s.protocolId || s.pathActive) onPathMinutes += s.focusedMinutes;
  }
  return { activeMinutes, alignedMinutes, onPathMinutes, offPathMinutes: alignedMinutes - onPathMinutes };
}

export type HabitInput = { id: string; weekdays: number[]; createdDate: string; missionId: string | null };

/** Local dates in [from, to] on which the habit was scheduled (not before its creation day). */
export function scheduledDays(h: HabitInput, from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from > h.createdDate ? from : h.createdDate; d <= to; d = nextDate(d)) {
    if (h.weekdays.includes(isoWeekday(d))) out.push(d);
  }
  return out;
}

export function habitConsistency(habits: HabitInput[], checks: { habitId: string; date: string }[], from: string, to: string) {
  let done = 0;
  let scheduled = 0;
  for (const h of habits) {
    const days = new Set(scheduledDays(h, from, to));
    scheduled += days.size;
    done += checks.filter((c) => c.habitId === h.id && days.has(c.date)).length;
  }
  return { done, scheduled };
}

const EVIDENCE_MIN_RATE = 0.6;
const EVIDENCE_MIN_DAYS = 5;

/** Numbers always; a positive sentence only with enough scheduled days and ≥ 60% done. */
export function identityEvidence(i: { name: string; sessions: number; done: number; scheduled: number }) {
  const strong = i.scheduled >= EVIDENCE_MIN_DAYS && i.done / i.scheduled >= EVIDENCE_MIN_RATE;
  return { sessions: i.sessions, done: i.done, scheduled: i.scheduled, sentence: strong ? STATUS_TEXT.identity(i.name) : null };
}
