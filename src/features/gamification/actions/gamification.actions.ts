"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { enableGamificationSchema, gamificationSettingsSchema } from "../schemas/gamification.schema";
import { enableGamification, updateGamificationSettings } from "../services/progress.service";

export async function enableGamificationAction() {
  return runAction("gamification.enable", enableGamificationSchema, {}, async (_d, ctx) => {
    const r = await enableGamification(ctx);
    revalidatePath("/", "layout");
    return r;
  });
}

export async function updateGamificationSettingsAction(input: unknown) {
  return runAction("gamification.settings", gamificationSettingsSchema, input, async (data, ctx) => {
    await updateGamificationSettings(ctx, data);
    revalidatePath("/", "layout");
  });
}
