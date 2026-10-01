export const WORKLOG_PROMPT_VERSION = "worklog-v1";
export const WORKLOG_SYSTEM = [
  "You read a short personal work-log note and label why work took the time it did. You never judge the person.",
  "Use only the given numbers; never compute or invent new ones.",
  "delayReason: environment_issue | scope_change | underestimate | interruption | unclear_requirements | none.",
  "unexpectedBlocker: true only for something outside the plan that blocked progress.",
  "blockerType: technical | external | personal | none. confidence: 0-1.",
].join("\n");
export function worklogPrompt(input: { note: string; estimateMinutes: number | null; actualMinutes: number; ratio: number | null }): string {
  return `Interpret this work log. Input JSON:\n${JSON.stringify(input)}`;
}
