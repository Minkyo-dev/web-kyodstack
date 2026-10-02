import { describe, expect, it } from "vitest";
import { PAGE_HELP_KEYS, pageHelp } from "@/lib/page-help";

describe("pageHelp", () => {
  it("explains every private page: what it is and how to use it", () => {
    expect(PAGE_HELP_KEYS).toEqual(["scheduler", "directive", "projects", "review", "progress", "finance"]);
    for (const key of PAGE_HELP_KEYS) {
      const h = pageHelp(key);
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.concept.length).toBeGreaterThan(0);
      expect(h.howTo.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses the work vocabulary and keeps Solo Leveling words in the growth tab (ADR 0037, 0038)", () => {
    const directive = JSON.stringify(pageHelp("directive"));
    for (const w of ["비전", "역할", "변화", "달성 기준", "프로세스", "실행 규칙", "습관"]) expect(directive).toContain(w);
    for (const w of ["결과 목표", "실행 의도", "메인 퀘스트", "OUTCOME"]) expect(directive).not.toContain(w);
    expect(pageHelp("progress").title).toBe("성장");
    expect(JSON.stringify(pageHelp("progress"))).toContain("성취 로그");
  });
});
