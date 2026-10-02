/** Setup progress of a 변화 (ADR 0038 §5): the five blueprint steps, in order. Pure. */
export const PLAN_STEPS = ["change", "criteria", "path", "rules", "habits"] as const;
export type PlanStep = (typeof PLAN_STEPS)[number];
export type PlanCounts = { criteria: number; hasPath: boolean; rules: number; habits: number };
export type StepState = "done" | "next" | "empty";

export function planSteps(c: PlanCounts): Record<PlanStep, StepState> {
  const done: Record<PlanStep, boolean> = {
    change: true,
    criteria: c.criteria > 0,
    path: c.hasPath,
    rules: c.rules > 0,
    habits: c.habits > 0,
  };
  const next = PLAN_STEPS.find((s) => !done[s]);
  return Object.fromEntries(PLAN_STEPS.map((s) => [s, done[s] ? "done" : s === next ? "next" : "empty"])) as Record<PlanStep, StepState>;
}

export function planDone(c: PlanCounts): number {
  return Object.values(planSteps(c)).filter((s) => s === "done").length;
}

export const STEP_STATE_LABEL: Record<StepState, string> = { done: "완료", next: "다음 단계", empty: "비어 있음" };
