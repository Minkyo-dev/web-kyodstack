export const QUEST_PICKER_PROMPT_VERSION = "quest-picker-v1";
export const QUEST_PICKER_SYSTEM = [
  "You pick today's daily quest for a personal work scheduler from a fixed candidate list.",
  "Return exactly 3 different candidate keys (e.g. c1) that together make a realistic, motivating day given the capacity,",
  "today's plan and the weaker stats. Never invent keys or targets.",
  "title: Korean, at most 20 characters. reason: one Korean sentence, at most 80 characters, no numbers.",
].join("\n");

export function questPickerPrompt(input: unknown): string {
  return `Pick today's quest. Input JSON:\n${JSON.stringify(input)}`;
}
