import { describe, expect, it } from "vitest";
import { sanitizeForPrompt } from "@/features/ai/utils/prompt-input";

describe("sanitizeForPrompt", () => {
  it("strips control characters, collapses whitespace and caps length", () => {
    expect(sanitizeForPrompt("a\u0000b\u0007  c\n\n d", 100)).toBe("ab c d");
    expect(sanitizeForPrompt("x".repeat(250), 200)).toHaveLength(200);
    expect(sanitizeForPrompt(null, 10)).toBe("");
  });
});
