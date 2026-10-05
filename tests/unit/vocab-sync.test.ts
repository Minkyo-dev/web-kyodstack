import { describe, expect, it } from "vitest";
import { missingFromNotion, pullSince } from "@/features/vocab/domain/sync";

describe("pullSince (spec §6.2)", () => {
  it("starts a full pull without a previous one and overlaps two minutes otherwise", () => {
    expect(pullSince(null)).toBeNull();
    expect(pullSince("2026-10-05T10:00:30.000Z")).toBe("2026-10-05T09:58:30.000Z");
  });
});

describe("missingFromNotion (spec §6.5)", () => {
  it("marks live mirror rows gone from Notion (restores happen through the upsert)", () => {
    const mirror = [
      { id: "w1", notionPageId: "p1", deleted: false },
      { id: "w2", notionPageId: "p2", deleted: false },
      { id: "w3", notionPageId: "p3", deleted: true },
      { id: "w4", notionPageId: "p4", deleted: true },
    ];
    expect(missingFromNotion(mirror, new Set(["p1", "p3"]))).toEqual(["w2"]);
  });
});
