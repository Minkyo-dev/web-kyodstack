"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { reanalyze, updateAnalysisSchedule } from "../services/analysis.service";

const scheduleSchema = z.object({
  weekday: z.number().int().min(0).max(6).nullable(),
  hour: z.number().int().min(0).max(23),
});

export async function reanalyzeAction() {
  return runAction("ai.analysis.reanalyze", z.object({}), {}, async (_d, ctx) => {
    await reanalyze(ctx);
    revalidatePath("/scheduler/progress");
  });
}

export async function updateAnalysisScheduleAction(input: unknown) {
  return runAction("ai.analysis.schedule", scheduleSchema, input, async (data, ctx) => {
    await updateAnalysisSchedule(ctx, data);
    revalidatePath("/scheduler/progress");
  });
}
