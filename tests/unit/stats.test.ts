import { describe, expect, it } from "vitest";
import { calibrationScore, commitments, computeStats } from "@/features/analytics/utils/stats";
import type { StatInput } from "@/features/analytics/domain/stats.types";

const TZ = "America/Toronto"; // EDT (UTC−4) until 2026-11-01
const NOW = "2026-10-30T16:00:00.000Z"; // Fri 12:00 local
const base = (over: Partial<StatInput> = {}): StatInput => ({
  now: NOW,
  timezone: TZ,
  settings: { planned_work_days: [1, 2, 3, 4, 5], min_meaningful_minutes: 30, commit_lead_minutes: 120 },
  firstActivityDate: "2026-09-01",
  blocks: [],
  revisions: [],
  sessions: [],
  tasks: [],
  calibration: [],
  domains: [],
  domainTotals: {},
  ...over,
});
/** Local wall time → ISO (EDT fixture helper; fixtures stay before the DST change unless noted). */
const L = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-04:00`).toISOString();
const session = (id: string, task: string, start: string, end: string | null, block: string | null = null) => ({
  id,
  task_id: task,
  schedule_block_id: block,
  started_at: start,
  ended_at: end,
  pauses: [],
  focus_score: null,
});

describe("calibrationScore (requirements §23)", () => {
  it.each([
    [60, 60, 100],
    [60, 66, 91],
    [60, 75, 80],
    [60, 90, 67],
    [60, 120, 50],
  ])("planned %i actual %i → %i", (p, a, s) => expect(calibrationScore(p, a)).toBe(s));
});

describe("empty input", () => {
  it("brand-new account: every stat collects data; no NaN", () => {
    const s = computeStats(base({ firstActivityDate: null }));
    expect(s.calibration).toMatchObject({ value: null, sampleCount: 0, need: 8 });
    expect(s.reliability.value).toBeNull();
    expect(s.consistency.value).toBeNull();
    expect(s.recovery.value).toBeNull();
    expect(JSON.stringify(s)).not.toContain("NaN");
  });
});

describe("calibration", () => {
  const sample = (i: number, estimate: number, actual: number, type: string | null = "coding") => ({
    task_id: `t${i}`,
    task_type: type,
    completed_at: L("2026-10-20", "12:00"),
    estimate,
    firstSessionStart: L("2026-10-20", "09:00"),
    actualMinutes: actual,
    planBlocks: [],
  });
  it("mean score, bias and typical error over ≥ 8 samples", () => {
    const cal = Array.from({ length: 8 }, (_, i) => sample(i, 60, 66));
    const s = computeStats(base({ calibration: cal }));
    expect(s.calibration.value).toBe(91);
    expect(s.calibration.bias).toBe(0.1);
    expect(s.calibration.typicalError).toBe(0.1);
    expect(s.calibration.byType.coding).toMatchObject({ value: 91, sampleCount: 8 });
  });
  it("P is the plan made before the first session (blocks created later don't count)", () => {
    const c = {
      ...sample(1, 30, 60),
      planBlocks: [
        { starts_at: L("2026-10-20", "09:00"), ends_at: L("2026-10-20", "10:00"), status: "completed", created_at: L("2026-10-19", "20:00") },
        { starts_at: L("2026-10-20", "13:00"), ends_at: L("2026-10-20", "15:00"), status: "planned", created_at: L("2026-10-20", "11:00") },
      ],
    };
    const cal = [c, ...Array.from({ length: 7 }, (_, i) => sample(i + 2, 60, 60))];
    const s = computeStats(base({ calibration: cal }));
    // c: P = 60 (first block only), A = 60 → 100; all 100 → 100
    expect(s.calibration.value).toBe(100);
  });
  it("a confirmed blocker weights the task 0.3 (stats-v2); without blockers the mean is unchanged", () => {
    const cal = [...Array.from({ length: 7 }, (_, i) => sample(i, 60, 60)), sample(8, 60, 120)];
    const plain = computeStats(base({ calibration: cal })).calibration;
    expect(plain).toMatchObject({ value: 94, sampleCount: 8, blockerCount: 0 }); // (700 + 50) / 8
    const blocked = computeStats(base({ calibration: cal.map((c) => (c.task_id === "t8" ? { ...c, blocker: true } : c)) })).calibration;
    expect(blocked).toMatchObject({ value: 98, sampleCount: 8, blockerCount: 1 }); // (700 + 0.3·50) / 7.3
    expect(blocked.byType.coding).toMatchObject({ value: 98, sampleCount: 8 });
    expect(computeStats(base()).version).toBe("stats-v2");
  });
  it("outside the 28-day window or without A is ignored", () => {
    const old = { ...sample(1, 60, 60), completed_at: L("2026-09-20", "12:00") };
    const none = { ...sample(2, 60, 0) };
    expect(computeStats(base({ calibration: [old, none] })).calibration.sampleCount).toBe(0);
  });
});

describe("commitments / reliability", () => {
  const blk = (over: Partial<StatInput["blocks"][number]> = {}) => ({
    id: "b1",
    task_id: "t1",
    starts_at: L("2026-10-28", "10:00"),
    ends_at: L("2026-10-28", "11:00"),
    status: "planned",
    created_at: L("2026-10-27", "20:00"),
    updated_at: L("2026-10-27", "20:00"),
    ...over,
  });
  const score = (input: StatInput) => commitments(input).map((c) => [c.kind, c.score]);
  it.each([
    [L("2026-10-28", "09:55"), 1],
    [L("2026-10-28", "10:15"), 0.9],
    [L("2026-10-28", "10:30"), 0.75],
    [L("2026-10-28", "10:45"), 0.5],
  ])("session starting %s → %f", (start, expected) => {
    const s = base({ blocks: [blk()], sessions: [session("s", "t1", start, L("2026-10-28", "11:30"), "b1")] });
    expect(score(s)).toEqual([["final", expected]]);
  });
  it("no session: missed 0, completed-by-user 1", () => {
    expect(score(base({ blocks: [blk()] }))).toEqual([["final", 0]]);
    expect(score(base({ blocks: [blk({ status: "completed" })] }))).toEqual([["final", 1]]);
  });
  it("skip ≥ lead before start 0.85; later 0", () => {
    expect(score(base({ blocks: [blk({ status: "skipped", updated_at: L("2026-10-28", "07:00") })] }))).toEqual([["final", 0.85]]);
    expect(score(base({ blocks: [blk({ status: "skipped", updated_at: L("2026-10-28", "09:30") })] }))).toEqual([["final", 0]]);
  });
  it("not committed (created 1h before) → no commitment", () => {
    expect(commitments(base({ blocks: [blk({ created_at: L("2026-10-28", "09:00") })] }))).toEqual([]);
  });
  it("proactive move 0.85; the new slot is its own commitment", () => {
    const b = blk({ starts_at: L("2026-10-29", "10:00"), ends_at: L("2026-10-29", "11:00") });
    const rev = { block_id: "b1", change_type: "moved", previous_starts_at: L("2026-10-28", "10:00"), new_starts_at: L("2026-10-29", "10:00"), created_at: L("2026-10-28", "07:00") };
    const s = base({ blocks: [b], revisions: [rev], sessions: [session("s", "t1", L("2026-10-29", "10:00"), L("2026-10-29", "11:00"), "b1")] });
    expect(score(s)).toEqual([["move", 0.85], ["final", 1]]);
  });
  it("late move 0.5; resized revision that moves the start counts as a move", () => {
    const b = blk({ starts_at: L("2026-10-28", "15:00"), ends_at: L("2026-10-28", "15:30") });
    const rev = { block_id: "b1", change_type: "resized", previous_starts_at: L("2026-10-28", "10:00"), new_starts_at: L("2026-10-28", "15:00"), created_at: L("2026-10-28", "09:30") };
    // new slot set at 09:30 for 15:00 → committed (≥ 120 min)
    expect(score(base({ blocks: [b], revisions: [rev] }))).toEqual([["move", 0.5], ["final", 0]]);
  });
  it("a resize that keeps the start doesn't reset commitment", () => {
    const rev = { block_id: "b1", change_type: "resized", previous_starts_at: L("2026-10-28", "10:00"), new_starts_at: L("2026-10-28", "10:00"), created_at: L("2026-10-28", "09:59") };
    expect(score(base({ blocks: [blk()], revisions: [rev] }))).toEqual([["final", 0]]);
  });
  it("future final slot is unresolved", () => {
    const b = blk({ starts_at: L("2026-10-30", "13:00"), ends_at: L("2026-10-30", "14:00"), created_at: L("2026-10-29", "10:00") });
    expect(commitments(base({ blocks: [b] }))).toEqual([]);
  });
  it("reliability needs 10 commitments", () => {
    const blocks = Array.from({ length: 10 }, (_, i) => blk({ id: `b${i}`, status: "completed" }));
    expect(computeStats(base({ blocks })).reliability).toMatchObject({ value: 100, sampleCount: 10 });
  });
});

describe("consistency (requirements §29)", () => {
  const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"];
  it("steady 2h every work day beats one 12h Monday", () => {
    const steady = days.map((d, i) => session(`s${i}`, "t", L(d, "09:00"), L(d, "11:00")));
    const burst = [session("m", "t", L("2026-10-19", "08:00"), L("2026-10-19", "20:00"))];
    const window = { firstActivityDate: "2026-10-19" };
    const a = computeStats(base({ ...window, sessions: burst })).consistency;
    const b = computeStats(base({ ...window, sessions: steady })).consistency;
    expect(a.workDays).toBe(9); // Mon 19 … Thu 29, today (Fri 30) excluded
    expect(a.successDays).toBe(1);
    expect(b.successDays).toBe(9);
    expect(a.value).toBeNull(); // < 15 days
  });
  it("value once ≥ 15 work days", () => {
    const s = computeStats(base({ firstActivityDate: "2026-10-01" })).consistency;
    expect(s.workDays).toBe(21);
    expect(s.value).toBe(0);
  });
  it("DST week: a session across local midnight Nov 1 splits by local day", () => {
    const now = "2026-11-06T17:00:00.000Z"; // Fri Nov 6, EST
    const late = session("x", "t", "2026-11-02T04:40:00.000Z", "2026-11-02T05:40:00.000Z"); // Sun 23:40 → Mon 00:40 EST
    const s = computeStats(base({ now, firstActivityDate: "2026-11-02", sessions: [late] })).consistency;
    expect(s.workDays).toBe(4); // Mon–Thu
    expect(s.successDays).toBe(1); // Monday has 40 min (00:00–00:40)
  });
});

describe("recovery", () => {
  const missed = (id: string, day: string) => ({
    id,
    task_id: `task-${id}`,
    starts_at: L(day, "10:00"),
    ends_at: L(day, "11:00"),
    status: "missed",
    created_at: L(day, "07:00"),
    updated_at: L(day, "07:00"),
  });
  const work = (task: string, day: string) => session(`w-${task}-${day}`, task, L(day, "14:00"), L(day, "15:00"));
  it("next work day 100, 2 days 75, 3 days 50, later 25", () => {
    const blocks = [missed("a", "2026-10-05"), missed("b", "2026-10-05"), missed("c", "2026-10-05"), missed("d", "2026-10-05"), missed("e", "2026-10-02")];
    const sessions = [
      work("task-a", "2026-10-06"), // Tue: 1 work day → 100
      work("task-b", "2026-10-07"), // 2 → 75
      work("task-c", "2026-10-08"), // 3 → 50
      work("task-d", "2026-10-13"), // 6 → 25
      work("task-e", "2026-10-02"), // same day after the block → 100
    ];
    const s = computeStats(base({ blocks, sessions })).recovery;
    expect(s).toMatchObject({ sampleCount: 5, value: 70 }); // (100+75+50+25+100)/5
  });
  it("abandoned (no work within 14 days) → 0; young unresolved excluded", () => {
    const blocks = [missed("old", "2026-10-05"), missed("young", "2026-10-26")];
    const s = computeStats(base({ blocks })).recovery;
    expect(s.sampleCount).toBe(1); // only "old"
  });
});

describe("patterns and domains", () => {
  it("capacity = median focused minutes of meaningful work days; domains roll up", () => {
    const sessions = [
      session("1", "t1", L("2026-10-26", "09:00"), L("2026-10-26", "10:00")),
      session("2", "t1", L("2026-10-27", "09:00"), L("2026-10-27", "12:00")),
      session("3", "t1", L("2026-10-28", "09:00"), L("2026-10-28", "09:10")), // below 30 → not a meaningful day
    ];
    const s = computeStats(
      base({
        sessions,
        tasks: [{ id: "t1", status: "in_progress", task_type: "coding", practice_domain_id: "child" }],
        domains: [
          { id: "parent", name: "Data Eng", parent_id: null },
          { id: "child", name: "Snowflake", parent_id: "parent" },
        ],
        domainTotals: { child: 500 },
      }),
    );
    expect(s.patterns.dailyCapacityMinutes).toBe(120); // median of 60, 180
    expect(s.patterns.medianSessionMinutes).toBe(60);
    const parent = s.domains.find((d) => d.id === "parent")!;
    expect(parent).toMatchObject({ recentMinutes: 250, totalMinutes: 500 });
  });
});
