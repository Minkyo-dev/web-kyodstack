import { describe, expect, it } from "vitest";
import { checkCallback, newOAuthState } from "@/lib/notion/oauth-state";

describe("OAuth state (spec §5.2, §12)", () => {
  it("is long, url-safe and unique", () => {
    const a = newOAuthState();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newOAuthState()).not.toBe(a);
  });

  it("accepts only a matching cookie and query state with a code", () => {
    expect(checkCallback({ cookieState: "s1", queryState: "s1", code: "c", error: null })).toEqual({ ok: true, code: "c" });
  });

  it("rejects a missing, expired or forged state before anything else", () => {
    expect(checkCallback({ cookieState: undefined, queryState: "s1", code: "c", error: null })).toEqual({ ok: false, reason: "state" });
    expect(checkCallback({ cookieState: "s1", queryState: null, code: "c", error: null })).toEqual({ ok: false, reason: "state" });
    expect(checkCallback({ cookieState: "s1", queryState: "s2", code: "c", error: null })).toEqual({ ok: false, reason: "state" });
    expect(checkCallback({ cookieState: "s1", queryState: "s1-longer", code: "c", error: null })).toEqual({ ok: false, reason: "state" });
    expect(checkCallback({ cookieState: undefined, queryState: null, code: null, error: "access_denied" })).toEqual({ ok: false, reason: "state" });
  });

  it("reports a cancelled consent and a missing code", () => {
    expect(checkCallback({ cookieState: "s1", queryState: "s1", code: null, error: "access_denied" })).toEqual({ ok: false, reason: "denied" });
    expect(checkCallback({ cookieState: "s1", queryState: "s1", code: null, error: null })).toEqual({ ok: false, reason: "code" });
  });
});
