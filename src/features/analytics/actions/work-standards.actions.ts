"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { workStandardsSchema } from "../schemas/work-standards.schema";
import { updateWorkStandards } from "../services/work-standards.service";

export async function updateWorkStandardsAction(input: unknown) {
  return runAction("scheduler.work_standards", workStandardsSchema, input, async (data, ctx) => {
    await updateWorkStandards(ctx, data);
    revalidatePath("/scheduler", "layout");
    return null;
  });
}
