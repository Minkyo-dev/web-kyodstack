"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { confirmBlocker } from "../services/worklog.service";

const confirmBlockerSchema = z.object({ workLogId: z.uuid(), confirmed: z.boolean() });

/** The user's answer to "외부 방해로 표시할까요?" (F1 spec §3). Only this flag changes stats. */
export async function confirmBlockerAction(input: unknown) {
  return runAction("ai.worklog.confirm", confirmBlockerSchema, input, async ({ workLogId, confirmed }, ctx) => {
    await confirmBlocker(ctx, workLogId, confirmed);
    revalidatePath("/scheduler", "layout");
  });
}
