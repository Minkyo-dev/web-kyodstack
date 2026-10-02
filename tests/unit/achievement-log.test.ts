import { describe, expect, it } from "vitest";
import { routineStreaks } from "@/features/direction/domain/habits";
import { buildAchievementLog, levelUps } from "@/features/gamification/utils/achievement-log";

const TZ = "America/Toronto";
const day = (d: string) => ({ local_date: d, created_at: `${d}T22:00:00Z` });
/** n consecutive dates from 2026-09-01. */
const days = (n: number, from = 1) => Array.from({ length: n }, (_, i) => day(`2026-09-${String(from + i).padStart(2, "0")}`));

describe("routineStreaks", () => {
  it("counts checks in a row on due days and marks 7", () => {
    const r = routineStreaks([1, 2, 3, 4, 5, 6, 7], days(8));
    expect(r.best).toBe(8);
    expect(r.marks).toEqual([{ count: 7, localDate: "2026-09-07", at: "2026-09-07T22:00:00Z" }]);
  });
  it("a missed due day breaks the run", () => {
    const r = routineStreaks([1, 2, 3, 4, 5, 6, 7], [...days(5), ...days(6, 7)]);
    expect(r.best).toBe(6);
    expect(r.marks).toEqual([]);
  });
  it("skips days the routine is not due (weekdays only)", () => {
    // 2026-09-04 is a Friday; Mon 09-07 follows it with no due day in between.
    const r = routineStreaks([1, 2, 3, 4, 5], [day("2026-09-03"), day("2026-09-04"), day("2026-09-07"), day("2026-09-08")]);
    expect(r.best).toBe(4);
  });
  it("ignores duplicates and order", () => {
    expect(routineStreaks([], [day("2026-09-02"), day("2026-09-01"), day("2026-09-02")]).best).toBe(2);
  });
});

describe("levelUps", () => {
  it("one entry per day, the highest level reached that day", () => {
    const xp = [
      { xp: 100, local_date: "2026-09-01", created_at: "2026-09-01T12:00:00Z" },
      { xp: 60, local_date: "2026-09-01", created_at: "2026-09-01T13:00:00Z" }, // 160 → Lv.2
      { xp: 400, local_date: "2026-09-02", created_at: "2026-09-02T13:00:00Z" }, // 560 → Lv.3
    ];
    expect(levelUps(xp).map((e) => [e.date, e.text])).toEqual([["2026-09-01", "Lv.2"], ["2026-09-02", "Lv.3"]]);
  });
});

describe("buildAchievementLog", () => {
  const work = {
    milestones: [{ id: "m", name: "초안", completed_at: "2026-09-03T15:00:00Z", projectName: "블로그" }],
    projects: [{ id: "p", name: "블로그", completed_at: "2026-09-10T15:00:00Z" }],
    goals: [{ id: "g", title: "글쓰기 습관", closed_at: "2026-09-20T15:00:00Z" }],
    routines: [{ id: "r", title: "아침 글쓰기", weekdays: [1, 2, 3, 4, 5, 6, 7], checks: days(7) }],
  };

  it("work entries only while gamification is off, newest first", () => {
    const log = buildAchievementLog(work, null, TZ);
    expect(log.map((e) => [e.tag, e.text, e.date])).toEqual([
      ["CHANGE ACHIEVED", "글쓰기 습관", "2026-09-20"],
      ["PROJECT CLEAR", "블로그", "2026-09-10"],
      ["STREAK x7", "아침 글쓰기 7번 연속", "2026-09-07"],
      ["MILESTONE", "블로그 · 초안", "2026-09-03"],
    ]);
  });

  it("adds quests, achievements and level-ups while on", () => {
    const log = buildAchievementLog(work, {
      xp: [{ xp: 200, local_date: "2026-09-05", created_at: "2026-09-05T12:00:00Z" }],
      quests: [{ id: "q", type: "weekly", title: "모멘텀 유지", cleared_at: "2026-09-06T12:00:00Z" }],
      achievements: [{ key: "project_clear", unlocked_at: "2026-09-10T15:00:01Z" }],
    }, TZ);
    expect(log.map((e) => e.tag)).toEqual(["CHANGE ACHIEVED", "ACHIEVEMENT", "PROJECT CLEAR", "STREAK x7", "WEEKLY QUEST CLEAR", "LEVEL UP", "MILESTONE"]);
    expect(log.find((e) => e.kind === "achievement")!.text).toBe("PROJECT CLEAR");
  });

  it("dates entries in the user's timezone", () => {
    const late = { ...work, goals: [{ id: "g", title: "t", closed_at: "2026-09-21T02:00:00Z" }], projects: [], milestones: [], routines: [] };
    expect(buildAchievementLog(late, null, TZ)[0].date).toBe("2026-09-20");
  });
});
