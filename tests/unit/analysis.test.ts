import { describe, expect, it } from "vitest";
import { analysisDue, analysisSlot, checkEvidence, directionInput } from "@/features/ai/utils/analysis";

const TZ = "America/Toronto";

describe("analysisSlot", () => {
  it("most recent local weekday/hour at or before now", () => {
    // Wed 2026-09-30 21:30 Toronto (EDT) = 2026-10-01T01:30Z
    const now = new Date("2026-10-01T01:30:00Z");
    expect(analysisSlot(now, TZ, 3, 21)?.toISOString()).toBe("2026-10-01T01:00:00.000Z"); // today 21:00
    expect(analysisSlot(now, TZ, 3, 22)?.toISOString()).toBe("2026-09-24T02:00:00.000Z"); // last Wed 22:00
    expect(analysisSlot(now, TZ, 1, 8)?.toISOString()).toBe("2026-09-28T12:00:00.000Z"); // Mon 08:00
    expect(analysisSlot(now, TZ, null, 8)).toBeNull();
  });
  it("uses local time across DST (Toronto falls back on Sun 2026-11-01)", () => {
    const now = new Date("2026-11-03T15:00:00Z"); // Tue 10:00 EST
    expect(analysisSlot(now, TZ, 1, 8)?.toISOString()).toBe("2026-11-02T13:00:00.000Z"); // Mon 08:00 EST
  });
});

describe("analysisDue", () => {
  it("due when nothing was created since the slot", () => {
    const slot = new Date("2026-09-28T12:00:00Z");
    expect(analysisDue(slot, null)).toBe(true);
    expect(analysisDue(slot, "2026-09-27T12:00:00Z")).toBe(true);
    expect(analysisDue(slot, "2026-09-28T12:00:00Z")).toBe(false);
    expect(analysisDue(null, null)).toBe(false);
  });
});

describe("checkEvidence", () => {
  const input = { stats: { calibration: { now: 78, weekAgo: 72, monthAgo: null, samples: 8, bias: 0.14, biasMonthAgo: 0.31 } }, patterns: { medianSessionMinutes: 46 } };
  it("keeps explanations whose numbers are in the input (percent forms too)", () => {
    const out = checkEvidence(
      {
        explanations: [
          { stat: "calibration", headline: "예상 정확도가 72 → 78로 올랐어요", detail: "과소 예상이 +31% → +14%로 줄었어요", evidence: ["8개 작업 기준"] },
          { stat: "calibration", headline: "정확도 95", detail: "x", evidence: [] },
        ],
        assessment: { planningTendency: "조금 낙관적", workStyle: "긴 집중 세션", currentRisk: "저녁 과부하", strongPattern: "오전 실행 3회" },
      },
      input,
    );
    expect(out?.explanations).toHaveLength(1);
    expect(out?.assessment).toEqual({ planningTendency: "조금 낙관적", workStyle: "긴 집중 세션", currentRisk: "저녁 과부하", strongPattern: null });
  });
  it("returns null when nothing survives", () => {
    expect(checkEvidence({ explanations: [{ stat: "calibration", headline: "99점", detail: "", evidence: [] }], assessment: { planningTendency: "1", workStyle: "2", currentRisk: "3", strongPattern: "4" } }, input)).toBeNull();
  });
});

describe("direction note (G4)", () => {
  const input = {
    stats: {},
    patterns: {},
    direction: directionInput([
      { diagnosis: { collecting: null, suspected: "tactic", signals: [{ layer: "tactic", evidence: { medianMinutes: 22, intendedMinutes: 60 } }] } },
      { diagnosis: { collecting: { n: 2, need: 5 }, suspected: null, signals: [] } },
    ]),
  };
  const empty = { planningTendency: null, workStyle: null, currentRisk: null, strongPattern: null };
  it("builds a numbers-only block of diagnosed missions", () => {
    expect(input.direction).toEqual([{ suspected: "tactic", signals: { tactic: { medianMinutes: 22, intendedMinutes: 60 } } }]);
  });
  it("keeps a note whose numbers are in the input, even as the only content", () => {
    const out = checkEvidence({ explanations: [], assessment: empty, directionNote: "실제 세션은 보통 22분, 계획은 60분입니다." }, input);
    expect(out?.directionNote).toBe("실제 세션은 보통 22분, 계획은 60분입니다.");
  });
  it("drops a note citing an unknown number but keeps the rest", () => {
    const out = checkEvidence(
      { explanations: [], assessment: { ...empty, workStyle: "긴 집중 세션" }, directionNote: "세션이 보통 35분입니다." },
      input,
    );
    expect(out?.directionNote).toBeNull();
    expect(out?.assessment.workStyle).toBe("긴 집중 세션");
  });
});
