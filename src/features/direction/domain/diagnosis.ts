/** Layer diagnosis `diagnosis-v1` (G4, ADR 0023). Pure; thresholds are named so a change needs a new version. */
export const DIAGNOSIS_VERSION = "diagnosis-v1";
export const LAYERS = ["goal", "strategy", "tactic", "planning", "execution", "recovery"] as const;
export type Layer = (typeof LAYERS)[number];

export const MIN_SESSIONS = 5;
const PACE_GAP = 0.25;
const MIN_HABIT_DAYS = 5;
const STRATEGY_HABIT_RATE = 0.7;
const TACTIC_HABIT_RATE = 0.5;
const TACTIC_SESSION_SHARE = 0.6;
const MIN_PROTOCOL_SESSIONS = 3;
const MIN_BLOCKS = 5;
const PLANNING_MISS_SHARE = 0.4;
const MIN_LOGS = 5;
const EXECUTION_BLOCKER_SHARE = 0.3;
const RECOVERY_BELOW = 50;

export type DiagnosisInput = {
  missionSessions: number;
  pace: number | null;
  ratioNow: number | null;
  ratioBefore: number | null;
  habit: { done: number; scheduled: number };
  protocolSessions: { medianMinutes: number; intendedMinutes: number; count: number } | null;
  blocks: { total: number; missedOrSkipped: number };
  logs: { total: number; blockers: number };
  recovery: number | null;
};
export type Signal = { layer: Layer; evidence: Record<string, number> };
export type Diagnosis = { collecting: { n: number; need: number } | null; signals: Signal[]; suspected: Layer | null };

const round2 = (x: number) => Math.round(x * 100) / 100;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Signals for one mission; the suspected layer is the lowest firing one (closest to execution). */
export function diagnose(i: DiagnosisInput): Diagnosis {
  if (i.missionSessions < MIN_SESSIONS) {
    return { collecting: { n: i.missionSessions, need: MIN_SESSIONS }, signals: [], suspected: null };
  }
  const signals: Signal[] = [];
  const habitRate = i.habit.scheduled >= MIN_HABIT_DAYS ? i.habit.done / i.habit.scheduled : null;

  if (i.pace !== null && i.pace >= PACE_GAP) signals.push({ layer: "goal", evidence: { paceGap: round2(i.pace) } });

  if (habitRate !== null && habitRate >= STRATEGY_HABIT_RATE && i.ratioNow !== null && i.ratioBefore !== null && i.ratioNow - i.ratioBefore <= 0) {
    signals.push({
      layer: "strategy",
      evidence: { habitRate: round2(habitRate), progressNow: round2(i.ratioNow), progressBefore: round2(i.ratioBefore) },
    });
  }

  const p = i.protocolSessions;
  const shortSessions = !!p && p.count >= MIN_PROTOCOL_SESSIONS && p.medianMinutes < TACTIC_SESSION_SHARE * p.intendedMinutes;
  if (shortSessions) {
    signals.push({ layer: "tactic", evidence: { medianMinutes: Math.round(p!.medianMinutes), intendedMinutes: p!.intendedMinutes } });
  } else if (habitRate !== null && habitRate < TACTIC_HABIT_RATE) {
    signals.push({ layer: "tactic", evidence: { habitRate: round2(habitRate), habitDone: i.habit.done, habitScheduled: i.habit.scheduled } });
  }

  if (i.blocks.total >= MIN_BLOCKS && i.blocks.missedOrSkipped / i.blocks.total >= PLANNING_MISS_SHARE) {
    signals.push({ layer: "planning", evidence: { missedOrSkipped: i.blocks.missedOrSkipped, blocks: i.blocks.total } });
  }

  if (i.logs.total >= MIN_LOGS && i.logs.blockers / i.logs.total >= EXECUTION_BLOCKER_SHARE) {
    signals.push({ layer: "execution", evidence: { blockers: i.logs.blockers, logs: i.logs.total } });
  }

  if (i.recovery !== null && i.recovery < RECOVERY_BELOW) signals.push({ layer: "recovery", evidence: { recovery: Math.round(i.recovery) } });

  const suspected = signals.length ? signals.reduce((a, b) => (LAYERS.indexOf(b.layer) > LAYERS.indexOf(a.layer) ? b : a)).layer : null;
  return { collecting: null, signals, suspected };
}
