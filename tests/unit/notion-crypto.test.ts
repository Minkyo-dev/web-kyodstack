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
