import { describe, expect, it } from "vitest";
import { AppError, fail, fromDbError } from "@/lib/errors";

describe("fromDbError", () => {
  it("maps unique violation to CONFLICT", () => {
    expect(fromDbError({ code: "23505" }).code).toBe("CONFLICT");
  });
  it("hides unknown DB errors", () => {
    const e = fromDbError({ code: "XX000", message: "relation secret_table ..." });
    expect(e.code).toBe("DATABASE_ERROR");
    expect(e.message).not.toContain("secret_table");
  });
});

describe("fail", () => {
  it("never leaks non-AppError messages", () => {
    const r = fail(new Error("SELECT * FROM auth.users"));
    expect(r).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    if (!r.ok) expect(r.message).not.toContain("auth.users");
  });
  it("passes AppError through", () => {
    expect(fail(new AppError("ACTIVE_TIMER_EXISTS"))).toMatchObject({
      ok: false,
      code: "ACTIVE_TIMER_EXISTS",
    });
  });
});

describe("Notion error codes", () => {
  it("have user-facing Korean messages", () => {
    for (const code of ["NOTION_NOT_CONNECTED", "NOTION_REAUTH_REQUIRED", "NOTION_RATE_LIMITED", "NOTION_UNAVAILABLE", "NOTION_SCHEMA_MISMATCH", "NOTION_ERROR"] as const) {
      expect(new AppError(code).message).toMatch(/[가-힣]/);
    }
  });
});
