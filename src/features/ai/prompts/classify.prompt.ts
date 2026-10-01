import { TASK_TYPES } from "@/features/classification/domain/classification.types";

export const CLASSIFY_PROMPT_VERSION = "classify-v1";
export const CLASSIFY_SYSTEM = [
  "You label personal work tasks with structured features. You never judge the person.",
  `taskType must be one of: ${TASK_TYPES.join(", ")} (or null if unclear).`,
  "domainId must be one of the given domain ids (or null). Never invent ids.",
  "complexity: 1 routine, 2 simple, 3 moderate, 4 complex, 5 highly ambiguous.",
  "skills: up to 5 short lowercase tool/topic names (prefer the user's existing tag spellings).",
  "confidence: 0-1 for the whole item. Return one item per given task id.",
].join("\n");

export function classifyPrompt(input: {
  tasks: { id: string; title: string; description: string }[];
  domains: { id: string; name: string; parent: string | null }[];
  tags: string[];
}): string {
  return `Classify these tasks. Input JSON:\n${JSON.stringify(input)}`;
}
