import { describe, expect, it } from "vitest";
import {
  describeDifference,
  describeRemaining,
  focusStats,
  focusedMinutesInWindow,
  partialDropMinutes,
  remainingMinutes,
  sessionPlanMinutes,
  sessionTooLong,
} from "@/features/scheduler/utils/focus";

const t = (hhmm: string) => `2026-09-29T${hhmm}:00.000Z`;
const ms = (iso: string) => new Date(iso).getTime();

describe("focusStats", () => {
  it("spec §11 example: 19:12 start, 19:43–19:51 pause, 20:34 stop → 82 elapsed, 8 paused, 74 focused", () => {
    const s = focusStats({ started_at: t("19:12"), ended_at: t("20:34") }, [
      { paused_at: t("19:43"), resumed_at: t("19:51") },
    ]);
    expect(s.elapsedMs / 60_000).toBe(82);
    expect(s.pausedMs / 60_000).toBe(8);
    expect(s.focusedMs / 60_000).toBe(74);
    expect(s.paused).toBe(false);
  });

  it("running and paused: the open pause runs until now and the clock is frozen", () => {
    const s = focusStats({ started_at: t("10:00"), ended_at: null }, [{ paused_at: t("10:30"), resumed_at: null }],
      new Date(t("10:50")));
    expect(s.paused).toBe(true);
    expect(s.focusedMs / 60_000).toBe(30);
    expect(s.pausedMs / 60_000).toBe(20);
  });

  it("never negative", () => {
    const s = focusStats({ started_at: t("10:00"), ended_at: null }, [], new Date(t("09:59")));
    expect(s.elapsedMs).toBe(0);
    expect(s.focusedMs).toBe(0);
  });
});

describe("focusedMinutesInWindow", () => {
  it("subtracts only the part of a pause inside the window (pause crosses the window edge)", () => {
    // session 23:00–01:00 UTC, pause 23:50–00:20; window = [00:00, 24:00) of the 30th
    const session = { started_at: "2026-09-29T23:00:00Z", ended_at: "2026-09-30T01:00:00Z" };
    const pauses = [{ paused_at: "2026-09-29T23:50:00Z", resumed_at: "2026-09-30T00:20:00Z" }];
    const from = ms("2026-09-30T00:00:00Z");
    const to = ms("2026-10-01T00:00:00Z");
    expect(focusedMinutesInWindow(session, pauses, from, to, to)).toBe(40);
    expect(focusedMinutesInWindow(session, pauses, ms("2026-09-29T00:00:00Z"), from, to)).toBe(50);
  });

  it("a running session is counted up to now, minus its open pause", () => {
    const session = { started_at: t("10:00"), ended_at: null };
    const pauses = [{ paused_at: t("10:40"), resumed_at: null }];
    expect(focusedMinutesInWindow(session, pauses, ms(t("00:00")), ms(t("23:59")), ms(t("11:00")))).toBe(40);
  });
});

describe("plan / remaining", () => {
  it("block duration wins", () => {
    expect(sessionPlanMinutes({ block: { starts_at: t("19:00"), ends_at: t("20:20") }, estimateMinutes: 60, priorActualMinutes: 30 })).toBe(80);
  });
  it("otherwise estimate minus earlier actual, floored at 0", () => {
    expect(sessionPlanMinutes({ block: null, estimateMinutes: 60, priorActualMinutes: 45 })).toBe(15);
    expect(sessionPlanMinutes({ block: null, estimateMinutes: 60, priorActualMinutes: 90 })).toBe(0);
  });
  it("hidden without block or estimate", () => {
    expect(sessionPlanMinutes({ block: null, estimateMinutes: null, priorActualMinutes: 0 })).toBeNull();
  });
  it("remainingMinutes", () => {
    expect(remainingMinutes(80, 45)).toBe(35);
    expect(remainingMinutes(80, 90)).toBe(0);
    expect(remainingMinutes(null, 10)).toBeNull();
  });
  it("partialDropMinutes rounds up to 5 and respects the minimum block", () => {
    expect(partialDropMinutes(33, 15)).toBe(35);
    expect(partialDropMinutes(7, 15)).toBe(15);
    expect(partialDropMinutes(0, 15)).toBeNull();
    expect(partialDropMinutes(null, 15)).toBeNull();
  });
});

describe("wording (factual, never judgmental)", () => {
  it("difference", () => {
    expect(describeDifference(80, 94)).toBe("+14분 (18%) 더 걸림");
    expect(describeDifference(60, 54)).toBe("6분 덜 걸림");
    expect(describeDifference(60, 60.4)).toBe("계획과 같음");
  });
  it("remaining / overrun", () => {
    expect(describeRemaining(80, 42)).toBe("38분 남음");
    expect(describeRemaining(80, 92)).toBe("12분 초과");
  });
});

describe("sessionTooLong", () => {
  it("true after 16 hours", () => {
    expect(sessionTooLong(t("00:00"), new Date("2026-09-29T16:01:00Z"))).toBe(true);
    expect(sessionTooLong(t("00:00"), new Date("2026-09-29T15:59:00Z"))).toBe(false);
  });
});
