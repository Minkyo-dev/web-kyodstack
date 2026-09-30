import { describe, expect, it } from "vitest";
import {
  buildProfile,
  buildTemplateProfiles,
  estimateDuration,
  median,
  percentile,
  toSample,
  type DurationSample,
  type StoredProfile,
} from "@/features/scheduler/utils/estimator";

const settings = { min_block_minutes: 15, max_focus_block_minutes: 120 };
const sample = (actual: number, base = 60, complexity = 3, day = 1): DurationSample => ({
  actualMinutes: actual,
  baseMinutes: base,
  complexity,
  completedAt: `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`,
});

describe("statistics", () => {
  it("median and percentile", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([10, 20, 30, 40], 0.75)).toBe(32.5);
    expect(median([])).toBeNull();
  });
});

describe("toSample (§26.3 eligibility)", () => {
  const base = { userEstimatedMinutes: 60, templateDefaultMinutes: null, complexity: 3, completedAt: "2026-09-01" };
  it("requires positive, plausible actual time", () => {
    expect(toSample({ ...base, actualMinutes: 0 })).toBeNull();
    expect(toSample({ ...base, actualMinutes: 17 * 60 })).toBeNull();
    expect(toSample({ ...base, actualMinutes: 80 })?.baseMinutes).toBe(60);
  });
  it("requires a usable base estimate (the generic fallback does not count)", () => {
    expect(toSample({ ...base, userEstimatedMinutes: null, actualMinutes: 80 })).toBeNull();
    expect(toSample({ ...base, userEstimatedMinutes: null, templateDefaultMinutes: 45, actualMinutes: 80 })?.baseMinutes).toBe(45);
  });
});

describe("buildProfile", () => {
  it("cold start: no factor below 3 samples (§26.4)", () => {
    const p = buildProfile([sample(80), sample(90)]);
    expect(p.sampleCount).toBe(2);
    expect(p.recommendedCorrectionFactor).toBeNull();
    expect(p.medianActualMinutes).toBe(85);
  });

  it("median ratio of recent samples (§26.5)", () => {
    const p = buildProfile([sample(80, 60, 3, 1), sample(80, 60, 3, 2), sample(80, 60, 3, 3)]);
    expect(p.recommendedCorrectionFactor).toBeCloseTo(1.3333, 4);
    expect(p.medianPlanActualRatio).toBeCloseTo(1.3333, 4);
  });

  it("clamps training ratios to [0.5, 3] and the factor to [0.75, 2]", () => {
    const huge = buildProfile([sample(600), sample(600), sample(600)]); // ratio 10 → 3 → factor 2
    expect(huge.recommendedCorrectionFactor).toBe(2);
    const tiny = buildProfile([sample(6), sample(6), sample(6)]); // ratio .1 → .5 → factor .75
    expect(tiny.recommendedCorrectionFactor).toBe(0.75);
  });

  it("uses only the 20 most recent samples", () => {
    const old = Array.from({ length: 20 }, (_, i) => sample(60, 60, 3, i + 1)); // ratio 1, older
    const recent = Array.from({ length: 5 }, () => ({ ...sample(120), completedAt: "2026-10-01T00:00:00Z" }));
    const p = buildProfile([...old, ...recent]);
    expect(p.sampleCount).toBe(20);
    expect(p.recommendedCorrectionFactor).toBe(1); // 15×1.0 + 5×2.0 → median 1.0
  });

  it("EWMA weighs recent samples more", () => {
    const p = buildProfile([sample(60, 60, 3, 1), sample(60, 60, 3, 2), sample(120, 60, 3, 3)]);
    expect(p.ewmaPlanActualRatio).toBeCloseTo(1.3, 4);
  });
});

describe("buildTemplateProfiles", () => {
  it("writes bucket 0 plus each complexity present", () => {
    const m = buildTemplateProfiles([sample(80, 60, 2), sample(80, 60, 4), sample(80, 60, 4)]);
    expect([...m.keys()].sort()).toEqual([0, 2, 4]);
    expect(m.get(0)!.sampleCount).toBe(3);
  });
  it("writes nothing without samples", () => {
    expect(buildTemplateProfiles([]).size).toBe(0);
  });
});

describe("estimateDuration (§26.6 fallback, §69 acceptance)", () => {
  const template = { id: "tpl", default_estimate_minutes: null };
  const prof = (bucket: number, count: number, factor: number | null): StoredProfile => ({
    task_template_id: "tpl",
    complexity_bucket: bucket,
    sample_count: count,
    recommended_correction_factor: factor,
    median_plan_actual_ratio: factor,
  });

  it("acceptance: estimate 60, learned 1.33 → 80-minute block", () => {
    const e = estimateDuration({ user_estimated_minutes: 60, complexity: 3, template }, settings, [prof(0, 3, 1.3333)]);
    expect(e).toMatchObject({ minutes: 80, correctionFactor: 1.3333, sampleCount: 3, scope: "template" });
  });

  it("prefers template+complexity over template when it has enough samples", () => {
    const e = estimateDuration({ user_estimated_minutes: 60, complexity: 4, template }, settings, [
      prof(0, 10, 1.2),
      prof(4, 3, 1.5),
    ]);
    expect(e).toMatchObject({ minutes: 90, scope: "template_complexity" });
  });

  it("ignores profiles below the sample threshold", () => {
    const e = estimateDuration({ user_estimated_minutes: 60, complexity: 3, template }, settings, [prof(0, 2, null)]);
    expect(e).toMatchObject({ minutes: 60, correctionFactor: 1, scope: "none" });
  });

  it("falls back to the base estimate without a template", () => {
    const e = estimateDuration({ user_estimated_minutes: null, complexity: 3, template: null }, settings, []);
    expect(e).toMatchObject({ minutes: 60, baseSource: "generic", scope: "none" });
  });
});
