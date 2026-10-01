/** Every SYSTEM sentence of the status view (G3). Neutral, evidence-first wording; a unit test checks DENY_LIST. */
export const STATUS_TEXT = {
  identity: (name: string) => `최근 행동이 '${name}' 정체성을 뒷받침하고 있습니다.`,
  paceBehind: "기한까지 남은 기간에 비해 진행이 더딥니다. 범위나 기한을 다시 볼 때일 수 있습니다.",
  collecting: "데이터 수집 중",
  noMission: "진행 중인 목표가 없습니다.",
  offPath: (time: string) => `교체된 전략 작업 ${time}`,
} as const;

/** Judgmental words the status view must never use (umbrella §7). */
export const DENY_LIST = ["부족", "실패", "게으", "못했", "나쁜", "낮은", "only", "fail", "lazy"];
