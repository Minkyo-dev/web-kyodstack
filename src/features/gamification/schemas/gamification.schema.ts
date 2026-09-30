import { z } from "zod";

export const enableGamificationSchema = z.object({});
export const gamificationSettingsSchema = z.object({
  gamification_enabled: z.boolean(),
  animations_enabled: z.boolean(),
  achievement_toasts: z.boolean(),
});
export type GamificationSettingsInput = z.infer<typeof gamificationSettingsSchema>;
