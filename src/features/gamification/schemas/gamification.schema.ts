import { z } from "zod";

export const enableGamificationSchema = z.object({});
export const gamificationSettingsSchema = z.object({
  gamification_enabled: z.boolean(),
  animations_enabled: z.boolean(),
  achievement_toasts: z.boolean(),
});
export type GamificationSettingsInput = z.infer<typeof gamificationSettingsSchema>;

export const swapObjectiveSchema = z.object({ objectiveId: z.uuid() });
export const equipTitleSchema = z.object({ titleKey: z.string().max(40).nullable() });
