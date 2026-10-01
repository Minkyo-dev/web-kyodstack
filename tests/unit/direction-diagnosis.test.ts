import { describe, expect, it } from "vitest";
import { diagnose, median, type DiagnosisInput } from "@/features/direction/domain/diagnosis";
import { DENY_LIST, DIAGNOSIS_TEXT } from "@/features/direction/domain/status-text";

const base: DiagnosisInput = {
  missionSessions: 10,
  pace: null,
  ratioNow: null,
  ratioBefore: null,
  habit: { done: 0, scheduled: 0 },
  protocolSessions: null,
  blocks: { total: 0, missedOrSkipped: 0 },
  logs: { total: 0, blockers: 0 },
  recovery: null,
};

describe("diagnose", () => {
  it("names the tactic when sessions run far shorter than the protocol intends (requirements §25)", () => {
    const d = diagnose({ ...base, protocolSessions: { medianMinutes: 22, intendedMinutes: 60, count: 6 } });
    expect(d.suspected).toBe("tactic");
    expect(d.signals).toEqual([{ layer: "tactic", evidence: { medianMinutes: 22, intendedMinutes: 60 } }]);
  });

  it("suspects the lowest firing layer", () => {
    const d = diagnose({
      ...base,
      pace: 0.4,
      blocks: { total: 10, missedOrSkipped: 5 },
      protocolSessions: { medianMinutes: 20, intendedMinutes: 60, count: 4 },
    });
    expect(d.signals.map((s) => s.layer)).toEqual(["goal", "tactic", "planning"]);
    expect(d.suspected).toBe("planning");
  });

  it("collects data below 5 mission sessions", () => {
    expect(diagnose({ ...base, missionSessions: 3, pace: 0.9 })).toEqual({ collecting: { n: 3, need: 5 }, signals: [], suspected: null });
  });

  it("strategy needs good habits but flat progress, with a ratio", () => {
    const habit = { done: 8, scheduled: 10 };
    expect(diagnose({ ...base, habit, ratioNow: 0.3, ratioBefore: 0.3 }).suspected).toBe("strategy");
    expect(diagnose({ ...base, habit, ratioNow: 0.5, ratioBefore: 0.3 }).suspected).toBeNull();
    expect(diagnose({ ...base, habit, ratioNow: null, ratioBefore: null }).suspected).toBeNull();
  });

  it("low habit completion is a tactic signal; few scheduled days are ignored", () => {
    expect(diagnose({ ...base, habit: { done: 2, scheduled: 10 } }).suspected).toBe("tactic");
    expect(diagnose({ ...base, habit: { done: 0, scheduled: 4 } }).suspected).toBeNull();
  });

  it("planning and execution need minimum counts; recovery below 50", () => {
    expect(diagnose({ ...base, blocks: { total: 4, missedOrSkipped: 4 } }).suspected).toBeNull();
    expect(diagnose({ ...base, logs: { total: 5, blockers: 2 } }).suspected).toBe("execution");
    expect(diagnose({ ...base, logs: { total: 4, blockers: 4 } }).suspected).toBeNull();
    expect(diagnose({ ...base, recovery: 40 }).suspected).toBe("recovery");
    expect(diagnose({ ...base, recovery: 50 }).suspected).toBeNull();
  });
});

describe("median", () => {
  it("handles odd, even and empty", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("diagnosis texts", () => {
  it("are neutral", () => {
    const ev = { paceGap: 0.3, habitRate: 0.8, progressNow: 0.3, progressBefore: 0.3, medianMinutes: 22, intendedMinutes: 60, habitDone: 2, habitScheduled: 10, missedOrSkipped: 5, blocks: 10, blockers: 2, logs: 5, recovery: 40 };
    for (const layer of ["goal", "strategy", "tactic", "planning", "execution", "recovery"] as const) {
      const texts = [DIAGNOSIS_TEXT.observation(layer, ev), DIAGNOSIS_TEXT.question[layer], DIAGNOSIS_TEXT.choice[layer].label];
      for (const t of texts) for (const w of DENY_LIST) expect(t.toLowerCase()).not.toContain(w);
    }
    expect(DIAGNOSIS_TEXT.observation("tactic", { medianMinutes: 22, intendedMinutes: 60 })).toContain("22분");
    expect(DIAGNOSIS_TEXT.collecting(3, 5)).toBe("데이터 수집 중 3/5");
  });
});
