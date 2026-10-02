import type { Layer } from "./diagnosis";

/** Every SYSTEM sentence of the status view (G3). Neutral, evidence-first wording; a unit test checks DENY_LIST. */
export const STATUS_TEXT = {
  identity: (name: string) => `최근 행동이 '${name}' 정체성에 한 표씩 더하고 있습니다.`,
  paceBehind: "기한까지 남은 기간에 비해 진행이 더딥니다. 범위나 기한을 다시 볼 때일 수 있습니다.",
  collecting: "데이터 수집 중",
  noMission: "진행 중인 결과 목표가 없습니다.",
  offPath: (time: string) => `교체된 시스템 작업 ${time}`,
} as const;

/** Judgmental words the status view must never use (umbrella §7). */
export const DENY_LIST = ["부족", "실패", "게으", "못했", "나쁜", "낮은", "only", "fail", "lazy"];

const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;

/** SYSTEM QUESTION texts for the layer diagnosis (G4). Observations quote the evidence numbers only. */
export const DIAGNOSIS_TEXT = {
  collecting: (n: number, need: number) => `데이터 수집 중 ${n}/${need}`,
  observation: (layer: Layer, e: Record<string, number>): string => {
    switch (layer) {
      case "goal":
        return "기한까지 남은 기간에 비해 진행이 더딥니다. 아래 계층에서는 뚜렷한 신호가 보이지 않습니다.";
      case "strategy":
        return `습관은 ${pct(e.habitRate)} 지켜지고 있지만 최근 4주 동안 결과 목표 진행은 ${pct(e.progressNow)}에 머물러 있습니다. 습관보다 시스템을 먼저 살펴볼 만합니다.`;
      case "tactic":
        return e.intendedMinutes
          ? `현재 실행 의도는 한 번에 ${e.intendedMinutes}분을 전제로 합니다. 최근 실제 세션은 보통 ${e.medianMinutes}분입니다. 의지보다 더 쉽게 시작할 수 있는지를 먼저 살펴볼 만합니다.`
          : `최근 4주 습관 체크는 ${e.habitDone}/${e.habitScheduled}입니다. 실행 의도(언제·어디서)가 지금 생활에 맞는지 살펴볼 만합니다.`;
      case "planning":
        return `최근 4주 이 결과 목표의 계획 블록 ${e.blocks}개 중 ${e.missedOrSkipped}개가 놓치거나 건너뛴 블록입니다. 계획이 실제 가용 시간과 맞는지 살펴볼 만합니다.`;
      case "execution":
        return `최근 작업 기록 ${e.logs}개 중 ${e.blockers}개에 방해 요인이 확인되었습니다. 무엇이 실행을 막았는지 살펴볼 만합니다.`;
      case "recovery":
        return `회복력 지표가 ${e.recovery}입니다. 두 번 연속 놓치지 않도록 다시 시작하는 흐름을 먼저 살펴볼 만합니다.`;
    }
  },
  question: {
    goal: "이 결과가 여전히 추구할 가치가 있나요?",
    strategy: "이 시스템이 결과로 이어지고 있나요?",
    tactic: "이 행동을 더 쉽게 만들 수 있나요?",
    planning: "실제 가용 시간에 맞나요?",
    execution: "무엇이 실행을 막았나요?",
    recovery: "얼마나 빨리 다시 시작할 수 있나요?",
  } satisfies Record<Layer, string>,
  /** `mission` choices open the mission on the directive page; `scheduler` ones open the scheduler. */
  choice: {
    goal: { label: "결과 목표 다시 보기", target: "mission" },
    strategy: { label: "시스템 교체하기", target: "mission" },
    tactic: { label: "실행 의도 조정하기", target: "mission" },
    planning: { label: "캘린더 보기", target: "scheduler" },
    execution: { label: "작업 기록 보기", target: "scheduler" },
    recovery: { label: "오늘 할 일 보기", target: "scheduler" },
  } satisfies Record<Layer, { label: string; target: "mission" | "scheduler" }>,
  keep: "유지",
};
