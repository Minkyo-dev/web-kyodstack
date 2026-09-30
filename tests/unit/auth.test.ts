import { describe, expect, it } from "vitest";
import { loginSchema, safeNextPath } from "@/features/auth/schemas/login.schema";

describe("safeNextPath", () => {
  it("defaults to /scheduler", () => {
    expect(safeNextPath(undefined)).toBe("/scheduler");
    expect(safeNextPath("")).toBe("/scheduler");
  });
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/scheduler/review")).toBe("/scheduler/review");
  });
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBe("/scheduler");
    expect(safeNextPath("//evil.example")).toBe("/scheduler");
  });
});

describe("loginSchema", () => {
  it("rejects malformed email", () => {
    expect(loginSchema.safeParse({ email: "x", password: "p" }).success).toBe(false);
  });
});
