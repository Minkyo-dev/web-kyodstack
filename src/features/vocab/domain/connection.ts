import { AppError, ERROR_CODES, type ErrorCode } from "@/lib/errors";

export type ConnectionStatus = "active" | "reauth_required" | "disconnected";
export type SetupState = "not_connected" | "reauth" | "pick_page" | "ready";
type Tokens = { accessToken: string; refreshToken: string | null };

export function setupState(conn: { status: ConnectionStatus; databaseId: string | null } | null): SetupState {
  if (!conn || conn.status === "disconnected") return "not_connected";
  if (conn.status === "reauth_required") return "reauth";
  return conn.databaseId ? "ready" : "pick_page";
}

/** A grant for the same workspace keeps the created DB; another workspace cannot reach it, so setup starts over. */
export function grantKeepsDatabase(existingWorkspaceId: string | null | undefined, grant: { workspaceId: string }): boolean {
  return !!existingWorkspaceId && existingWorkspaceId === grant.workspaceId;
}

const isReauth = (e: unknown) => e instanceof AppError && e.code === "NOTION_REAUTH_REQUIRED";

/** 401 → one refresh (when possible) → one retry. Anything that still fails marks the connection for reauth (spec §5.2). */
export async function callWithRefresh<T>(opts: {
  accessToken: string;
  refreshToken: string | null;
  call: (token: string) => Promise<T>;
  refresh: (refreshToken: string) => Promise<Tokens>;
  onRefreshed: (fresh: Tokens) => Promise<void>;
  onReauthRequired: () => Promise<void>;
}): Promise<T> {
  try {
    return await opts.call(opts.accessToken);
  } catch (error) {
    if (!isReauth(error)) throw error;
    if (!opts.refreshToken) {
      await opts.onReauthRequired();
      throw error;
    }
    let fresh: Tokens;
    try {
      fresh = await opts.refresh(opts.refreshToken);
    } catch {
      await opts.onReauthRequired();
      throw new AppError("NOTION_REAUTH_REQUIRED");
    }
    await opts.onRefreshed(fresh);
    try {
      return await opts.call(fresh.accessToken);
    } catch (retryError) {
      if (isReauth(retryError)) await opts.onReauthRequired();
      throw retryError;
    }
  }
}

const OAUTH_MESSAGES: Record<string, string> = {
  oauth_denied: "Notion 연결을 취소했어요.",
  oauth_state: "연결 요청이 만료됐어요. 다시 시도해 주세요.",
  oauth_code: "Notion이 연결 정보를 보내지 않았어요. 다시 시도해 주세요.",
};

/** `?error=` on /english/settings → a safe message. Unknown values show nothing (the param is user-controlled). */
export function connectErrorMessage(param: string | undefined): string | null {
  if (!param) return null;
  if (Object.hasOwn(OAUTH_MESSAGES, param)) return OAUTH_MESSAGES[param];
  return (ERROR_CODES as readonly string[]).includes(param) ? new AppError(param as ErrorCode).message : null;
}
