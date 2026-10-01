import { josa, type Terms } from "@/lib/terms";

/** Help shown behind the (?) icon next to each private page's title: what the page is and how to use it. */
export const PAGE_HELP_KEYS = ["scheduler", "directive", "projects", "review", "progress", "finance"] as const;
export type PageHelpKey = (typeof PAGE_HELP_KEYS)[number];
export type PageHelp = { title: string; concept: string; howTo: string[] };

export function pageHelp(key: PageHelpKey, t: Terms): PageHelp {
  switch (key) {
    case "scheduler":
      return {
        title: "스케줄러",
        concept: `${josa(t.task, "은/는")} '무엇을 할지', 일정 블록은 '언제 하기로 했는지', 작업 세션은 '실제로 언제 했는지'입니다. 셋은 따로 기록되어 계획과 실제를 비교할 수 있습니다.`,
        howTo: [
          `왼쪽 입력창에 ${josa(t.task, "을/를")} 추가합니다. #태그, @영역을 함께 적을 수 있습니다.`,
          `${josa(t.task, "을/를")} 캘린더로 끌어 놓으면 일정 블록이 생깁니다. 블록은 끌어서 옮기거나 길이를 바꿀 수 있습니다.`,
          "▶ 버튼으로 타이머를 시작하면 실제 작업 시간이 기록되고, 마칠 때 집중도를 남깁니다.",
          `${josa(t.task, "을/를")} 누르면 상세에서 ${t.project}, ${t.mission}·${t.protocol} 연결과 예상 시간을 고칠 수 있습니다.`,
          "오른쪽 위에서 주/월 보기를 바꿉니다. 월 보기에서 날짜를 누르면 그 주로 이동합니다.",
          `오늘 해당하는 ${josa(t.habits, "은/는")} 목록 위에서 체크합니다.`,
        ],
      };
    case "directive":
      return {
        title: t.directiveNav,
        concept: `왜(${t.directive}) → 어떤 사람(${t.identity}) → 무엇을(${t.mission}) → 어떻게(${t.path}) → 구체적인 방법(${t.protocol}) → 반복 규칙(${t.habit})으로 이어지는 방향을 적어 두는 곳입니다. 매일 볼 필요는 없고, 방향이 바뀔 때 고칩니다.`,
        howTo: [
          `${josa(t.directive, "을/를")} 한 문장으로 적고, ${josa(t.identity, "을/를")} 추가합니다. 첫 번째 ${josa(t.identity, "이/가")} ${t.className}입니다.`,
          `${josa(t.mission, "을/를")} 만들고 성공 기준(체크 또는 숫자)을 정합니다. 진행률은 이 기준으로 계산됩니다.`,
          `${josa(t.path, "을/를")} 설정하고 그 아래 ${josa(t.protocol, "을/를")} 추가합니다. ${josa(t.path, "을/를")} 교체하면 이전 것은 이력으로 남습니다.`,
          `${josa(t.habit, "은/는")} 요일과 규칙(체크 또는 집중 시간)으로 만들고, ${josa(t.protocol, "과/와")} 연결할 수 있습니다.`,
          `${t.task}·${josa(t.project, "을/를")} ${t.mission}에 연결하면 ${t.growth} 작업으로, 연결하지 않으면 ${t.maintenance} 작업으로 집계됩니다.`,
        ],
      };
    case "projects":
      return {
        title: t.project,
        concept: `${josa(t.project, "은/는")} 목표가 있는 ${t.task} 묶음입니다. 마일스톤으로 단계를 나누고, 진행률은 완료한 ${t.task} 수로 계산됩니다.`,
        howTo: [
          `왼쪽에서 ${josa(t.project, "을/를")} 만들고 선택하면 오른쪽에 상세가 열립니다.`,
          `마일스톤을 추가하고 각 단계에 ${josa(t.task, "을/를")} 바로 추가합니다.`,
          `편집에서 상태·기간을 바꾸고 ${t.mission}에 연결할 수 있습니다.`,
          `더 이상 쓰지 않는 ${josa(t.project, "은/는")} '아카이브로 이동'으로 목록 아래 아카이브 폴더에 넣습니다. 언제든 꺼낼 수 있고, 연결된 ${josa(t.task, "은/는")} 그대로 남습니다.`,
        ],
      };
    case "review":
      return {
        title: "주간 리뷰",
        concept: "한 주의 계획과 실제를 숫자로 돌아보는 곳입니다. 숫자는 기록에서 계산되고, AI는 그 숫자를 해석만 합니다.",
        howTo: [
          "화살표로 지난 주를 오가며 계획 대비 실제 시간, 완료, 일정 변경을 확인합니다.",
          "'AI 해석'을 만들면 잘한 점, 개선할 점, 다음 주 제안이 나옵니다.",
          "제안은 수락해야만 반영됩니다. AI가 데이터를 직접 바꾸지 않습니다.",
        ],
      };
    case "progress":
      return {
        title: "진행",
        concept: `실제 기록으로 계산한 행동 지표와 ${t.mission} 현황을 보는 곳입니다. 점수는 사람을 평가하지 않고, 기록된 행동만 설명합니다.`,
        howTo: [
          "행동 지표(예상 정확도·약속 지킴·꾸준함·회복력)는 기록이 충분해야 표시됩니다.",
          `${t.mission} 현황에서 진행률, 이번 주 ${t.mission} 연결 시간, ${t.habit} 달성, ${t.identity} 근거를 봅니다.`,
          `막힌 ${josa(t.mission, "이/가")} 있으면 SYSTEM QUESTION이 어느 단계를 먼저 볼지 묻습니다. 선택지는 해당 화면으로 이동만 합니다.`,
          "게임 요소(레벨·퀘스트)는 원할 때 켤 수 있고, 꺼도 기록은 유지됩니다.",
        ],
      };
    case "finance":
      return {
        title: "가계부",
        concept:
          "부부가 함께 쓰는 가계부입니다. 대시보드는 '우리 집 돈의 흐름', 캘린더는 '언제 돈이 움직였는지', 날짜 패널은 '그날 무슨 거래가 있었는지'를 보여 줍니다. 모든 숫자는 거래 기록에서 계산됩니다.",
        howTo: [
          "설정 → 계좌에서 개인/공동 계좌를 먼저 추가합니다. 카테고리는 가계 전체가 함께 씁니다.",
          "'거래 추가'로 지출·수입·이체를 기록합니다. 이체(예: 체크카드 → 신용카드 대금)는 지출에 포함되지 않습니다.",
          "캘린더에서 날짜를 누르면 그날의 거래가 열리고, 거래를 눌러 수정하거나 삭제할 수 있습니다.",
          "거래 화면에서 기간·카테고리·계좌·결제자·금액·검색어로 거래를 찾습니다.",
          "배우자는 설정 → 가계 구성원의 초대 코드로 같은 가계에 참여합니다.",
        ],
      };
  }
}
