import { describe, expect, it } from "vitest";
import { findOverlaps } from "@/features/scheduler/utils/calendar";

const block = (id: string, s: string, e: string, status = "planned") => ({
  id,
  starts_at: `2026-09-29T${s}:00Z`,
  ends_at: `2026-09-29T${e}:00Z`,
  status,
});

describe("findOverlaps", () => {
  const blocks = [
    block("a", "14:00", "15:00"),
    block("b", "15:00", "16:00"),
    block("c", "14:30", "15:30", "skipped"),
    block("d", "14:30", "15:30", "cancelled"),
  ];
  const range = (s: string, e: string) => ({
    id: "x",
    start: new Date(`2026-09-29T${s}:00Z`),
    end: new Date(`2026-09-29T${e}:00Z`),
  });

  it("treats touching edges as non-overlapping", () => {
    expect(findOverlaps(blocks, range("13:00", "14:00"))).toEqual([]);
  });
  it("finds real overlaps and ignores skipped/cancelled and itself", () => {
    expect(findOverlaps(blocks, range("14:45", "15:15")).map((b) => b.id)).toEqual(["a", "b"]);
    expect(findOverlaps(blocks, { ...range("14:00", "15:00"), id: "a" })).toEqual([]);
  });
});
