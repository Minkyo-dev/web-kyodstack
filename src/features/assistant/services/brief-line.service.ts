import "server-only";
import type { ActionContext } from "@/lib/action";
import { log } from "@/lib/logger";
import { callAi } from "@/features/ai/services/budget.service";
import { BRIEF_LINE_PROMPT_VERSION, BRIEF_LINE_SYSTEM, briefLinePrompt } from "@/features/ai/prompts/brief-line.prompt";
import { BriefLineOutputSchema } from "@/features/ai/schemas/brief-line.schema";
import { sanitizeForPrompt } from "@/features/ai/utils/prompt-input";
import { localDayRange } from "@/features/scheduler/utils/timezone";
import { acceptableLine, briefFacts, type Brief } from "../domain/brief";

const MAX_ATTEMPTS_PER_DAY = 3;

/**
 * Today's coach line (ADR 0039 §3): at most once per local day, ≤ 3 attempts, inside the AI budget. Runs after the
 * response (`after()`); never throws. Nothing is stored when the call fails or the line is rejected.
 */
export async function ensureBriefLine(ctx: ActionContext, brief: Brief, today: string, timezone: string): Promise<void> {
  try {
    const { start } = localDayRange(today, timezone);
    const [existing, attempts] = await Promise.all([
      ctx.supabase.from("assistant_briefs").select("id").eq("user_id", ctx.user.id).eq("local_date", today).maybeSingle(),
      ctx.supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id).eq("kind", "brief_line").gte("created_at", start),
    ]);
    if (existing.data || (attempts.count ?? 0) >= MAX_ATTEMPTS_PER_DAY) return;
    const facts = briefFacts(brief);
    const result = await callAi(ctx, "brief_line", {
      task: "brief_line",
      system: BRIEF_LINE_SYSTEM,
      prompt: briefLinePrompt({
        ...facts,
        oneThing: facts.oneThing && { ...facts.oneThing, title: sanitizeForPrompt(facts.oneThing.title, 120) },
        habits: facts.habits && { ...facts.habits, missedYesterday: facts.habits.missedYesterday.map((t) => sanitizeForPrompt(t, 80)) },
        nextChangeStep: facts.nextChangeStep && sanitizeForPrompt(facts.nextChangeStep, 160),
        yesterdayWin: facts.yesterdayWin && sanitizeForPrompt(facts.yesterdayWin, 280),
      }),
      schema: BriefLineOutputSchema,
      effort: "low",
    });
    if (!acceptableLine(result.data.line)) return;
    // A concurrent tab may have written first: the unique (user_id, local_date) keeps one line.
    await ctx.supabase
      .from("assistant_briefs")
      .upsert(
        { user_id: ctx.user.id, local_date: today, line: result.data.line, model: result.model, prompt_version: BRIEF_LINE_PROMPT_VERSION },
        { onConflict: "user_id,local_date", ignoreDuplicates: true },
      );
  } catch (error) {
    log({ action: "assistant.brief_line", userId: ctx.user.id, success: false, errorCode: "INTERNAL_ERROR", detail: String(error) });
  }
}
