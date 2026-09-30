/**
 * Personal duration estimator v2 (D1 spec §2). Pure and deterministic: no LLM, no I/O.
 * Groups: type×domain → type → tag (most samples) → none. duration_groups is a rebuildable cache.
 */
import { recommendBlockMinutes, resolveBaseEstimate, type BlockDurationSettings } from "./duration";

export const ESTIMATOR_VERSION = "v2";
export const MIN_SAMPLES = 3;
export const MAX_SAMPLES = 20;
export const RATIO_CLAMP = [0.5, 3.0] as const;
const MIN_ACTUAL_MINUTES = 1;
const MAX_ACTUAL_MINUTES = 16 * 60;
const STEP = 5;

export type GroupSample = { base: number | null; actual: number; completed_at: string };
export type DurationGroup = { group_key: string; samples: GroupSample[]; sample_count: number };
export type EstimatorTask = {
  user_estimated_minutes: number | null;
  task_type: string | null;
  practice_domain_id: string | null;
  template: { default_estimate_minutes: number | null } | null;
  tags: { id: string; name: string }[];
};
export type GroupLabels = { typeLabel: (t: string) => string; domainName: (id: string) => string | null };
export type DurationEstimate = {
  minutes: number;
  baseMinutes: number;
  baseSource: "user" | "template" | "generic";
  range: { low: number; high: number } | null;
  confidence: "high" | "medium" | "low" | "none";
  sampleCount: number;
  scope: "type_domain" | "type" | "tag" | "none";
  reason: string | null;
};

export function median(xs: number[]): number | null {
  return percentile(xs, 0.5);
}

/** Linear-interpolated percentile (p in [0, 1]). */
export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

export function groupKeysFor(task: Pick<EstimatorTask, "task_type" | "practice_domain_id" | "tags">): string[] {
  const keys: string[] = [];
  if (task.task_type) {
    if (task.practice_domain_id) keys.push(`type:${task.task_type}|domain:${task.practice_domain_id}`);
    keys.push(`type:${task.task_type}`);
  }
  for (const t of task.tags) keys.push(`tag:${t.id}`);
  return keys;
}

export function toGroupSample(c: {
  actualMinutes: number;
  userEstimatedMinutes: number | null;
  templateDefaultMinutes: number | null;
  completedAt: string | null;
}): GroupSample | null {
  if (!c.completedAt) return null;
  if (!(c.actualMinutes >= MIN_ACTUAL_MINUTES) || c.actualMinutes > MAX_ACTUAL_MINUTES) return null;
  const base = resolveBaseEstimate({
    userEstimatedMinutes: c.userEstimatedMinutes,
    templateDefaultMinutes: c.templateDefaultMinutes,
  });
  return {
    base: base.source === "generic" ? null : base.minutes,
    actual: Math.round(c.actualMinutes * 100) / 100,
    completed_at: c.completedAt,
  };
}

export function buildGroupSamples(samples: GroupSample[]): GroupSample[] {
  return [...samples].sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, MAX_SAMPLES);
}

/** The quantity each sample contributes for this task: minutes the task would take. */
function values(samples: GroupSample[], taskBase: number | null): number[] {
  if (taskBase !== null) {
    return samples.filter((s) => s.base !== null && s.base > 0).map((s) => taskBase * clamp(s.actual / s.base!, RATIO_CLAMP));
  }
  return samples.map((s) => s.actual);
}

export function estimateDuration(
  task: EstimatorTask,
  settings: BlockDurationSettings,
  groups: DurationGroup[],
  labels: GroupLabels = { typeLabel: (t) => t, domainName: () => null },
): DurationEstimate {
  const base = resolveBaseEstimate({
    userEstimatedMinutes: task.user_estimated_minutes,
    templateDefaultMinutes: task.template?.default_estimate_minutes ?? null,
  });
  const taskBase = base.source === "generic" ? null : base.minutes;
  const byKey = new Map(groups.map((g) => [g.group_key, g]));

  const usable = (key: string) => {
    const g = byKey.get(key);
    const v = g ? values(g.samples, taskBase) : [];
    return v.length >= MIN_SAMPLES ? v : null;
  };

  let chosen: { scope: DurationEstimate["scope"]; v: number[]; reasonHead: string } | null = null;
  if (task.task_type && task.practice_domain_id) {
    const v = usable(`type:${task.task_type}|domain:${task.practice_domain_id}`);
    const dn = labels.domainName(task.practice_domain_id);
    if (v) chosen = { scope: "type_domain", v, reasonHead: `${labels.typeLabel(task.task_type)} · ${dn ?? "영역"} 비슷한 작업` };
  }
  if (!chosen && task.task_type) {
    const v = usable(`type:${task.task_type}`);
    if (v) chosen = { scope: "type", v, reasonHead: `${labels.typeLabel(task.task_type)} 작업` };
  }
  if (!chosen) {
    const best = task.tags
      .map((t) => ({ t, v: usable(`tag:${t.id}`) }))
      .filter((x): x is { t: { id: string; name: string }; v: number[] } => x.v !== null)
      .sort((a, b) => b.v.length - a.v.length)[0];
    if (best) chosen = { scope: "tag", v: best.v, reasonHead: `#${best.t.name} 태그 작업` };
  }

  if (!chosen) {
    return {
      minutes: recommendBlockMinutes(base.minutes, settings),
      baseMinutes: base.minutes,
      baseSource: base.source,
      range: null,
      confidence: "none",
      sampleCount: 0,
      scope: "none",
      reason: null,
    };
  }

  const med = median(chosen.v)!;
  const p25 = percentile(chosen.v, 0.25)!;
  const p75 = percentile(chosen.v, 0.75)!;
  const spread = med > 0 ? (p75 - p25) / med : Infinity;
  const n = chosen.v.length;
  const confidence: DurationEstimate["confidence"] =
    n >= 5 && spread <= 0.25 ? "high" : n >= 3 && spread <= 0.5 ? "medium" : "low";

  const dropBase = confidence === "low" && taskBase !== null ? taskBase : med;
  return {
    minutes: recommendBlockMinutes(dropBase, settings),
    baseMinutes: base.minutes,
    baseSource: base.source,
    range: { low: Math.floor(p25 / STEP) * STEP, high: Math.ceil(p75 / STEP) * STEP },
    confidence,
    sampleCount: n,
    scope: chosen.scope,
    reason: `${chosen.reasonHead} ${n}개`,
  };
}
