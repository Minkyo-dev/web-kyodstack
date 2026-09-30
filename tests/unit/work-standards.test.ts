import { describe, expect, it } from "vitest";
import { workStandardsSchema } from "@/features/analytics/schemas/work-standards.schema";

describe("workStandardsSchema", () => {
  it("accepts a valid set and de-duplicates days", () => {
    expect(workStandardsSchema.parse({ plannedWorkDays: [1, 1, 2], minMeaningfulMinutes: 30, commitLeadMinutes: 120 }).plannedWorkDays).toEqual([1, 2]);
  });
  it("rejects no days, day 7 and out-of-range minutes", () => {
    expect(workStandardsSchema.safeParse({ plannedWorkDays: [], minMeaningfulMinutes: 30, commitLeadMinutes: 120 }).success).toBe(false);
    expect(workStandardsSchema.safeParse({ plannedWorkDays: [7], minMeaningfulMinutes: 30, commitLeadMinutes: 120 }).success).toBe(false);
    expect(workStandardsSchema.safeParse({ plannedWorkDays: [1], minMeaningfulMinutes: 2, commitLeadMinutes: 120 }).success).toBe(false);
    expect(workStandardsSchema.safeParse({ plannedWorkDays: [1], minMeaningfulMinutes: 30, commitLeadMinutes: 2000 }).success).toBe(false);
  });
});
