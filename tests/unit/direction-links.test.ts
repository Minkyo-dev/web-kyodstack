import { describe, expect, it } from "vitest";
import { countProjectConflicts, isNewLink, missionConflict } from "@/features/direction/domain/link-rules";

describe("missionConflict", () => {
  it("conflicts only when both are set and differ", () => {
    expect(missionConflict("a", "b")).toBe(true);
    expect(missionConflict("a", "a")).toBe(false);
    expect(missionConflict("a", null)).toBe(false);
    expect(missionConflict(null, "b")).toBe(false);
  });
});

describe("countProjectConflicts", () => {
  it("counts tasks whose explicit mission differs from the new one", () => {
    expect(countProjectConflicts("a", ["a", null, "b", "c"])).toBe(2);
    expect(countProjectConflicts(null, ["a", "b"])).toBe(0); // clearing is always allowed
  });
});

describe("isNewLink", () => {
  it("is true only for a different non-null id", () => {
    expect(isNewLink("a", null)).toBe(true);
    expect(isNewLink("a", "b")).toBe(true);
    expect(isNewLink("a", "a")).toBe(false); // keeping a link to a closed mission is fine
    expect(isNewLink(null, "a")).toBe(false);
    expect(isNewLink(undefined, undefined)).toBe(false);
  });
});
