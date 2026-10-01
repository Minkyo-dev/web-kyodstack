/** Weekly SYSTEM analysis helpers (F2 spec §1). Pure: slot math, input building, evidence checks. */
import type { SnapshotRow } from "@/features/analytics/queries/snapshots.queries";
import { STAT_TYPES, type Stats, type StatType } from "@/features/analytics/domain/stats.types";
import { addLocalDays, localDateTimeToIso, toLocalDate } from "@/features/scheduler/utils/timezone";

export type AnalysisExplanation = { stat: StatType; headline: string; detail: string; evidence: string[] };
export type AnalysisAssessment = {
  planningTendency: string | null;
  workStyle: string | null;
  currentRisk: string | null;
  strongPattern: string | null;
};
export type AnalysisContent = { explanations: AnalysisExplanation[]; assessment: AnalysisAssessment };

const pad = (n: number) => String(n).padStart(2, "0");

/** Most recent local instant at weekday/hour at or before now; null when the schedule is off. */
export function analysisSlot(now: Date, tz: string, weekday: number | null, hour: number): Date | null {
  if (weekday === null) return null;
  const today = toLocalDate(now, tz);
  for (let k = 0; k <= 7; k++) {
    const d = addLocalDays(today, -k, tz);
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== weekday) continue;
    const slot = new Date(localDateTimeToIso(d, `${pad(hour)}:00`, tz));
    if (slot.getTime() <= now.getTime()) return slot;
  }
  return null;
}

/** Due when the slot has passed and nothing was generated since it (a manual re-analysis counts). */
export function analysisDue(slot: Date | null, latestCreatedAt: string | null): boolean {
  return !!slot && (!latestCreatedAt || new Date(latestCreatedAt).getTime() < slot.getTime());
}

/** Computed numbers only (no notes, no titles). */
export function analysisInput(input: { stats: Stats; snapshots: SnapshotRow[]; today: string; tz: string }) {
  const { stats, snapshots, today, tz } = input;
  const before = (type: StatType, days: number) => {
    const cutoff = addLocalDays(today, -days, tz);
    const rows = snapshots.filter((r) => r.stat_type === type && r.scope === "overall" && r.computed_on <= cutoff);
    return rows.length ? rows[rows.length - 1].value : null;
  };
  const statBlock = Object.fromEntries(
    STAT_TYPES.map((t) => [
      t,
      { now: stats[t].value, weekAgo: before(t, 7), monthAgo: before(t, 28), samples: stats[t].sampleCount, need: stats[t].need },
    ]),
  );
  return {
    stats: {
      ...statBlock,
      calibration: {
        ...statBlock.calibration,
        bias: stats.calibration.bias,
        typicalError: stats.calibration.typicalError,
        blockerCount: stats.calibration.blockerCount,
        byType: Object.fromEntries(Object.entries(stats.calibration.byType).map(([k, v]) => [k, v?.value ?? null])),
      },
    },
    patterns: stats.patterns,
  };
}

const norm = (s: string) => String(Number(s));

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(norm);
}

/** Every number (and its percent / fraction form) that appears anywhere in the input. */
export function inputNumbers(input: unknown): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => {
    const a = Math.abs(n);
    out.add(norm(String(a)));
    out.add(String(Math.round(a)));
    if (a <= 1) out.add(String(Math.round(a * 100)));
    if (a > 1 && a <= 100) out.add(norm(String(a / 100)));
  };
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) add(v);
    else if (typeof v === "string") for (const n of numbersIn(v)) out.add(n);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(input);
  return out;
}

/** Drop explanations citing numbers not in the input and assessment lines with digits; null if nothing is left. */
export function checkEvidence(content: AnalysisContent, input: unknown): AnalysisContent | null {
  const known = inputNumbers(input);
  const explanations = content.explanations.filter((e) =>
    [e.headline, e.detail, ...e.evidence].every((text) => numbersIn(text).every((n) => known.has(n))),
  );
  const clean = (s: string | null) => (s && !/\d/.test(s) ? s : null);
  const a = content.assessment;
  const assessment: AnalysisAssessment = {
    planningTendency: clean(a.planningTendency),
    workStyle: clean(a.workStyle),
    currentRisk: clean(a.currentRisk),
    strongPattern: clean(a.strongPattern),
  };
  if (explanations.length === 0 && Object.values(assessment).every((v) => v === null)) return null;
  return { explanations, assessment };
}
