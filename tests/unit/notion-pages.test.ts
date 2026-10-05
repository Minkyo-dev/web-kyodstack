import type { PageObjectResponse } from "@notionhq/client";
import { describe, expect, it } from "vitest";
import { FAKE_GRANT, FAKE_PARENT_PAGE, FakeNotionGateway } from "@/lib/notion/fake-gateway";
import { toNotionPage, toPropertyValues } from "@/lib/notion/mapping";

describe("toPropertyValues", () => {
  it("builds request bodies keyed by property id", () => {
    expect(
      toPropertyValues({
        title: { type: "title", text: "ubiquitous" },
        m: { type: "rich_text", text: "" },
        p: { type: "select", name: "형용사" },
        c: { type: "select", name: null },
        s: { type: "status", name: "새 단어" },
        t: { type: "multi_select", names: ["IT", "일상"] },
        d: { type: "date", start: "2026-10-06" },
        n: { type: "date", start: null },
      }),
    ).toEqual({
      title: { title: [{ type: "text", text: { content: "ubiquitous" } }] },
      m: { rich_text: [] },
      p: { select: { name: "형용사" } },
      c: { select: null },
      s: { status: { name: "새 단어" } },
      t: { multi_select: [{ name: "IT" }, { name: "일상" }] },
      d: { date: { start: "2026-10-06" } },
      n: { date: null },
    });
  });

  it("splits long text into 2000-character pieces", () => {
    const body = toPropertyValues({ m: { type: "rich_text", text: "a".repeat(4500) } }) as { m: { rich_text: { text: { content: string } }[] } };
    expect(body.m.rich_text.map((t) => t.text.content.length)).toEqual([2000, 2000, 500]);
  });
});

describe("toNotionPage", () => {
  it("reads every supported property by id", () => {
    const raw = {
      object: "page", id: "pg", url: "https://www.notion.so/pg", in_trash: false,
      created_time: "2026-10-05T10:00:00.000Z", last_edited_time: "2026-10-05T10:01:00.000Z",
      properties: {
        단어: { id: "title", type: "title", title: [{ plain_text: "ubi" }, { plain_text: "quitous" }] },
        뜻: { id: "m", type: "rich_text", rich_text: [{ plain_text: "어디에나 있는" }] },
        품사: { id: "p", type: "select", select: { name: "형용사" } },
        레벨: { id: "c", type: "select", select: null },
        상태: { id: "s", type: "status", status: { name: "학습 중" } },
        주제: { id: "t", type: "multi_select", multi_select: [{ name: "IT" }] },
        "다음 복습": { id: "d", type: "date", date: { start: "2026-10-07" } },
        생성일: { id: "x", type: "created_time", created_time: "2026-10-05T10:00:00.000Z" },
      },
    } as unknown as PageObjectResponse;
    expect(toNotionPage(raw)).toEqual({
      id: "pg", url: "https://www.notion.so/pg", inTrash: false,
      createdTime: "2026-10-05T10:00:00.000Z", lastEditedTime: "2026-10-05T10:01:00.000Z",
      properties: {
        title: { type: "title", text: "ubiquitous" },
        m: { type: "rich_text", text: "어디에나 있는" },
        p: { type: "select", name: "형용사" },
        c: { type: "select", name: null },
        s: { type: "status", name: "학습 중" },
        t: { type: "multi_select", names: ["IT"] },
        d: { type: "date", start: "2026-10-07" },
        x: { type: "other" },
      },
    });
  });
});

describe("FakeNotionGateway pages", () => {
  const gw = new FakeNotionGateway();
  const auth = { accessToken: FAKE_GRANT.accessToken };

  it("creates, queries by edit time, updates, trashes and pages by 100", async () => {
    const db = await gw.createDatabase(auth, { parentPageId: FAKE_PARENT_PAGE.id, title: "T", properties: [{ name: "단어", type: "title" }] });
    const before = new Date(Date.now() - 60_000).toISOString();
    const page = await gw.createPage(auth, db.dataSourceId, { title: { type: "title", text: "alpha" } });
    expect(page.lastEditedTime.endsWith(":00.000Z")).toBe(true); // minute-rounded like Notion
    expect((await gw.queryPages(auth, db.dataSourceId, { editedOnOrAfter: before })).pages.map((p) => p.id)).toEqual([page.id]);
    expect((await gw.queryPages(auth, db.dataSourceId, { editedOnOrAfter: new Date(Date.now() + 120_000).toISOString() })).pages).toEqual([]);

    const updated = await gw.updatePage(auth, page.id, { title: { type: "title", text: "beta" } });
    expect(updated.properties.title).toEqual({ type: "title", text: "beta" });

    await gw.trashPage(auth, page.id);
    expect((await gw.queryPages(auth, db.dataSourceId, {})).pages).toEqual([]);
    await expect(gw.updatePage(auth, "missing", {})).rejects.toMatchObject({ code: "NOT_FOUND" });

    for (let i = 0; i < 150; i++) await gw.createPage(auth, db.dataSourceId, { title: { type: "title", text: `w${i}` } });
    const first = await gw.queryPages(auth, db.dataSourceId, {});
    expect(first.pages).toHaveLength(100);
    const second = await gw.queryPages(auth, db.dataSourceId, { cursor: first.nextCursor! });
    expect(second.pages).toHaveLength(50);
    expect(second.nextCursor).toBeNull();
  });
});
