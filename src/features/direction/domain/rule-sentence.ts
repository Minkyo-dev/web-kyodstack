/** 실행 규칙 sentence builder (ADR 0038 §4): when · where · what, joined into the protocol title (≤ 80 chars). */
export const RULE_LIMITS = { cue: 30, place: 15, action: 30 } as const;

export type RuleParts = { cue: string; place: string; action: string };

/** "출근 후 커피를 내리면, 책상에서 25분 쉐도잉". The place is optional; a cue without a trailing comma gets one. */
export function composeRule({ cue, place, action }: RuleParts): string {
  const c = cue.trim().replace(/[,，]\s*$/, "");
  const p = place.trim().replace(/에서$/, "");
  const a = action.trim();
  return [c, [p && `${p}에서`, a].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}
