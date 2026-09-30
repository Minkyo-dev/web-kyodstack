import { describe, expect, it } from "vitest";
import { blockState, nextFreeSlot, sameTimeTomorrow } from "@/features/scheduler/utils/block-state";

const TZ = "America/Toronto"; // EDT = UTC−4 until 2026-11-01
const blk = (s: string, e: string, status = "planned", id = "b1", task = "t1") => ({
  id,
  task_id: task,
  starts_at: s,
  ends_at: e,
  status,
});
const ses = (started: string, ended: string | null, blockId: string | null = null, task = "t1") => ({
  schedule_block_id: blockId,
  task_id: task,
  started_at: started,
  ended_at: ended,
});
const at = (iso: string) => new Date(iso);

describe("blockState", () => {
  const b = blk("2026-09-30T14:00:00Z", "2026-09-30T15:00:00Z");
  it("planned before start + 15 min", () => {
    expect(blockState(b, [], at("2026-09-30T14:14:00Z"))).toBe("planned");
  });
  it("not_started from start + 15 min until the end", () => {
    expect(blockState(b, [], at("2026-09-30T14:15:00Z"))).toBe("not_started");
    expect(blockState(b, [], at("2026-09-30T14:59:00Z"))).toBe("not_started");
  });
  it("planned but ended → missed (before the DB mark runs)", () => {
    expect(blockState(b, [], at("2026-09-30T15:00:00Z"))).toBe("missed");
  });
  it("stored missed stays missed", () => {
    expect(blockState({ ...b, status: "missed" }, [], at("2026-09-30T14:00:00Z"))).toBe("missed");
  });
  it("an open linked session → running; a finished one keeps it planned", () => {
    expect(blockState(b, [ses("2026-09-30T14:20:00Z", null, "b1")], at("2026-09-30T14:40:00Z"))).toBe("running");
    expect(blockState(b, [ses("2026-09-30T14:20:00Z", "2026-09-30T14:50:00Z", "b1")], at("2026-09-30T15:30:00Z"))).toBe(
      "planned",
    );
  });
  it("a same-task session starting within [start − 30 min, end) counts; other tasks don't", () => {
    expect(blockState(b, [ses("2026-09-30T13:35:00Z", "2026-09-30T13:50:00Z")], at("2026-09-30T15:30:00Z"))).toBe(
      "planned",
    );
    expect(
      blockState(b, [ses("2026-09-30T14:10:00Z", "2026-09-30T14:20:00Z", null, "other")], at("2026-09-30T15:30:00Z")),
    ).toBe("missed");
  });
  it("other statuses pass through", () => {
    expect(blockState({ ...b, status: "completed" }, [], at("2026-09-30T16:00:00Z"))).toBe("completed");
    expect(blockState({ ...b, status: "skipped" }, [], at("2026-09-30T16:00:00Z"))).toBe("skipped");
  });
});

describe("nextFreeSlot", () => {
  const base = { lengthMinutes: 60, blocks: [], timezone: TZ, workdayStart: "09:00:00" };
  it("rounds now up to 15 minutes", () => {
    // 10:07 local → 10:15 local = 14:15Z
    expect(nextFreeSlot({ ...base, now: at("2026-09-30T14:07:00Z") })).toBe("2026-09-30T14:15:00.000Z");
  });
  it("never before the workday start", () => {
    // 06:00 local → 09:00 local = 13:00Z
    expect(nextFreeSlot({ ...base, now: at("2026-09-30T10:00:00Z") })).toBe("2026-09-30T13:00:00.000Z");
  });
  it("skips past an overlapping planned block (rounded up), ignoring the excluded one", () => {
    const blocks = [
      blk("2026-09-30T14:00:00Z", "2026-09-30T15:10:00Z", "planned", "busy"),
      blk("2026-09-30T14:00:00Z", "2026-09-30T20:00:00Z", "planned", "self"),
    ];
    expect(nextFreeSlot({ ...base, blocks, excludeBlockId: "self", now: at("2026-09-30T14:07:00Z") })).toBe(
      "2026-09-30T15:15:00.000Z",
    );
  });
  it("ignores cancelled/missed blocks", () => {
    const blocks = [blk("2026-09-30T14:00:00Z", "2026-09-30T16:00:00Z", "missed", "m")];
    expect(nextFreeSlot({ ...base, blocks, now: at("2026-09-30T14:07:00Z") })).toBe("2026-09-30T14:15:00.000Z");
  });
  it("null when it would not end before local midnight", () => {
    // 23:20 local = 03:20Z next day
    expect(nextFreeSlot({ ...base, now: at("2026-10-01T03:20:00Z") })).toBeNull();
  });
});

describe("sameTimeTomorrow", () => {
  it("keeps the local wall time", () => {
    expect(sameTimeTomorrow("2026-09-30T23:00:00Z", TZ)).toBe("2026-10-01T23:00:00.000Z");
  });
  it("across the DST change: 19:00 EDT on Oct 31 → 19:00 EST on Nov 1", () => {
    expect(sameTimeTomorrow("2026-10-31T23:00:00Z", TZ)).toBe("2026-11-02T00:00:00.000Z");
  });
});
