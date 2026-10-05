import { APIErrorCode, APIResponseError, RequestTimeoutError, type SearchResponse } from "@notionhq/client";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { describeNotionError, toNotionAppError } from "@/lib/notion/errors";
import { FAKE_GRANT, FAKE_PARENT_PAGE, FakeNotionGateway, fakeNotionStore } from "@/lib/notion/fake-gateway";
import { toGrant, toPageRefs, toPropertyConfigs, toPropertyInfos } from "@/lib/notion/mapping";

const api = (code: APIErrorCode, status: number) =>
  new APIResponseError({ code, status, message: "raw secret detail", headers: {}, rawBodyText: "", additional_data: undefined, request_id: undefined });

describe("toNotionAppError (spec §11)", () => {
  it.each([
    [APIErrorCode.Unauthorized, 401, "NOTION_REAUTH_REQUIRED"],
    [APIErrorCode.RateLimited, 429, "NOTION_RATE_LIMITED"],
    [APIErrorCode.ObjectNotFound, 404, "NOT_FOUND"],
    [APIErrorCode.RestrictedResource, 403, "NOT_FOUND"],
    [APIErrorCode.ServiceUnavailable, 503, "NOTION_UNAVAILABLE"],
    [APIErrorCode.InternalServerError, 500, "NOTION_UNAVAILABLE"],
    [APIErrorCode.ValidationError, 400, "NOTION_ERROR"],
  ])("maps %s to %s without leaking the message", (code, status, expected) => {
    const mapped = toNotionAppError(api(code, status));
    expect(mapped.code).toBe(expected);
    expect(mapped.message).not.toContain("raw secret detail");
  });

  it("treats timeouts and network failures as unavailable, keeps AppErrors, hides the rest", () => {
    expect(toNotionAppError(new RequestTimeoutError()).code).toBe("NOTION_UNAVAILABLE");
    expect(toNotionAppError(new TypeError("fetch failed")).code).toBe("NOTION_UNAVAILABLE");
    expect(toNotionAppError(new AppError("CONFLICT")).code).toBe("CONFLICT");
    expect(toNotionAppError(new Error("boom")).code).toBe("NOTION_ERROR");
  });

  it("describes errors for logs with status and code only", () => {
    expect(describeNotionError(api(APIErrorCode.RateLimited, 429))).toEqual({ status: 429, code: "rate_limited", name: "APIResponseError" });
  });
});

describe("mapping", () => {
  it("builds property configs for every supported type", () => {
    expect(
      toPropertyConfigs([
        { name: "단어", type: "title" },
        { name: "레벨", type: "select", options: ["A1", "B1"] },
        { name: "주제", type: "multi_select" },
        { name: "상태", type: "status", options: ["새 단어"] },
        { name: "다음 복습", type: "date" },
        { name: "뜻", type: "rich_text" },
      ]),
    ).toEqual({
      단어: { title: {} },
      레벨: { select: { options: [{ name: "A1" }, { name: "B1" }] } },
      주제: { multi_select: { options: [] } },
      상태: { status: { options: [{ name: "새 단어" }] } },
      "다음 복습": { date: {} },
      뜻: { rich_text: {} },
    });
  });

  it("reads property infos", () => {
    expect(toPropertyInfos({ 단어: { id: "title", name: "단어", type: "title", title: {}, description: null } } as never)).toEqual([
      { id: "title", name: "단어", type: "title" },
    ]);
  });

  it("keeps only real pages that can be a parent, with their titles", () => {
    const page = (id: string, parentType: string, title: string, inTrash = false) => ({
      object: "page", id, url: `https://www.notion.so/${id}`, in_trash: inTrash, parent: { type: parentType },
      properties: { title: { id: "title", type: "title", title: title ? [{ plain_text: title }] : [] } },
    });
    const results = [
      page("p1", "workspace", "Study"),
      page("p2", "page_id", ""),
      page("row", "data_source_id", "A word row"),
      page("trash", "page_id", "Old", true),
      { object: "data_source", id: "ds" },
    ] as unknown as SearchResponse["results"];
    expect(toPageRefs(results)).toEqual([
      { id: "p1", title: "Study", url: "https://www.notion.so/p1" },
      { id: "p2", title: "제목 없음", url: "https://www.notion.so/p2" },
    ]);
  });

  it("turns a token response into a grant", () => {
    expect(toGrant({ access_token: "a", refresh_token: null, workspace_id: "w", workspace_name: "W", bot_id: "b" })).toEqual({
      accessToken: "a", refreshToken: null, workspaceId: "w", workspaceName: "W", botId: "b",
    });
  });
});

describe("FakeNotionGateway", () => {
  const gw = new FakeNotionGateway();
  const auth = { accessToken: FAKE_GRANT.accessToken };

  it("sends the browser straight back to the callback with the state", () => {
    const url = new URL(gw.authorizeUrl("st4te", "http://localhost:3100/api/notion/callback"));
    expect(url.pathname).toBe("/api/notion/callback");
    expect(url.searchParams.get("state")).toBe("st4te");
    expect(url.searchParams.get("code")).toBe("fake-code");
  });

  it("exchanges only its own code and checks the token", async () => {
    await expect(gw.exchangeCode("fake-code", "x")).resolves.toEqual(FAKE_GRANT);
    await expect(gw.exchangeCode("other", "x")).rejects.toMatchObject({ code: "NOTION_ERROR" });
    await expect(gw.searchPages({ accessToken: "stale" })).rejects.toMatchObject({ code: "NOTION_REAUTH_REQUIRED" });
    await expect(gw.searchPages(auth)).resolves.toEqual([FAKE_PARENT_PAGE]);
  });

  it("creates, reads and extends a data source", async () => {
    const db = await gw.createDatabase(auth, { parentPageId: FAKE_PARENT_PAGE.id, title: "T", properties: [{ name: "단어", type: "title" }, { name: "뜻", type: "rich_text" }] });
    expect(db.properties).toEqual([{ id: "title", name: "단어", type: "title" }, { id: "fake1", name: "뜻", type: "rich_text" }]);
    fakeNotionStore().set(db.dataSourceId, [db.properties[0]]); // simulate deleting 뜻 in Notion
    const after = await gw.addProperties(auth, db.dataSourceId, [{ name: "뜻", type: "rich_text" }]);
    expect(after.map((p) => p.name)).toEqual(["단어", "뜻"]);
    await expect(gw.getDataSourceProperties(auth, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(gw.createDatabase(auth, { parentPageId: "other", title: "T", properties: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
