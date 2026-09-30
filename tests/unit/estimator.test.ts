import { describe, expect, it } from "vitest";
import {
  buildGroupSamples,
  estimateDuration,
  groupKeysFor,
  median,
  percentile,
  toGroupSample,
  type DurationGroup,
  type GroupSample,
} from "@/features/scheduler/utils/estimator";

const settings = { min_block_minutes: 15, max_focus_block_minutes: 240 };
const s = (actual: number, base: number | null = null, i = 0): GroupSample => ({
  base,
  actual,
  completed_at: `2026-09-${String(10 + i).padStart(2, "0")}T12:00:00Z`,
});
const group = (key: string, samples: GroupSample[]): DurationGroup => ({ group_key: key, samples, sample_count: samples.length });
const task = (over: Partial<Parameters<typeof estimateDuration>[0]> = {}) => ({
  user_estimated_minutes: null,
  task_type: "coding",
  practice_domain_id: "d1",
  template: null,
  tags: [],
  ...over,
});
const labels = { typeLabel: (t: string) => (t === "coding" ? "코딩" : t), domainName: (id: string) => (id === "d1" ? "Data Eng" : null) };

describe("statistics", () => {
  it("median and percentile", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(percentile([10, 20, 30, 40], 0.25)).toBe(17.5);
  });
});

describe("groupKeysFor", () => {
  it("type×domain, type, then each tag", () => {
    expect(groupKeysFor({ task_type: "coding", practice_domain_id: "d1", tags: [{ id: "t1", name: "x" }] })).toEqual([
      "type:coding|domain:d1",
      "type:coding",
      "tag:t1",
    ]);
    expect(groupKeysFor({ task_type: null, practice_domain_id: "d1", tags: [] })).toEqual([]);
  });
});

describe("toGroupSample / buildGroupSamples", () => {
  it("keeps plausible actuals; base from user or template (generic is null)", () => {
    expect(toGroupSample({ actualMinutes: 50, userEstimatedMinutes: 60, templateDefaultMinutes: null, completedAt: "2026-09-01T00:00:00Z" }))
      .toEqual({ base: 60, actual: 50, completed_at: "2026-09-01T00:00:00Z" });
    expect(toGroupSample({ actualMinutes: 50, userEstimatedMinutes: null, templateDefaultMinutes: null, completedAt: "2026-09-01T00:00:00Z" })!.base)
      .toBeNull();
    expect(toGroupSample({ actualMinutes: 0, userEstimatedMinutes: 60, templateDefaultMinutes: null, completedAt: "2026-09-01T00:00:00Z" })).toBeNull();
    expect(toGroupSample({ actualMinutes: 17 * 60, userEstimatedMinutes: 60, templateDefaultMinutes: null, completedAt: "2026-09-01T00:00:00Z" })).toBeNull();
  });
  it("keeps the 20 most recent, newest first", () => {
    const many = Array.from({ length: 25 }, (_, i) => s(30 + i, null, i % 20));
    const kept = buildGroupSamples(many);
    expect(kept.length).toBe(20);
    expect(kept[0].completed_at >= kept[19].completed_at).toBe(true);
  });
});

describe("estimateDuration v2", () => {
  it("requirements §46: 59,62,61,58,60 → 60, high", () => {
    const g = group("type:coding|domain:d1", [59, 62, 61, 58, 60].map((a, i) => s(a, null, i)));
    const e = estimateDuration(task(), settings, [g], labels);
    expect(e).toMatchObject({ minutes: 60, confidence: "high", scope: "type_domain", sampleCount: 5 });
    expect(e.reason).toBe("코딩 · Data Eng 비슷한 작업 5개");
  });
  it("requirements §46: 30,95,42,120,55 → low, range 40–95", () => {
    const g = group("type:coding|domain:d1", [30, 95, 42, 120, 55].map((a, i) => s(a, null, i)));
    const e = estimateDuration(task(), settings, [g], labels);
    expect(e.confidence).toBe("low");
    expect(e.range).toEqual({ low: 40, high: 95 });
    expect(e.minutes).toBe(55); // no estimate → median
  });
  it("low confidence with a user estimate drops at the estimate", () => {
    const g = group("type:coding|domain:d1", [30, 95, 42, 120, 55].map((a, i) => s(a, 60, i)));
    expect(estimateDuration(task({ user_estimated_minutes: 60 }), settings, [g], labels).minutes).toBe(60);
  });
  it("with an estimate: estimate × median(actual/base), ratios clamped [0.5, 3]", () => {
    const g = group("type:coding|domain:d1", [s(80, 60, 0), s(80, 60, 1), s(80, 60, 2)]);
    const e = estimateDuration(task({ user_estimated_minutes: 60 }), settings, [g], labels);
    expect(e.minutes).toBe(80);
    expect(e.confidence).toBe("medium");
  });
  it("falls back: type×domain < 3 → type", () => {
    const groups = [
      group("type:coding|domain:d1", [s(50, null, 0)]),
      group("type:coding", [s(40, null, 0), s(40, null, 1), s(40, null, 2)]),
    ];
    const e = estimateDuration(task(), settings, groups, labels);
    expect(e).toMatchObject({ scope: "type", minutes: 40, reason: "코딩 작업 3개" });
  });
  it("tag fallback when there is no type (template-name tags keep learning)", () => {
    const t = task({ task_type: null, practice_domain_id: null, user_estimated_minutes: 60, tags: [{ id: "t1", name: "Technical Blog" }] });
    const g = group("tag:t1", [s(80, 60, 0), s(80, 60, 1), s(80, 60, 2)]);
    const e = estimateDuration(t, settings, [g], labels);
    expect(e).toMatchObject({ scope: "tag", minutes: 80, reason: "#Technical Blog 태그 작업 3개" });
  });
  it("picks the tag with the most samples", () => {
    const t = task({ task_type: null, practice_domain_id: null, tags: [{ id: "a", name: "A" }, { id: "b", name: "B" }] });
    const groups = [
      group("tag:a", [s(30, null, 0), s(30, null, 1), s(30, null, 2)]),
      group("tag:b", [s(90, null, 0), s(90, null, 1), s(90, null, 2), s(90, null, 3)]),
    ];
    expect(estimateDuration(t, settings, groups, labels).minutes).toBe(90);
  });
  it("none: base estimate only, rounded and clamped", () => {
    const e = estimateDuration(task({ user_estimated_minutes: 7 }), settings, [], labels);
    expect(e).toMatchObject({ scope: "none", confidence: "none", minutes: 15, range: null, reason: null });
  });
  it("samples without base don't count for a task that has an estimate", () => {
    const g = group("type:coding|domain:d1", [s(80, null, 0), s(80, null, 1), s(80, null, 2)]);
    expect(estimateDuration(task({ user_estimated_minutes: 60 }), settings, [g], labels).scope).toBe("none");
  });
});
