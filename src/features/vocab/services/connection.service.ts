import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { getNotionGateway, notionTokenKey } from "@/lib/notion";
import { openToken, sealToken } from "@/lib/notion/token-crypto";
import type { NotionAuth, NotionGateway, OAuthGrant } from "@/lib/notion/types";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { callWithRefresh, grantKeepsDatabase, type ConnectionStatus } from "../domain/connection";
import { parsePropertyIds, type PropertyIds } from "../domain/notion-schema";

export type ConnectionView = {
  status: ConnectionStatus;
  workspaceName: string | null;
  databaseId: string | null;
  dataSourceId: string | null;
  databaseUrl: string | null;
  propertyIds: PropertyIds | null;
};

/** Never includes token columns. */
const VIEW_COLUMNS = "status, workspace_name, database_id, data_source_id, database_url, property_ids";
const NO_DATABASE = { database_id: null, data_source_id: null, database_url: null, property_ids: null, schema_version: null };

type ViewRow = { status: string; workspace_name: string | null; database_id: string | null; data_source_id: string | null; database_url: string | null; property_ids: unknown };

function toView(row: ViewRow): ConnectionView {
  return {
    status: row.status as ConnectionStatus,
    workspaceName: row.workspace_name,
    databaseId: row.database_id,
    dataSourceId: row.data_source_id,
    databaseUrl: row.database_url,
    propertyIds: parsePropertyIds(row.property_ids),
  };
}

export async function getConnectionView(supabase: SupabaseServerClient, userId: string): Promise<ConnectionView | null> {
  const { data, error } = await supabase.from("notion_connections").select(VIEW_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw fromDbError(error);
  return data ? toView(data) : null;
}

/** OAuth callback: exchange the code, then store the sealed tokens for the session user. */
export async function completeOAuth(ctx: ActionContext, code: string, redirectUri: string): Promise<void> {
  const grant = await getNotionGateway().exchangeCode(code, redirectUri);
  await saveGrant(ctx, grant);
}

async function saveGrant(ctx: ActionContext, grant: OAuthGrant): Promise<void> {
  const { data: existing, error: readError } = await ctx.supabase
    .from("notion_connections").select("workspace_id").eq("user_id", ctx.user.id).maybeSingle();
  if (readError) throw fromDbError(readError);
  const key = notionTokenKey();
  const { error } = await ctx.supabase.from("notion_connections").upsert(
    {
      user_id: ctx.user.id,
      status: "active",
      workspace_id: grant.workspaceId,
      workspace_name: grant.workspaceName,
      bot_id: grant.botId,
      access_token_enc: sealToken(grant.accessToken, key),
      refresh_token_enc: grant.refreshToken ? sealToken(grant.refreshToken, key) : null,
      ...(grantKeepsDatabase(existing?.workspace_id, grant) ? {} : NO_DATABASE),
    },
    { onConflict: "user_id" },
  );
  if (error) throw fromDbError(error);
}

async function updateConnection(ctx: ActionContext, patch: Record<string, unknown>): Promise<void> {
  const { error } = await ctx.supabase.from("notion_connections").update(patch).eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}

/** Runs `fn` with a working Notion token: decrypts, refreshes once on 401, and flags reauth when that fails. */
export async function withNotion<T>(ctx: ActionContext, fn: (gateway: NotionGateway, auth: NotionAuth, conn: ConnectionView) => Promise<T>): Promise<T> {
  // Spelled out (not built from VIEW_COLUMNS): supabase-js derives the row type from the literal select string.
  const { data: row, error } = await ctx.supabase
    .from("notion_connections")
    .select("status, workspace_name, database_id, data_source_id, database_url, property_ids, access_token_enc, refresh_token_enc")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!row || row.status === "disconnected" || !row.access_token_enc) throw new AppError("NOTION_NOT_CONNECTED");
  if (row.status === "reauth_required") throw new AppError("NOTION_REAUTH_REQUIRED");
  const key = notionTokenKey();
  const markReauth = () => updateConnection(ctx, { status: "reauth_required" });
  let accessToken: string;
  let refreshToken: string | null;
  try {
    accessToken = openToken(row.access_token_enc, key);
    refreshToken = row.refresh_token_enc ? openToken(row.refresh_token_enc, key) : null;
  } catch {
    log({ action: "notion.token.open", userId: ctx.user.id, success: false, errorCode: "NOTION_REAUTH_REQUIRED" });
    await markReauth();
    throw new AppError("NOTION_REAUTH_REQUIRED");
  }
  const gateway = getNotionGateway();
  const conn = toView(row);
  return callWithRefresh({
    accessToken,
    refreshToken,
    call: (token) => fn(gateway, { accessToken: token }, conn),
    refresh: (rt) => gateway.refresh(rt),
    onRefreshed: (fresh) =>
      updateConnection(ctx, {
        access_token_enc: sealToken(fresh.accessToken, key),
        refresh_token_enc: fresh.refreshToken ? sealToken(fresh.refreshToken, key) : row.refresh_token_enc,
      }),
    onReauthRequired: markReauth,
  });
}

/** Revokes on Notion's side when possible (best effort), then forgets the tokens. The DB ids stay for a reconnect. */
export async function disconnectNotion(ctx: ActionContext): Promise<void> {
  const { data: row, error } = await ctx.supabase.from("notion_connections").select("access_token_enc").eq("user_id", ctx.user.id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!row) return;
  if (row.access_token_enc) {
    try {
      await getNotionGateway().revoke(openToken(row.access_token_enc, notionTokenKey()));
    } catch (revokeError) {
      log({ action: "notion.revoke", userId: ctx.user.id, success: false, errorCode: revokeError instanceof AppError ? revokeError.code : "INTERNAL_ERROR" });
    }
  }
  await updateConnection(ctx, { status: "disconnected", access_token_enc: null, refresh_token_enc: null });
}

export async function forgetDatabase(ctx: ActionContext): Promise<void> {
  await updateConnection(ctx, NO_DATABASE);
}
