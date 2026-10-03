import Link from "next/link";
import { josa, TERMS as t } from "@/lib/terms";

/**
 * The planner's user manual: one long page. Atomic Habits ideas in work terms, Solo Leveling-style tracking (ADR 0037),
 * then routines, features and fixes. Static copy; nouns come from TERMS so it matches the screens.
 */
export function PlannerManual() {
  const toc = [
    { id: "principles", label: "핵심 원칙" },
    { id: "setup", label: "처음 30분 세팅" },
    { id: "daily", label: "하루 루틴" },
    { id: "weekly", label: "주간 루틴" },
    { id: "monthly", label: "월간 점검" },
    { id: "laws", label: "4가지 법칙으로 쓰기" },
    { id: "growth", label: "성장 시스템" },
    { id: "features", label: "탭별 기능" },
    { id: "stuck", label: "막혔을 때" },
    { id: "rules", label: "기록과 AI 원칙" },
  ];

  return (
    <div className="mx-auto flex max-w-5xl gap-8 p-4 md:p-6">
      <nav aria-label="매뉴얼 목차" className="sticky top-6 hidden h-fit w-40 shrink-0 text-sm lg:block">
        <p className="mb-2 text-xs font-medium text-muted-foreground">목차</p>
        <ol className="space-y-1">
          {toc.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="min-w-0 flex-1 space-y-10 text-sm leading-relaxed">
        <header className="space-y-2">
          <h2 className="text-2xl font-semibold">플래너 매뉴얼</h2>
          <p className="text-muted-foreground">
            이 플래너는 『아토믹 해빗』의 생각을 {t.project}·{t.milestone}·{t.task} 같은 업무 용어로 옮긴 도구입니다. 구조는
            업무 용어로 짜고, 이룬 것은 『나 혼자만 레벨업』처럼 레벨·퀘스트·업적·성취 로그로 계속 쌓아 보여 줍니다. 이 문서는 처음
            세팅부터 하루·주간·월간 루틴, 막혔을 때 대처법까지 순서대로 정리했습니다.
          </p>
          <ol aria-label="매뉴얼 목차" className="flex flex-wrap gap-x-3 gap-y-1 text-xs lg:hidden">
            {toc.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </header>

        <Section id="principles" title="1. 핵심 원칙">
          <p>아토믹 해빗은 변화를 세 겹(정체성·과정·결과)으로 나눕니다. 플래너는 각 개념을 업무 용어로 부릅니다.</p>
          <Table
            head={["플래너 용어", "아토믹 해빗 개념", "질문"]}
            rows={[
              [t.directive, "신념", "왜 이 일을 하는가?"],
              [t.identity, "정체성", "나는 어떤 사람(역할)이 되고 싶은가?"],
              [t.mission, "결과", `무엇을 얻고 싶은가? (${t.criteria}로 측정)`],
              [t.path, "시스템", "결과를 만드는 반복 과정은 무엇인가?"],
              [t.protocol, "실행 의도", "언제·어디서·무엇을 할 것인가?"],
              [`${t.project} · ${t.milestone} · ${t.task}`, "행동", "이번에 끝낼 일과 중간 지점, 지금 할 한 가지"],
              [t.habit, "습관", "매번 반복하는 작은 행동은?"],
            ]}
          />
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>{t.identity}에서 시작합니다.</b> ‘책을 쓰고 싶다’({t.mission})보다 ‘나는 매일 쓰는 사람이다’({t.identity})가 오래 갑니다.
            </li>
            <li>
              <b>행동은 {t.identity}에 던지는 한 표입니다.</b> 타이머로 기록한 세션 하나, 체크한 {t.habit} 하나가 모두 표로 쌓이고,{" "}
              <i>성장</i> 탭에서 {josa(t.identity, "이/가")} 받은 표를 볼 수 있습니다.
            </li>
            <li>
              <b>{t.mission}보다 {t.path}입니다.</b> {josa(t.mission, "은/는")} 방향을 정할 뿐이고, 실제로 나아가게 하는 건{" "}
              {josa(t.path, "과/와")} 그 안의 반복 행동입니다.
            </li>
            <li>
              <b>매일 1%.</b> 하루의 큰 성과보다 작은 개선이 복리로 쌓입니다. 결과가 바로 보이지 않는 시기(잠재력의 정체기)를 지나도록
              기록이 도와줍니다.
            </li>
          </ul>
        </Section>

        <Section id="setup" title="2. 처음 30분 세팅">
          <p>아래 순서대로 한 번만 해 두면 이후에는 하루 5분이면 충분합니다.</p>
          <Steps
            items={[
              <>
                <TabLink href="/scheduler/directive">{t.directiveNav}</TabLink> 탭에서 {josa(t.directive, "을/를")} 한 문장으로 적습니다. 예:
                “배운 것을 나누며 성장하는 삶”.
              </>,
              <>
                {josa(t.identity, "을/를")} 1~3개 추가합니다. ‘나는 ~한 사람이다’에 들어갈 말로 짧게 씁니다(예: 매일 쓰는 개발자,
                운동하는 사람). 첫 번째가 {t.className}입니다.
              </>,
              <>
                <b>새 {t.mission}</b>를 누릅니다. 안내에 따라 ① 어떤 {josa(t.mission, "을/를")} 원하는지(예: ‘영어로 회의하는 사람이 된다’)
                → ② {t.criteria}(체크형 ‘발표 녹화 공개’ 또는 숫자형 ‘회의 3번’) → ③ {t.path}(어떻게 반복할지와 <b>포기하는 것</b>) → ④{" "}
                {t.protocol}(언제·어디서·무엇을)을 차례로 적습니다. 첫 단계만 필수이고, 나머지는 건너뛰었다가 나중에 채워도 됩니다.
                처음엔 동시에 3개를 넘기지 마세요.
              </>,
              <>
                {josa(t.protocol, "은/는")} ‘언제(신호)’, ‘어디서’, ‘무엇을’ 칸을 채우면 “출근 후 커피를 내리면, 책상에서 25분 쉐도잉”
                같은 문장이 됩니다. 마지막 단계에서 바로 매일 체크할 {josa(t.habit, "으로/로")} 만들 수 있습니다.
              </>,
              <>
                오른쪽 <b>습관 설계도</b>에서 빈 단계(‘다음 단계’ 표시)를 채웁니다. {josa(t.habit, "은/는")} 반복할 {josa(t.protocol, "을/를")}
                고르고 요일을 정합니다. <b>직접 체크</b>하거나, <b>타이머로 집중하면 자동 체크</b>되게 할 수 있습니다.
              </>,
              <>
                <TabLink href="/scheduler/progress">성장</TabLink> 탭의 작업 기준에서 근무 요일과 ‘의미 있게 일한 날’의 최소 시간을
                정합니다. 꾸준함·계획 이행·회복력이 이 기준으로 계산됩니다.
              </>,
            ]}
          />
          <Tip>
            처음 만드는 {josa(t.habit, "은/는")} <b>2분 규칙</b>으로 작게 만드세요. ‘30분 운동’ 대신 ‘운동화 신기’처럼, 하기
            싫은 날에도 할 수 있는 크기가 좋습니다. {josa(t.habit, "은/는")} 먼저 자리를 잡고, 그다음에 키웁니다.
          </Tip>
        </Section>

        <Section id="daily" title="3. 하루 루틴">
          <h3 className="font-semibold">아침: 5분 계획</h3>
          <Steps
            items={[
              <>
                <TabLink href="/scheduler">스케줄러</TabLink>를 열면 맨 위 <b>아침 브리핑</b>이 오늘의 한 가지, 오늘의{" "}
                {t.habits}(어제 놓친 것 포함), 작업량, 다음 {t.mission} 단계를 한 번에 보여 줍니다. 오늘의 한 가지는 ▶로 바로 시작합니다.
              </>,
              <>
                입력창에 {josa(t.task, "을/를")} 적습니다. <Code>보고서 초안 #글쓰기 @업무</Code>처럼 <Code>#태그</Code>와 <Code>@영역</Code>을
                함께 쓰면 분류가 한 번에 끝납니다.
              </>,
              <>
                {josa(t.task, "을/를")} 캘린더로 끌어다 놓아 시간을 정합니다. 언제 할지를 미리 정해 두는 것이 곧 {t.protocol}입니다. 시간이
                정해진 일은 ‘언제 하지?’라는 고민이 사라집니다.
              </>,
              <>
                하루 계획이 평소 작업량보다 크게 많으면 경고가 뜹니다. <b>계획 조정</b>을 누르면 덜 중요한 일정부터 다음 날 같은 시각으로
                옮길 후보를 골라 줍니다. 확인하기 전에는 아무것도 옮겨지지 않습니다.
              </>,
            ]}
          />
          <h3 className="font-semibold">낮: 실행과 기록</h3>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>일정 블록이나 {t.task}의 ▶ 버튼으로 타이머를 시작합니다. 실제 시간은 계획과 따로 기록되어 계획을 덮어쓰지 않습니다.</li>
            <li>잠깐 멈출 땐 일시정지하고 이유를 남깁니다. 나중에 무엇이 흐름을 끊는지 패턴으로 보입니다.</li>
            <li>다른 일로 넘어가면 작업 전환 창에서 지금 일을 마칠지, 보류할지 고릅니다.</li>
            <li>작업을 마칠 때 무엇을 했는지, 집중·에너지·기분을 짧게 남깁니다. 이 기록이 다음 예상 시간과 통계의 재료가 됩니다.</li>
            <li>
              일정을 놓쳤다면 블록 메뉴에서 <b>다시 잡기</b>(오늘·내일·직접 선택), <b>건너뛰기</b>, <b>미배정으로</b> 중 하나를 고릅니다.
              놓친 기록은 지워지지 않고 이력으로 남습니다.
            </li>
          </ul>
          <h3 className="font-semibold">저녁: 하루 마무리</h3>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              아래쪽 <b>하루 마무리</b>에서 오늘의 계획 대비 실제, 완료 수를 보고 집중·에너지·기분과 메모를 남깁니다. 실행 중인 타이머는
              먼저 멈춰야 실제 시간에 반영됩니다.
            </li>
            <li>체크형 {josa(t.habits, "을/를")} 표시합니다. 체크는 오늘 것만 할 수 있습니다.</li>
            <li>
              저녁이 되면 브리핑이 <b>저녁 체크인</b>으로 바뀝니다. 오늘 잘한 한 가지, 가장 막힌 점, <b>내일 가장 먼저 할 한 가지</b>를 고르면
              다음 날 아침 브리핑의 ‘오늘의 한 가지’로 나옵니다.
            </li>
          </ul>
        </Section>

        <Section id="weekly" title="4. 주간 루틴 (일요일 20분)">
          <Steps
            items={[
              <>
                <TabLink href="/scheduler/review">주간 회고</TabLink>에서 계획 대비 실제 시간, 완료, 일정 변경 횟수를 봅니다. 숫자는 기록에서
                계산되므로 평가가 아니라 관찰로 읽습니다.
              </>,
              <>
                맨 위 <b>코칭</b>의 ‘이번 주 1% 변화’를 확인합니다. 최근 4주 기록을 보고 {t.protocol} 시간을 실제에 맞추거나{" "}
                {t.habit} 요일을 잘 지켜진 날로 줄이자고 제안합니다. [적용]하면 바로 바뀌고, [넘기기]하면 4주 동안 다시 묻지 않습니다.
              </>,
              <>
                <b>리뷰 생성</b>을 눌러 AI 해석으로 잘한 점·개선할 점·다음 주 제안을 받습니다. 제안은 수락해야만 반영됩니다.
              </>,
              <>
                <TabLink href="/scheduler/progress">성장</TabLink>에서 성취 로그와 {t.mission} 현황을 봅니다. 이번 주 {t.mission} 연결 시간과 {t.habit}{" "}
                달성률, {josa(t.identity, "이/가")} 받은 표를 확인합니다.
              </>,
              <>
                하나만 바꿉니다. 시간대가 맞지 않으면 {josa(t.protocol, "을/를")} 고치고, 너무 버거우면 {josa(t.habit, "을/를")} 더 작게
                줄입니다. 매주 1%씩 {josa(t.path, "을/를")} 다듬는 것이 목표입니다.
              </>,
              <>다음 주의 중요한 일 2~3개를 캘린더에 먼저 올립니다.</>,
            ]}
          />
        </Section>

        <Section id="monthly" title="5. 월간 점검">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              {t.mission}마다 ‘이 결과가 여전히 추구할 가치가 있나?’를 묻습니다. 아니라면 상태를 <b>중단</b>으로, 이뤘다면{" "}
              <b>달성</b>으로 바꿉니다. 기록은 그대로 남습니다.
            </li>
            <li>
              {josa(t.habit, "은/는")} 잘 지키는데 진행이 멈춰 있다면 {t.path}의 문제일 수 있습니다. {t.path} 교체를 쓰면 이전{" "}
              {josa(t.path, "은/는")} 이력으로 남고 새 {josa(t.path, "이/가")} 시작됩니다.
            </li>
            <li>
              <TabLink href="/scheduler/projects">{t.project}</TabLink>에서 끝났거나 멈춘 것은 아카이브로 옮겨 목록을 가볍게 유지합니다.
            </li>
            <li>{josa(t.identity, "이/가")} 지금의 나와 맞는지 다시 읽어 봅니다. 사람은 바뀌고, {t.identity}도 다듬어도 됩니다.</li>
            <li>성장 탭의 성취 로그로 한 달 동안 끝낸 {t.milestone}·{t.project}와 {t.habit} 연속 기록을 돌아봅니다.</li>
          </ul>
        </Section>

        <Section id="laws" title="6. 4가지 법칙으로 쓰기">
          <p>아토믹 해빗의 행동 변화 4법칙을 플래너 기능에 대응시키면 이렇습니다.</p>
          <Table
            head={["법칙", "뜻", "플래너에서 하는 일"]}
            rows={[
              ["분명하게", "신호가 눈에 보이게", `캘린더에 시간을 정해 두기, ${t.protocol}에 '언제·어디서'를 적기, 오늘의 ${josa(t.habits, "을/를")} 스케줄러 맨 위에서 보기`],
              ["매력적으로", "하고 싶게", `${josa(t.task, "을/를")} ${t.identity}·${t.mission}에 연결해 의미를 보이게 하기, 게임 요소(레벨·랭크·퀘스트·칭호) 켜기`],
              ["쉽게", "시작 장벽 낮추기", "2분 규칙으로 쪼개기, 템플릿과 #태그·@영역으로 입력 줄이기, 실제 기록으로 추천된 예상 시간 쓰기"],
              ["만족스럽게", "바로 보상받기", `타이머 종료와 체크, ${t.habit} 달성률·${t.identity} 표 보기, ${t.systemQuest} 클리어, 성취 로그에 쌓이는 기록`],
            ]}
          />
          <Tip>
            <b>{t.habit} 쌓기:</b> 이미 하는 일 뒤에 새 행동을 붙이세요. {josa(t.protocol, "을/를")} “점심 먹고 자리에 앉으면, 10분 영어
            쉐도잉”처럼 적고, 같은 시각에 캘린더 블록을 반복해 두면 신호가 고정됩니다.
          </Tip>
        </Section>

        <Section id="growth" title="7. 성장 시스템">
          <p>
            구조는 업무 용어로, 성취는 『나 혼자만 레벨업』의 상태창처럼 추적합니다. 모든 숫자는 기록에서 계산되며, 점수는 사람을
            평가하지 않고 활동량을 보여 줄 뿐입니다.
          </p>
          <Table
            head={["요소", "어떻게 쌓이나"]}
            rows={[
              ["레벨 · XP", `집중한 타이머 세션, 끝낸 ${t.task}, 지킨 일정 블록, 체크한 ${t.habit}, 퀘스트 클리어로 XP가 쌓이고 레벨이 오릅니다.`],
              ["랭크", "레벨 10마다 한 단계씩 E → D → C → B → A → S로 올라갑니다."],
              ["퀘스트", `${t.systemQuest}(매일), 주간 퀘스트, 회복 퀘스트가 기록을 보고 자동으로 만들어집니다. 기한이 지나도 벌점은 없습니다.`],
              ["업적 · 칭호", `첫 ${t.milestone} 완료, 첫 ${t.project} 완료, 첫 ${t.mission} 달성, ${t.habit} 7·30번 연속 같은 업적을 달성하면 칭호가 열립니다.`],
              ["성취 로그", `${t.milestone}·${t.project} 완료, ${t.mission} 달성, ${t.habit} 연속 기록(7·30·100번), 퀘스트 클리어, 업적, 레벨 업이 시간순으로 남습니다.`],
            ]}
          />
          <Tip>
            성취 로그의 {t.milestone}·{t.project}·{t.mission} 기록은 게임 요소를 꺼도 남습니다. 레벨·퀘스트·업적은 게임 요소를 켠
            뒤부터 쌓입니다.
          </Tip>
        </Section>

        <Section id="features" title="8. 탭별 기능">
          <Feature title="스케줄러" href="/scheduler">
            <li>할 일(무엇을), 일정 블록(언제 하기로), 작업 세션(실제로 언제)이 따로 기록되어 계획과 실제를 비교할 수 있습니다.</li>
            <li>왼쪽 오늘 패널은 지금 · 다음 · 이후 · 미배정 · 오늘 완료로 나뉩니다. 오른쪽 위에서 주/월 보기를 바꿉니다.</li>
            <li>
              {josa(t.task, "을/를")} 누르면 상세에서 {t.project}·{t.milestone}, {t.mission}·{t.protocol} 연결, 예상 시간, 우선순위, 수동 작업
              기록을 고칩니다.
            </li>
            <li>
              같은 유형이나 태그의 완료 작업이 3개 이상 쌓이면 실제 기록을 바탕으로 예상 시간을 추천합니다.
            </li>
            <li>
              <b>AI 추천</b>은 진행 중인 {t.project}와 남은 시간을 보고 오늘 할 일을 제안합니다. 수락하기 전에는 추가되지 않습니다.
            </li>
            <li>톱니바퀴 메뉴에서 분류 관리(영역·태그·템플릿)와 ‘실제 작업 기본 표시’를 설정합니다.</li>
          </Feature>
          <Feature title={t.directiveNav} href="/scheduler/directive">
            <li>
              {t.directive}·{t.identity} 아래에 {t.mission}마다 다섯 단계 습관 설계도({t.mission} → {t.criteria} → {t.path} →{" "}
              {t.protocol} → {t.habit})가 있습니다. 왼쪽 카드에 ‘설계 3/5 단계’처럼 진행이 보이고, 빈 단계는 그 자리에서 채웁니다.
            </li>
            <li>
              {josa(t.project, "은/는")} 끝나는 일, {josa(t.mission, "은/는")} 반복해서 내가 되는 일입니다. 끝내야 하는 일은 {josa(t.project, "으로/로")}{" "}
              만들어 {t.mission}에 연결하세요.
            </li>
            <li>{t.mission}에 속하지 않는 생활 {josa(t.habit, "은/는")} ‘다른 {t.habit}’에 둡니다.</li>
            <li>
              {t.task}·{josa(t.project, "을/를")} {t.mission}에 연결하면 {t.growth} 작업으로, 연결하지 않으면 {t.maintenance} 작업으로
              집계됩니다. 둘 다 필요하지만, {t.growth} 시간이 꾸준히 있는지가 중요합니다.
            </li>
          </Feature>
          <Feature title={t.project} href="/scheduler/projects">
            <li>기한이 있는 {t.task} 묶음입니다. {t.milestone}으로 단계를 나누고, 진행률은 완료한 {t.task} 수로 계산됩니다.</li>
            <li>각 {t.milestone}에서 바로 {josa(t.task, "을/를")} 추가합니다. 다음 행동이 바로 보일 만큼 작게 나누세요.</li>
            <li>{t.milestone}·{josa(t.project, "을/를")} 완료로 바꾸면 성취 로그에 기록되고, 게임 요소가 켜져 있으면 업적이 열립니다.</li>
          </Feature>
          <Feature title="주간 회고" href="/scheduler/review">
            <li>한 주의 계획 대비 실제, 완료, 일정 변경을 숫자로 봅니다. 화살표로 지난 주를 오갑니다.</li>
            <li>리뷰 생성으로 만든 AI 해석은 숫자를 설명만 하고, 데이터를 직접 바꾸지 않습니다.</li>
          </Feature>
          <Feature title="성장" href="/scheduler/progress">
            <li>상태창(레벨·랭크·칭호·이번 주 XP·진행 중인 퀘스트), 성취 로그, 업적과 칭호를 위에서부터 봅니다.</li>
            <li>
              행동 지표 4가지: <b>예상 정확도</b>(시간을 얼마나 정확히 예상하는지), <b>계획 이행</b>(미리 잡은 일정을 지키는지),{" "}
              <b>꾸준함</b>(근무일마다 의미 있게 일했는지), <b>회복력</b>(놓친 뒤 얼마나 빨리 다시 시작하는지). 기록이 충분해야 표시됩니다.
            </li>
            <li>나의 패턴(잘 지켜지는 시간대, 자주 미뤄지는 시간대, 계획 편향)과 영역별 연습 시간을 봅니다.</li>
            <li>
              막힌 {josa(t.mission, "이/가")} 있으면 SYSTEM QUESTION이 어느 계층({t.mission}·{t.path}·실행·계획·회복)을 먼저 볼지 묻습니다.
            </li>
            <li>게임 요소를 켜면 레벨·랭크·퀘스트·업적·칭호가 생깁니다. XP는 능력이 아니라 활동량이고, 꺼도 기록은 유지됩니다.</li>
          </Feature>
        </Section>

        <Section id="stuck" title="9. 막혔을 때">
          <Table
            head={["상황", "이렇게 해 보세요"]}
            rows={[
              ["하루를 통째로 놓쳤다", "괜찮습니다. 규칙은 하나, 두 번 연속 놓치지 않기. 내일 가장 작은 버전(2분)이라도 하고 체크하세요."],
              ["계획이 늘 넘친다", "계획 조정을 받아들이고, 성장 탭의 계획 편향을 보세요. 예상보다 오래 걸리는 유형은 예상 시간을 늘려 잡습니다."],
              [`${josa(t.habit, "이/가")} 계속 끊긴다`, `${josa(t.habit, "을/를")} 절반으로 줄이거나 ${t.protocol}의 시간·장소를 바꿉니다. 의지보다 환경과 신호를 고칩니다.`],
              [`${josa(t.habit, "은/는")} 지키는데 결과가 안 나온다`, `${josa(t.path, "을/를")} 의심할 때입니다. ${t.path} 교체로 접근 방식을 바꿔 보세요.`],
              ["시작 자체가 어렵다", "첫 행동을 2분짜리로 쪼개고 캘린더에 시각을 박아 두세요. 시작하면 계속하기는 훨씬 쉽습니다."],
              ["외부 일 때문에 늦어졌다", "작업 기록의 해석에서 외부 방해로 표시하면 예상 정확도 계산에서 가중치가 줄어듭니다."],
            ]}
          />
        </Section>

        <Section id="rules" title="10. 기록과 AI 원칙">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>계획(일정 블록)과 실제(작업 세션)는 서로 덮어쓰지 않습니다. 일정을 옮기거나 늘리면 변경 이력이 남습니다.</li>
            <li>모든 숫자는 기록에서 계산됩니다. AI는 숫자를 해석하고 제안만 하며, 수락하기 전에는 아무것도 바꾸지 않습니다.</li>
            <li>점수는 사람을 평가하지 않습니다. 기록된 행동을 설명할 뿐입니다.</li>
            <li>각 페이지 제목 옆의 (?)에서 그 화면의 짧은 설명을 볼 수 있습니다.</li>
            <li>
              오른쪽 아래 <b>비서</b>에게 “오늘 뭐부터 할까?”, “내일 보고서 2시간 잡아줘”처럼 물어보세요. 내 기록만 보고 답하고, 할 일은
              제안 카드로 만들어 [적용]해야 추가됩니다. 메시지 한 번이 AI 하루 사용량 1회를 씁니다.
            </li>
            <li>
              스케줄러 ⚙ → <b>알림</b>에서 이 기기의 알림을 켜면, 일정 시작 전·저녁 체크인·어제 놓친 {t.habit}·2주째 조용한{" "}
              {t.mission}을 먼저 알려 줍니다. 방해 금지 시간과 하루 최대 개수를 정할 수 있고, iPhone은 홈 화면에 추가한 뒤 켤 수 있습니다.
            </li>
          </ul>
        </Section>
      </article>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-3">
      <h2 id={`${id}-title`} className="border-b border-border pb-1.5 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-md border border-border text-xs tabular-nums text-muted-foreground">
            {i + 1}
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i} className={i === 0 ? "px-3 py-2 font-medium whitespace-nowrap" : "px-3 py-2"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className="mr-1.5 text-xs font-semibold text-muted-foreground">TIP</span>
      {children}
    </p>
  );
}

function Feature({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="font-semibold">
        <Link href={href} className="underline-offset-2 hover:underline">
          {title}
        </Link>
      </h3>
      <ul className="list-disc space-y-1 pl-5">{children}</ul>
    </div>
  );
}

function TabLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium underline underline-offset-2">
      {children}
    </Link>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-sm border border-border bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>;
}
