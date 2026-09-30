import "server-only";
import type { ActionContext } from "@/lib/action";
import { fromDbError } from "@/lib/errors";
import type { WorkStandardsInput } from "../schemas/work-standards.schema";

/** Work days, meaningful-day minimum and commitment lead time (D2 spec §1). */
export async function updateWorkStandards(ctx: ActionContext, input: WorkStandardsInput): Promise<void> {
  const { error } = await ctx.supabase
    .from("scheduler_settings")
    .update({
      planned_work_days: input.plannedWorkDays,
      min_meaningful_minutes: input.minMeaningfulMinutes,
      commit_lead_minutes: input.commitLeadMinutes,
    })
    .eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}
