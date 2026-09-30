import { describe, expect, it } from "vitest";
import { decideClaim } from "@/features/jobs/utils/claim";

const now = new Date("2026-09-30T10:00:00Z");
const row = (status: string, attempts = 1, minutesAgo = 1) => ({
  status,
  attempts,
  started_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
});

describe("decideClaim (spec §47 idempotency)", () => {
  it("first invocation inserts", () => expect(decideClaim(null, now)).toBe("insert"));
  it("duplicate invocation after success or skip does nothing", () => {
    expect(decideClaim(row("succeeded"), now)).toBe("skip");
    expect(decideClaim(row("skipped"), now)).toBe("skip");
  });
  it("concurrent invocation while running does nothing", () =>
    expect(decideClaim(row("running", 1, 5), now)).toBe("skip"));
  it("retries after partial failure or a crashed (stale) run", () => {
    expect(decideClaim(row("failed"), now)).toBe("retry");
    expect(decideClaim(row("running", 1, 45), now)).toBe("retry");
  });
  it("stops after 3 attempts", () => expect(decideClaim(row("failed", 3), now)).toBe("skip"));
});
