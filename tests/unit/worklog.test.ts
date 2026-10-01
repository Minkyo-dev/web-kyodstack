import { describe, expect, it } from "vitest";
import { interpretationText, needsConfirmation } from "@/features/ai/utils/worklog";

const base = { delayReason: "environment_issue" as const, scopeChanged: false, unexpectedBlocker: true, blockerType: "technical" as const, confidence: 0.91 };

describe("work-log interpretation", () => {
  it("asks only for confident technical/external blockers", () => {
    expect(needsConfirmation(base)).toBe(true);
    expect(needsConfirmation({ ...base, blockerType: "external" })).toBe(true);
    expect(needsConfirmation({ ...base, blockerType: "personal" })).toBe(false);
    expect(needsConfirmation({ ...base, unexpectedBlocker: false })).toBe(false);
    expect(needsConfirmation({ ...base, confidence: 0.59 })).toBe(false);
  });
  it("renders a short label line", () => {
    expect(interpretationText(base)).toBe("환경 문제 · 범위 변경 없음 · 예상 못한 방해");
    expect(interpretationText({ ...base, delayReason: "none", unexpectedBlocker: false, scopeChanged: true })).toBe("지연 없음 · 범위 변경");
  });
});
