import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, newlyUnlocked, TITLES } from "@/features/gamification/utils/achievements";

const work = { milestonesCompleted: 0, projectsCompleted: 0, goalsAchieved: 0, bestRoutineStreak: 0 };
const empty = { sessionFocus: [], calibrationErrors: [], perfectCommitments: 0, weeklyCleared: 0, recoveryCleared: 0, ...work };

describe("achievements", () => {
  it("unlocks at the boundaries", () => {
    expect(newlyUnlocked({ ...empty, sessionFocus: [9.9] }, new Set())).toEqual([]);
    expect(newlyUnlocked({ ...empty, sessionFocus: [10] }, new Set())).toEqual(["first_step"]);
    expect(newlyUnlocked({ ...empty, sessionFocus: Array(10).fill(60) }, new Set()).sort()).toEqual(["deep_session", "first_step"]);
    expect(newlyUnlocked({ ...empty, calibrationErrors: [...Array(9).fill(0.1), 0.11] }, new Set())).toEqual([]);
    expect(newlyUnlocked({ ...empty, calibrationErrors: Array(10).fill(0.1) }, new Set())).toEqual(["reliable_planner"]);
    expect(newlyUnlocked({ ...empty, perfectCommitments: 10 }, new Set())).toEqual(["early_starter"]);
    expect(newlyUnlocked({ ...empty, weeklyCleared: 4 }, new Set())).toEqual(["consistent_builder"]);
    expect(newlyUnlocked({ ...empty, recoveryCleared: 1 }, new Set())).toEqual(["comeback"]);
  });

  it("unlocks the work achievements (ach-v2)", () => {
    expect(newlyUnlocked({ ...empty, milestonesCompleted: 1 }, new Set())).toEqual(["first_checkpoint"]);
    expect(newlyUnlocked({ ...empty, milestonesCompleted: 10 }, new Set()).sort()).toEqual(["first_checkpoint", "milestone_runner"]);
    expect(newlyUnlocked({ ...empty, projectsCompleted: 1 }, new Set())).toEqual(["project_clear"]);
    expect(newlyUnlocked({ ...empty, goalsAchieved: 1 }, new Set())).toEqual(["goal_achieved"]);
    expect(newlyUnlocked({ ...empty, bestRoutineStreak: 6 }, new Set())).toEqual([]);
    expect(newlyUnlocked({ ...empty, bestRoutineStreak: 30 }, new Set()).sort()).toEqual(["iron_routine", "routine_7"]);
  });

  it("system thinker follows five others, including ones unlocked in the same pass", () => {
    const all = { sessionFocus: Array(10).fill(60), calibrationErrors: Array(10).fill(0), perfectCommitments: 10, weeklyCleared: 4, recoveryCleared: 0, ...work };
    expect(newlyUnlocked(all, new Set()).sort()).toEqual(["consistent_builder", "deep_session", "early_starter", "first_step", "reliable_planner", "system_thinker"]);
  });

  it("never returns already unlocked keys (no re-lock, no repeat)", () => {
    expect(newlyUnlocked(empty, new Set(["first_step"]))).toEqual([]);
    expect(newlyUnlocked({ ...empty, sessionFocus: [30] }, new Set(["first_step"]))).toEqual([]);
  });

  it("every title key has a name and progress is reported", () => {
    for (const a of ACHIEVEMENTS) if (a.titleKey) expect(TITLES[a.titleKey]).toBeTruthy();
    const deep = ACHIEVEMENTS.find((a) => a.key === "deep_session")!;
    expect(deep.progress({ ...empty, sessionFocus: [60, 61, 30] }, new Set())).toEqual({ current: 2, target: 10 });
  });
});
