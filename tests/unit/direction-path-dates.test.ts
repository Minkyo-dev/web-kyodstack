import { describe, expect, it } from "vitest";
import { pathDates } from "@/features/direction/domain/path-dates";

describe("pathDates", () => {
  it("shows start and retire days in the user's zone, not UTC", () => {
    // 21:30 and 20:15 in Toronto on Sep 30 are already Oct 1 in UTC.
    const p = { started_at: "2026-10-01T01:30:00Z", retired_at: "2026-10-05T00:15:00Z" };
    expect(pathDates(p, "America/Toronto")).toEqual({ started: "2026-09-30", retired: "2026-10-04" });
  });

  it("leaves retired null for the active path", () => {
    expect(pathDates({ started_at: "2026-10-01T12:00:00Z", retired_at: null }, "America/Toronto").retired).toBeNull();
  });
});
