import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { callWithRefresh, connectErrorMessage, grantKeepsDatabase, setupState } from "@/features/vocab/domain/connection";

const reauth = () => new AppError("NOTION_REAUTH_REQUIRED");

describe("setupState", () => {
  it("walks not connected → reauth → pick a page → ready", () => {
    expect(setupState(null)).toBe("not_connected");
    expect(setupState({ status: "disconnected", databaseId: "db" })).toBe("not_connected");
    expect(setupState({ status: "reauth_required", databaseId: "db" })).toBe("reauth");
    expect(setupState({ status: "active", databaseId: null })).toBe("pick_page");
    expect(setupState({ status: "active", databaseId: "db" })).toBe("ready");
  });
});

describe("grantKeepsDatabase", () => {
  it("keeps the DB only when reconnecting to the same workspace", () => {
    expect(grantKeepsDatabase("ws1", { workspaceId: "ws1" })).toBe(true);
    expect(grantKeepsDatabase("ws1", { workspaceId: "ws2" })).toBe(false);
    expect(grantKeepsDatabase(null, { workspaceId: "ws1" })).toBe(false);
    expect(grantKeepsDatabase(undefined, { workspaceId: "ws1" })).toBe(false);
  });
});

describe("callWithRefresh", () => {
  const base = () => ({ onRefreshed: vi.fn(async () => {}), onReauthRequired: vi.fn(async () => {}) });

  it("returns the first result when the token works", async () => {
    const h = base();
    const refresh = vi.fn();
    await expect(callWithRefresh({ ...h, accessToken: "a", refreshToken: "r", call: async (t) => `ok:${t}`, refresh })).resolves.toBe("ok:a");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes once on 401, stores the new tokens and retries", async () => {
    const h = base();
    const call = vi.fn(async (t: string) => {
      if (t === "a") throw reauth();
      return `ok:${t}`;
    });
    const result = await callWithRefresh({ ...h, accessToken: "a", refreshToken: "r", call, refresh: async () => ({ accessToken: "b", refreshToken: "r2" }) });
    expect(result).toBe("ok:b");
    expect(h.onRefreshed).toHaveBeenCalledWith({ accessToken: "b", refreshToken: "r2" });
    expect(h.onReauthRequired).not.toHaveBeenCalled();
  });

  it("marks reauth when there is no refresh token, the refresh fails, or the new token fails too", async () => {
    for (const opts of [
      { refreshToken: null, refresh: async () => ({ accessToken: "b", refreshToken: null }) },
      { refreshToken: "r", refresh: async () => { throw new AppError("NOTION_ERROR"); } },
      { refreshToken: "r", refresh: async () => ({ accessToken: "b", refreshToken: "r" }) },
    ]) {
      const h = base();
      await expect(callWithRefresh({ ...h, ...opts, accessToken: "a", call: async () => { throw reauth(); } })).rejects.toMatchObject({ code: "NOTION_REAUTH_REQUIRED" });
      expect(h.onReauthRequired).toHaveBeenCalledTimes(1);
    }
  });

  it("passes other errors through without refreshing", async () => {
    const h = base();
    const refresh = vi.fn();
    await expect(callWithRefresh({ ...h, accessToken: "a", refreshToken: "r", refresh, call: async () => { throw new AppError("NOTION_RATE_LIMITED"); } })).rejects.toMatchObject({ code: "NOTION_RATE_LIMITED" });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("connectErrorMessage", () => {
  it("explains OAuth outcomes and known codes; ignores anything else", () => {
    expect(connectErrorMessage("oauth_denied")).toBe("Notion 연결을 취소했어요.");
    expect(connectErrorMessage("oauth_state")).toBe("연결 요청이 만료됐어요. 다시 시도해 주세요.");
    expect(connectErrorMessage("oauth_code")).toBe("Notion이 연결 정보를 보내지 않았어요. 다시 시도해 주세요.");
    expect(connectErrorMessage("NOTION_UNAVAILABLE")).toBe(new AppError("NOTION_UNAVAILABLE").message);
    expect(connectErrorMessage("<script>")).toBeNull();
    expect(connectErrorMessage("constructor")).toBeNull();
    expect(connectErrorMessage("__proto__")).toBeNull();
    expect(connectErrorMessage(undefined)).toBeNull();
  });
});
