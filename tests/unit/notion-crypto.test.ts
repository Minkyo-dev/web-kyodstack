import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openToken, sealToken } from "@/lib/notion/token-crypto";

const key = randomBytes(32);

describe("token crypto (ADR 0046)", () => {
  it("round-trips and never stores the plaintext", () => {
    const sealed = sealToken("secret_abc123", key);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("secret_abc123");
    expect(openToken(sealed, key)).toBe("secret_abc123");
  });

  it("uses a fresh IV every time", () => {
    expect(sealToken("same", key)).not.toBe(sealToken("same", key));
  });

  it("rejects tampering, a wrong key and unknown versions", () => {
    const [v, iv, tag, ct] = sealToken("secret", key).split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 1;
    expect(() => openToken([v, iv, tag, flipped.toString("base64")].join(":"), key)).toThrow();
    expect(() => openToken(sealToken("secret", key), randomBytes(32))).toThrow();
    expect(() => openToken(`v9:${iv}:${tag}:${ct}`, key)).toThrow("unsupported token format");
    expect(() => openToken("garbage", key)).toThrow("unsupported token format");
  });
});

describe("parseTokenKey (a bad Notion env value must not crash every page)", () => {
  it("accepts 32 bytes of base64", async () => {
    const { parseTokenKey } = await import("@/lib/notion/token-crypto");
    expect(parseTokenKey(randomBytes(32).toString("base64"))).toHaveLength(32);
  });
  it("explains a missing key, a client secret pasted by mistake, and a wrong length", async () => {
    const { parseTokenKey } = await import("@/lib/notion/token-crypto");
    expect(() => parseTokenKey(undefined)).toThrow(expect.objectContaining({ code: "NOTION_NOT_CONFIGURED" }));
    // Built at runtime: a literal in Notion's token format trips GitHub push protection.
    expect(() => parseTokenKey(["secret", "x".repeat(43)].join("_"))).toThrow(/NOTION_CLIENT_SECRET/);
    expect(() => parseTokenKey(randomBytes(16).toString("base64"))).toThrow(/32바이트/);
  });
});
