import "server-only";
import { AppError, fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { NotionAuth, NotionGateway } from "@/lib/notion/types";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { setupState } from "../domain/connection";
import type { PropertyIds } from "../domain/notion-schema";
import { isPullStale, missingFromNotion, pullSince } from "../domain/sync";
import { getConnectionView, requireDatabase, updateConnection, withNotion, type VocabCtx } from "./connection.service";
import { flushOutbox } from "./outbox.service";
import { markDeleted, upsertPages } from "./word.service";

/** Pages through the data source query, upserting each batch; returns the live page ids it saw. */
async function pullPages(
  ctx: VocabCtx,
  gateway: NotionGateway,
  auth: NotionAuth,
  db: { dataSourceId: string; propertyIds: PropertyIds },
  editedOnOrAfter: string | null,
): Promise<Set<string>> {
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const res = await gateway.queryPages(auth, db.dataSourceId, { editedOnOrAfter: editedOnOrAfter ?? undefined, cursor });
    await upsertPages(ctx, res.pages, db.propertyIds);
    for (const page of res.pages) seen.add(page.id);
    cursor = res.nextCursor ?? undefined;
  } while (cursor);
  return seen;
}

/** Incremental pull (spec §6.2). last_pulled_at advances only after every page succeeded. */
export function pullChanges(ctx: VocabCtx): Promise<{ pulled: number }> {
  return withNotion(ctx, async (gateway, auth, conn) => {
    const db = requireDatabase(conn);
    const startedAt = new Date().toISOString();
    const seen = await pullPages(ctx, gateway, auth, db, pullSince(conn.lastPulledAt));
    await updateConnection(ctx, { last_pulled_at: startedAt });
    return { pulled: seen.size };
  });
}

/** Full pull + deletion check (spec §6.5): mirror rows whose page is no longer live in Notion get deleted_at. */
export function reconcile(ctx: VocabCtx): Promise<{ pulled: number; deleted: number }> {
  return withNotion(ctx, async (gateway, auth, conn) => {
    const db = requireDatabase(conn);
    const startedAt = new Date().toISOString();
    const live = await pullPages(ctx, gateway, auth, db, null);
    const { data, error } = await ctx.supabase.from("vocab_words").select("id, notion_page_id, deleted_at").eq("user_id", ctx.user.id);
    if (error) throw fromDbError(error);
    const gone = missingFromNotion(
      data.map((w) => ({ id: w.id, notionPageId: w.notion_page_id, deleted: w.deleted_at !== null })),
      live,
    );
    await markDeleted(ctx, gone);
    await updateConnection(ctx, { last_pulled_at: startedAt, last_reconciled_at: startedAt });
    return { pulled: live.size, deleted: gone.length };
  });
}

/** Page entry (via after()): send pending write-backs, and pull when the mirror is older than 5 minutes. Never throws. */
export async function maybePull(ctx: VocabCtx): Promise<void> {
  try {
    const view = await getConnectionView(ctx.supabase, ctx.user.id);
    if (setupState(view) !== "ready") return;
    await flushOutbox(ctx, 30);
    if (!isPullStale(view?.lastPulledAt ?? null)) return;
    await pullChanges(ctx);
  } catch (error) {
    log({ action: "vocab.sync.pull", userId: ctx.user.id, success: false, errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR", detail: error instanceof AppError ? undefined : String(error) });
  }
}

/** Nightly job: reconcile every ready connection with the service role (explicit user ids throughout). */
export async function reconcileAll(admin: SupabaseServerClient): Promise<{ users: number; pulled: number; deleted: number; failed: number }> {
  const { data, error } = await admin.from("notion_connections").select("user_id").eq("status", "active").not("data_source_id", "is", null);
  if (error) throw fromDbError(error);
  const summary = { users: data.length, pulled: 0, deleted: 0, failed: 0 };
  for (const { user_id } of data) {
    try {
      const ctx = { supabase: admin, user: { id: user_id } };
      const r = await reconcile(ctx);
      summary.pulled += r.pulled;
      summary.deleted += r.deleted;
      await flushOutbox(ctx, 1000);
    } catch (err) {
      summary.failed += 1;
      log({ action: "job.vocab_sync.user", userId: user_id, success: false, errorCode: err instanceof AppError ? err.code : "INTERNAL_ERROR" });
    }
  }
  log({ action: "job.vocab_sync", success: true, detail: summary });
  return summary;
}
