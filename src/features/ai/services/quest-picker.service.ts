import "server-only";
import type { ActionContext } from "@/lib/action";
import { QUEST_PICKER_SYSTEM, questPickerPrompt } from "../prompts/quest-picker.prompt";
import { QuestPickerOutputSchema } from "../schemas/quest-picker.schema";
import { sanitizeForPrompt } from "../utils/prompt-input";
import { callAi } from "./budget.service";

type PickerInput = {
  candidates: { key: string; label: string; target: number }[];
  capacity: number | null;
  plannedMinutes: number;
  plannedTasks: number;
  topTitles: string[];
  stats: Record<string, number | null>;
};

/** AI picks 3 candidate keys (F2 spec §2). Plain data in/out; the gamification validator decides. Never throws. */
export async function pickQuestObjectives(
  ctx: ActionContext,
  input: PickerInput,
): Promise<{ picks: string[]; title: string; reason: string } | null> {
  try {
    const result = await callAi(ctx, "quest_picker", {
      task: "quest_picker",
      system: QUEST_PICKER_SYSTEM,
      prompt: questPickerPrompt({
        ...input,
        candidates: input.candidates.map((c) => ({ ...c, label: sanitizeForPrompt(c.label, 120) })),
        topTitles: input.topTitles.map((t) => sanitizeForPrompt(t, 200)),
      }),
      schema: QuestPickerOutputSchema,
      effort: "low",
    });
    return result.data;
  } catch {
    return null;
  }
}
