import { describe, expect, it } from "vitest";
import {
  createProtocolSchema,
  setCriterionProgressSchema,
  setPurposeSchema,
  upsertCriterionSchema,
} from "@/features/direction/schemas/direction.schema";

const uuid = "00000000-0000-4000-a000-000000000001";

describe("direction schemas", () => {
  it("trims and bounds the directive", () => {
    expect(setPurposeSchema.parse({ statement: "  Live free  " }).statement).toBe("Live free");
    expect(setPurposeSchema.safeParse({ statement: "   " }).success).toBe(false);
    expect(setPurposeSchema.safeParse({ statement: "x".repeat(281) }).success).toBe(false);
  });

  it("needs a target for numeric criteria and none for checks", () => {
    const base = { missionId: uuid, label: "Mock interviews", unit: null };
    expect(upsertCriterionSchema.safeParse({ ...base, kind: "numeric", targetValue: 3 }).success).toBe(true);
    expect(upsertCriterionSchema.safeParse({ ...base, kind: "numeric", targetValue: null }).success).toBe(false);
    expect(upsertCriterionSchema.safeParse({ ...base, kind: "check", targetValue: 3 }).success).toBe(false);
  });

  it("sets exactly one of met / currentValue", () => {
    expect(setCriterionProgressSchema.safeParse({ criterionId: uuid, met: true }).success).toBe(true);
    expect(setCriterionProgressSchema.safeParse({ criterionId: uuid, currentValue: 2 }).success).toBe(true);
    expect(setCriterionProgressSchema.safeParse({ criterionId: uuid }).success).toBe(false);
    expect(setCriterionProgressSchema.safeParse({ criterionId: uuid, met: true, currentValue: 2 }).success).toBe(false);
  });

  it("drops blank protocol steps and caps them at 12", () => {
    const ok = createProtocolSchema.parse({ pathId: uuid, title: "Shadowing", steps: ["Listen", " ", "Repeat"], intendedMinutes: 20 });
    expect(ok.steps).toEqual(["Listen", "Repeat"]);
    expect(createProtocolSchema.safeParse({ pathId: uuid, title: "x", steps: Array(13).fill("s"), intendedMinutes: null }).success).toBe(false);
    expect(createProtocolSchema.safeParse({ pathId: uuid, title: "x", steps: [], intendedMinutes: 4 }).success).toBe(false);
  });
});
