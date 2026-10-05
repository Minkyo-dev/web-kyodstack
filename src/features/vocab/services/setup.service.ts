import "server-only";
import { AppError, fromDbError } from "@/lib/errors";
import type { NotionPageRef } from "@/lib/notion/types";
import {
  applyRepair, checkSchema, mapCreatedProperties, planRepair, VOCAB_DB_TITLE, VOCAB_PROPERTIES, VOCAB_SCHEMA_VERSION, type SchemaIssue,
} from "../domain/notion-schema";
import { getConnectionView, withNotion, type VocabCtx } from "./connection.service";

export type SchemaState = { state: "ok" } | { state: "mismatch"; issues: SchemaIssue[] } | { state: "missing_db" };

export function listParentPages(ctx: VocabCtx): Promise<NotionPageRef[]> {
  return withNotion(ctx, (gateway, auth) => gateway.searchPages(auth));
}

/** Creates "Kyod 단어장" under a page the user shared (spec §5.2 step 3). One DB per connection. */
export async function createVocabDatabase(ctx: VocabCtx, parentPageId: string): Promise<{ databaseUrl: string }> {
  const view = await getConnectionView(ctx.supabase, ctx.user.id);
  if (view?.databaseId) throw new AppError("CONFLICT", "이미 단어장이 연결돼 있어요.");
  return withNotion(ctx, async (gateway, auth) => {
    const shared = await gateway.searchPages(auth);
    if (!shared.some((p) => p.id === parentPageId)) throw new AppError("NOT_FOUND", "공유된 페이지 중에서 골라 주세요.");
    const db = await gateway.createDatabase(auth, { parentPageId, title: VOCAB_DB_TITLE, properties: VOCAB_PROPERTIES });
    const propertyIds = mapCreatedProperties(db.properties);
    const { error } = await ctx.supabase
      .from("notion_connections")
      .update({ database_id: db.databaseId, data_source_id: db.dataSourceId, database_url: db.url, property_ids: propertyIds, schema_version: VOCAB_SCHEMA_VERSION })
      .eq("user_id", ctx.user.id);
    if (error) throw fromDbError(error);
    return { databaseUrl: db.url };
  });
}

export function inspectSchema(ctx: VocabCtx): Promise<SchemaState> {
  return withNotion(ctx, async (gateway, auth, conn) => {
    if (!conn.dataSourceId || !conn.propertyIds) return { state: "missing_db" };
    try {
      const issues = checkSchema(conn.propertyIds, await gateway.getDataSourceProperties(auth, conn.dataSourceId));
      return issues.length ? { state: "mismatch", issues } : { state: "ok" };
    } catch (error) {
      if (error instanceof AppError && error.code === "NOT_FOUND") return { state: "missing_db" };
      throw error;
    }
  });
}

/** Re-adds missing or retyped properties (uniquely named) and adopts their ids (spec §5.3). */
export function repairSchema(ctx: VocabCtx): Promise<{ repaired: number }> {
  return withNotion(ctx, async (gateway, auth, conn) => {
    if (!conn.dataSourceId || !conn.propertyIds) throw new AppError("NOTION_NOT_CONNECTED");
    const actual = await gateway.getDataSourceProperties(auth, conn.dataSourceId);
    const plan = planRepair(checkSchema(conn.propertyIds, actual), actual);
    if (plan.length === 0) return { repaired: 0 };
    const after = await gateway.addProperties(auth, conn.dataSourceId, plan.map((p) => p.spec));
    const { error } = await ctx.supabase
      .from("notion_connections").update({ property_ids: applyRepair(conn.propertyIds, plan, after) }).eq("user_id", ctx.user.id);
    if (error) throw fromDbError(error);
    return { repaired: plan.length };
  });
}
