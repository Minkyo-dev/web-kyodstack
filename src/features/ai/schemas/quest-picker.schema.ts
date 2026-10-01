import { z } from "zod";

export const QuestPickerOutputSchema = z.object({
  picks: z.array(z.string()).length(3),
  title: z.string(),
  reason: z.string(),
});
