/**
 * Personal duration estimator (spec §26). Pure and deterministic: no LLM, no I/O.
 * The service layer loads samples and persists the result into
 * task_duration_profiles, which stays a rebuildable cache.
 */
import { recommendBlockMinutes, resolveBaseEstimate, type BlockDurationSettings } from "./duration";

export const ESTIMATOR_VERSION = "v1";
export const MIN_SAMPLES = 3; // §26.4 cold start
export const MAX_SAMPLES = 20; // §26.5 most recent 10–20
export const RATIO_CLAMP = [0.5, 3.0] as const; // §26.3 training clamp
export const FACTOR_CLAMP = [0.75, 2.0] as const; // §26.5 final clamp
export const EWMA_ALPHA = 0.3;
const MIN_ACTUAL_MINUTES = 1;
const MAX_ACTUAL_MINUTES = 16 * 60;

export type DurationSample = {
  actualMinutes: number;
  baseMinutes: number;
  complexity: number;
  completedAt: string;
};

/** Raw candidate row (a completed task joined with its plan-vs-actual totals). */
export type SampleCandidate = {
  actualMinutes: number;
  userEstimatedMinutes: number | null;
  templateDefaultMinutes: number | null;
  complexity: number;
  completedAt: string | null;
};

/**
 * §26.3 eligibility: completed with a template (the caller filters those), actual > 0
 * and plausible, and a usable base estimate (user or template; the generic 60 is not).
 */
export function toSample(c: SampleCandidate): DurationSample | null {
  if (!c.completedAt) return null;
  if (!(c.actualMinutes >= MIN_ACTUAL_MINUTES) || c.actualMinutes > MAX_ACTUAL_MINUTES) return null;
  const base = resolveBaseEstimate({
    userEstimatedMinutes: c.userEstimatedMinutes,
    templateDefaultMinutes: c.templateDefaultMinutes,
  });
  if (base.source === "generic") return null;
  return {
    actualMinutes: c.actualMinutes,
    baseMinutes: base.minutes,
    complexity: c.complexity,
    completedAt: c.completedAt,
  };
}

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

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

export type ComputedProfile = {
  sampleCount: number;
  medianActualMinutes: number | null;
  p75ActualMinutes: number | null;
  medianPlanActualRatio: number | null;
  ewmaPlanActualRatio: number | null;
  /** null below MIN_SAMPLES. Never create false confidence (§26.4). */
  recommendedCorrectionFactor: number | null;
};

const round = (x: number | null, digits: number) =>
  x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits;

/** §26.5: correction = clamp(median(clamped ratios of the most recent ≤20 samples)). */
export function buildProfile(samples: DurationSample[]): ComputedProfile {
  const recent = [...samples]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, MAX_SAMPLES);
  const ratios = recent.map((s) => clamp(s.actualMinutes / s.baseMinutes, RATIO_CLAMP));
  const actuals = recent.map((s) => s.actualMinutes);

  // EWMA over chronological order, so the newest sample weighs most.
  let ewma: number | null = null;
  for (const r of [...ratios].reverse()) ewma = ewma === null ? r : EWMA_ALPHA * r + (1 - EWMA_ALPHA) * ewma;

  const medianRatio = median(ratios);
  return {
    sampleCount: recent.length,
    medianActualMinutes: round(median(actuals), 2),
    p75ActualMinutes: round(percentile(actuals, 0.75), 2),
    medianPlanActualRatio: round(medianRatio, 4),
    ewmaPlanActualRatio: round(ewma, 4),
    recommendedCorrectionFactor:
      recent.length >= MIN_SAMPLES && medianRatio !== null ? round(clamp(medianRatio, FACTOR_CLAMP), 4) : null,
  };
}

/** Profile rows to write for one template: bucket 0 (all) + each complexity with samples. */
export function buildTemplateProfiles(samples: DurationSample[]): Map<number, ComputedProfile> {
  const out = new Map<number, ComputedProfile>();
  if (samples.length === 0) return out;
  out.set(0, buildProfile(samples));
  for (const c of [1, 2, 3, 4, 5]) {
    const bucket = samples.filter((s) => s.complexity === c);
    if (bucket.length > 0) out.set(c, buildProfile(bucket));
  }
  return out;
}

export type StoredProfile = {
  task_template_id: string;
  complexity_bucket: number;
  sample_count: number;
  recommended_correction_factor: number | null;
  median_plan_actual_ratio: number | null;
};

export type DurationEstimate = {
  minutes: number;
  baseMinutes: number;
  baseSource: "user" | "template" | "generic";
  correctionFactor: number;
  sampleCount: number;
  /** Which profile drove the factor (§26.6 fallback order). */
  scope: "template_complexity" | "template" | "none";
};

/**
 * §26.6 fallback: template+complexity profile → template profile → base estimate
 * (user → template default → generic). Shared by the server (block creation) and the
 * client (drag preview, explanation), so both always agree.
 */
export function estimateDuration(
  task: {
    user_estimated_minutes: number | null;
    complexity: number;
    template: { id: string; default_estimate_minutes: number | null } | null;
  },
  settings: BlockDurationSettings,
  profiles: StoredProfile[],
): DurationEstimate {
  const base = resolveBaseEstimate({
    userEstimatedMinutes: task.user_estimated_minutes,
    templateDefaultMinutes: task.template?.default_estimate_minutes ?? null,
  });

  const usable = (p: StoredProfile | undefined) =>
    p && p.sample_count >= MIN_SAMPLES && p.recommended_correction_factor !== null ? p : undefined;
  const mine = task.template ? profiles.filter((p) => p.task_template_id === task.template!.id) : [];
  const byComplexity = usable(mine.find((p) => p.complexity_bucket === task.complexity));
  const overall = usable(mine.find((p) => p.complexity_bucket === 0));
  const chosen = byComplexity ?? overall;

  const correctionFactor = chosen ? Number(chosen.recommended_correction_factor) : 1;
  return {
    minutes: recommendBlockMinutes(base.minutes, settings, correctionFactor),
    baseMinutes: base.minutes,
    baseSource: base.source,
    correctionFactor,
    sampleCount: chosen?.sample_count ?? 0,
    scope: byComplexity ? "template_complexity" : overall ? "template" : "none",
  };
}
