import { describe, expect, it } from "vitest";
import {
  alignment,
  habitConsistency,
  identityEvidence,
  missionProgress,
  paceGap,
  scheduledDays,
} from "@/features/direction/domain/status";
import { DENY_LIST, STATUS_TEXT } from "@/features/direction/domain/status-text";

const crit = (over: Partial<{ kind: "check" | "numeric"; met_at: string | null; current_value: number | null; target_value: number | null }>) => ({
  kind: "check" as const,
  met_at: null,
  current_value: null,
  target_value: null,
  ...over,
});

describe("missionProgress", () => {
  it("averages criteria; numeric over target counts as 1", () => {
    const p = missionProgress({
      criteria: [
        crit({ met_at: "2026-09-30T00:00:00Z" }),
        crit({}),
        crit({ kind: "numeric", current_value: 5, target_value: 3 }),
        crit({ kind: "numeric", current_value: 1, target_value: 4 }),
      ],
      projectTasks: [{ status: "completed" }],
      focusMinutes: 0,
    });
    expect(p.kind).toBe("criteria");
    expect(p.ratio).toBeCloseTo((1 + 0 + 1 + 0.25) / 4);
    expect(p.basis).toEqual({ done: 2, total: 4 });
  });

  it("falls back to the mission projects' task ratio, cancelled excluded", () => {
    const p = missionProgress({
      criteria: [],
      projectTasks: [{ status: "completed" }, { status: "todo" }, { status: "cancelled" }, { status: "in_progress" }],
      focusMinutes: 30,
    });
    expect(p).toEqual({ kind: "projects", ratio: 1 / 3, basis: { done: 1, total: 3 }, focusMinutes: 30 });
  });

  it("shows time, not 0%, without criteria or project tasks", () => {
    expect(missionProgress({ criteria: [], projectTasks: [{ status: "cancelled" }], focusMinutes: 95 })).toEqual({
      kind: "time",
      ratio: null,
      basis: null,
      focusMinutes: 95,
    });
  });
});

describe("paceGap", () => {
  it("is elapsed share minus progress", () => {
    expect(paceGap({ createdDate: "2026-09-01", deadline: "2026-10-01", today: "2026-09-16", ratio: 0.2 })).toBeCloseTo(0.5 - 0.2);
  });
  it("clamps elapsed after the deadline and is null without a deadline or ratio", () => {
    expect(paceGap({ createdDate: "2026-09-01", deadline: "2026-09-10", today: "2026-10-01", ratio: 0.4 })).toBeCloseTo(0.6);
    expect(paceGap({ createdDate: "2026-09-01", deadline: null, today: "2026-10-01", ratio: 0.4 })).toBeNull();
    expect(paceGap({ createdDate: "2026-09-01", deadline: "2026-10-01", today: "2026-09-10", ratio: null })).toBeNull();
  });
});

describe("alignment", () => {
  it("splits active time into aligned on-path and off-path", () => {
    const a = alignment([
      { focusedMinutes: 60, missionId: null, protocolId: null, pathActive: null },
      { focusedMinutes: 30, missionId: "m", protocolId: null, pathActive: null },
      { focusedMinutes: 20, missionId: "m", protocolId: "p", pathActive: true },
      { focusedMinutes: 15, missionId: "m", protocolId: "old", pathActive: false },
    ]);
    expect(a).toEqual({ activeMinutes: 125, alignedMinutes: 65, onPathMinutes: 50, offPathMinutes: 15 });
  });
});

describe("habit consistency", () => {
  const h = { id: "h", weekdays: [1, 2, 3, 4, 5], createdDate: "2026-09-30", missionId: null };
  it("starts counting from the habit's creation day", () => {
    // Week of Mon 2026-09-28; created Wednesday → Wed, Thu scheduled through Thursday.
    expect(scheduledDays(h, "2026-09-28", "2026-10-01")).toEqual(["2026-09-30", "2026-10-01"]);
  });
  it("counts checks on scheduled days only", () => {
    const c = habitConsistency([h], [{ habitId: "h", date: "2026-09-30" }, { habitId: "h", date: "2026-09-29" }], "2026-09-28", "2026-10-01");
    expect(c).toEqual({ done: 1, scheduled: 2 });
  });
});

describe("identityEvidence", () => {
  it("adds a sentence only at ≥ 0.6 completion with ≥ 5 scheduled days", () => {
    expect(identityEvidence({ name: "English Speaker", sessions: 4, done: 6, scheduled: 8 }).sentence).toContain("English Speaker");
    expect(identityEvidence({ name: "X", sessions: 4, done: 2, scheduled: 4 }).sentence).toBeNull();
    expect(identityEvidence({ name: "X", sessions: 4, done: 4, scheduled: 8 }).sentence).toBeNull();
  });
});

describe("status sentences", () => {
  it("never use judgmental words", () => {
    const samples = [
      STATUS_TEXT.identity("X"),
      STATUS_TEXT.paceBehind,
      STATUS_TEXT.collecting,
      STATUS_TEXT.noMission,
      STATUS_TEXT.offPath("1h 10m"),
    ];
    for (const s of samples) for (const w of DENY_LIST) expect(s.toLowerCase()).not.toContain(w);
  });
});
