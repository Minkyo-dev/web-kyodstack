import { describe, expect, it } from "vitest";
import { josa, PLAIN_TERMS, QUEST_TERMS, termsFor } from "@/lib/terms";

describe("josa", () => {
  it("follows the final consonant", () => {
    expect(josa("할 일", "을/를")).toBe("할 일을");
    expect(josa("퀘스트", "을/를")).toBe("퀘스트를");
    expect(josa("프로젝트", "이/가")).toBe("프로젝트가");
    expect(josa("할 일", "이/가")).toBe("할 일이");
    expect(josa("메인 퀘스트", "은/는")).toBe("메인 퀘스트는");
    expect(josa("프로젝트", "과/와")).toBe("프로젝트와");
    expect(josa("할 일", "으로/로")).toBe("할 일로"); // ㄹ takes 로
    expect(josa("메인 퀘스트", "으로/로")).toBe("메인 퀘스트로");
    expect(josa("책", "으로/로")).toBe("책으로");
    expect(josa("XP", "을/를")).toBe("XP를");
  });
});

describe("terms", () => {
  it("switches the nouns", () => {
    expect(termsFor(false)).toBe(PLAIN_TERMS);
    expect(termsFor(true)).toBe(QUEST_TERMS);
    expect(PLAIN_TERMS).toMatchObject({ task: "할 일", project: "프로젝트", mission: "목표", path: "전략", protocol: "실행 방식" });
    expect(QUEST_TERMS).toMatchObject({ task: "퀘스트", project: "메인 퀘스트", directive: "SYSTEM DIRECTIVE", mission: "MISSION" });
  });
});
