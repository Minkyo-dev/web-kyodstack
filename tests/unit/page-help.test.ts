import { describe, expect, it } from "vitest";
import { PAGE_HELP_KEYS, pageHelp } from "@/lib/page-help";
import { PLAIN_TERMS, QUEST_TERMS } from "@/lib/terms";

describe("pageHelp", () => {
  it("explains every private page: what it is and how to use it", () => {
    expect(PAGE_HELP_KEYS).toEqual(["scheduler", "directive", "projects", "review", "progress", "finance"]);
    for (const key of PAGE_HELP_KEYS) {
      const h = pageHelp(key, PLAIN_TERMS);
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.concept.length).toBeGreaterThan(0);
      expect(h.howTo.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses the active terminology", () => {
    expect(JSON.stringify(pageHelp("directive", QUEST_TERMS))).toContain("MISSION");
    expect(JSON.stringify(pageHelp("directive", PLAIN_TERMS))).toContain("목표");
    expect(JSON.stringify(pageHelp("projects", QUEST_TERMS))).toContain("메인 퀘스트");
  });
});
