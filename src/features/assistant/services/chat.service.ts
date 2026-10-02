import "server-only";
import type { ActionContext } from "@/lib/action";
import { fromDbError } from "@/lib/errors";
import type { Json } from "@/types/database";
import { callAi } from "@/features/ai/services/budget.service";
import { CHAT_SYSTEM, chatPrompt } from "@/features/ai/prompts/chat.prompt";
import { sanitizeForPrompt } from "@/features/ai/utils/prompt-input";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { localWeek, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { CHAT_HISTORY, CHAT_VERSION, chatContextText, ChatOutputSchema, normalizeChatProposals } from "../domain/chat";
import { listMessages, loadChatSnapshot, type ChatMessage } from "../queries/chat.queries";

async function insertMessage(ctx: ActionContext, role: "user" | "assistant", content: string, proposalIds: string[] = []) {
  const { data, error } = await ctx.supabase
    .from("assistant_messages")
    .insert({ user_id: ctx.user.id, role, content, proposal_ids: proposalIds })
    .select("id, role, content, proposal_ids, created_at")
    .single();
  if (error) throw fromDbError(error);
  return data as ChatMessage;
}

/**
 * One chat turn (ADR 0042): store the owner's message, build the snapshot, one budgeted structured call, store the
 * normalised `create_task` proposals in the inbox, then the reply. On failure the owner's message stays and the
 * error propagates (no assistant message is written).
 */
export async function sendChatMessage(ctx: ActionContext, message: string, now = new Date()): Promise<void> {
  const history = (await listMessages(ctx.supabase, ctx.user.id, CHAT_HISTORY)).map((m) => ({ role: m.role, content: sanitizeForPrompt(m.content, 1200) }));
  const userMessage = await insertMessage(ctx, "user", message);
  const snapshot = await loadChatSnapshot(ctx.supabase, ctx.user.id, now);
  const result = await callAi(ctx, "chat", {
    task: "assistant_chat",
    system: CHAT_SYSTEM,
    prompt: chatPrompt({ snapshot: chatContextText(snapshot), history, message: sanitizeForPrompt(message, 2000) }),
    schema: ChatOutputSchema,
    effort: "low",
  });

  const proposals = normalizeChatProposals(result.data.proposals, { today: snapshot.now.date, changeIds: new Set(snapshot.changes.map((c) => c.id)) });
  let proposalIds: string[] = [];
  if (proposals.length > 0) {
    const { timezone, settings } = await getSchedulerContext(ctx.supabase, ctx.user.id);
    const weekStart = localWeek(todayLocalDate(timezone, now), timezone, settings.week_starts_on).startDate;
    const { data, error } = await ctx.supabase
      .from("assistant_proposals")
      .insert(
        proposals.map((p, i) => ({
          user_id: ctx.user.id,
          week_start: weekStart,
          kind: "create_task",
          target_key: `chat:${userMessage.id}:${i}`,
          title: p.payload.title.slice(0, 80),
          reason: p.why,
          payload: p.payload as unknown as Json,
          evidence: (p.payload.estimateMinutes ? { estimateMinutes: p.payload.estimateMinutes } : {}) as Json,
          rules_version: CHAT_VERSION,
        })),
      )
      .select("id");
    if (error) throw fromDbError(error);
    proposalIds = data.map((d) => d.id);
  }
  await insertMessage(ctx, "assistant", result.data.reply.slice(0, 4000), proposalIds);
}

/** [새 대화]: the owner's messages go; proposals made from them stay in the inbox. */
export async function clearChat(ctx: ActionContext): Promise<void> {
  const { error } = await ctx.supabase.from("assistant_messages").delete().eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}
