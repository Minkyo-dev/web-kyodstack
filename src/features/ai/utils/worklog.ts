import type { WorklogOutput } from "../schemas/worklog.schema";

export const DELAY_LABEL: Record<WorklogOutput["delayReason"], string> = {
  environment_issue: "환경 문제",
  scope_change: "범위 변경",
  underestimate: "예상보다 큰 작업",
  interruption: "중간 방해",
  unclear_requirements: "요구사항 불명확",
  none: "지연 없음",
};

export function needsConfirmation(i: WorklogOutput): boolean {
  return i.unexpectedBlocker && (i.blockerType === "technical" || i.blockerType === "external") && i.confidence >= 0.6;
}

export function interpretationText(i: WorklogOutput): string {
  const parts = [DELAY_LABEL[i.delayReason]];
  if (i.scopeChanged) parts.push("범위 변경");
  else if (i.delayReason !== "none") parts.push("범위 변경 없음");
  if (i.unexpectedBlocker) parts.push("예상 못한 방해");
  return parts.join(" · ");
}
