"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { equipTitleSchema, swapObjectiveSchema } from "../schemas/gamification.schema";
import { equipTitle } from "../services/achievement.service";
import { swapObjective } from "../services/quest.service";

export async function swapQuestObjectiveAction(input: unknown) {
  return runAction("quest.swap", swapObjectiveSchema, input, async ({ objectiveId }, ctx) => {
    await swapObjective(ctx, objectiveId);
    revalidatePath("/scheduler", "layout");
  });
}

export async function equipTitleAction(input: unknown) {
  return runAction("title.equip", equipTitleSchema, input, async ({ titleKey }, ctx) => {
    await equipTitle(ctx, titleKey);
    revalidatePath("/", "layout");
  });
}
