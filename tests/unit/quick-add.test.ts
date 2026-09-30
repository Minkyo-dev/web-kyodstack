import { describe, expect, it } from "vitest";
import { activeToken, parseQuickAdd, sameName, wouldCycle } from "@/features/classification/utils/quick-add";

describe("parseQuickAdd", () => {
  it("extracts #tags and @domain, keeps the rest as the title", () => {
    expect(parseQuickAdd("Snowflake RBAC 공부 #snowflake @DataEng")).toEqual({
      title: "Snowflake RBAC 공부",
      tags: ["snowflake"],
      domain: "DataEng",
    });
  });
  it("supports Korean, digits, - and _ in tokens; tokens anywhere", () => {
    expect(parseQuickAdd("#영어 듣기 연습 #listening_2 @어학")).toEqual({
      title: "듣기 연습",
      tags: ["영어", "listening_2"],
      domain: "어학",
    });
  });
  it("an email address is not a domain token", () => {
    expect(parseQuickAdd("메일 보내기 a@b.com")).toEqual({ title: "메일 보내기 a@b.com", tags: [], domain: null });
  });
  it("the last @ wins; tags are deduplicated case-insensitively", () => {
    expect(parseQuickAdd("x #A #a @one @two")).toEqual({ title: "x", tags: ["A"], domain: "two" });
  });
  it("only tokens → empty title (the caller rejects it)", () => {
    expect(parseQuickAdd("#a @b").title).toBe("");
  });
  it("a lone # or @ stays in the title", () => {
    expect(parseQuickAdd("C# 공부 @ 집")).toEqual({ title: "C# 공부 @ 집", tags: [], domain: null });
  });
});

describe("activeToken (autocomplete trigger)", () => {
  it("finds the token under the caret", () => {
    expect(activeToken("공부 #sno", 7)).toEqual({ kind: "#", query: "sno", start: 3 });
    expect(activeToken("공부 @", 4)).toEqual({ kind: "@", query: "", start: 3 });
  });
  it("none inside a word or after a space", () => {
    expect(activeToken("a@b", 3)).toBeNull();
    expect(activeToken("#abc ", 5)).toBeNull();
  });
});

describe("wouldCycle", () => {
  const d = [
    { id: "root", name: "Root", parent_id: null },
    { id: "mid", name: "Mid", parent_id: "root" },
    { id: "leaf", name: "Leaf", parent_id: "mid" },
  ];
  it("rejects a descendant or itself as the new parent", () => {
    expect(wouldCycle(d, "root", "leaf")).toBe(true);
    expect(wouldCycle(d, "mid", "mid")).toBe(true);
  });
  it("allows other parents and none", () => {
    expect(wouldCycle(d, "leaf", "root")).toBe(false);
    expect(wouldCycle(d, "mid", null)).toBe(false);
  });
});

describe("sameName", () => {
  it("case-insensitive and trimmed", () => {
    expect(sameName(" Snowflake", "snowflake ")).toBe(true);
    expect(sameName("a", "b")).toBe(false);
  });
});
