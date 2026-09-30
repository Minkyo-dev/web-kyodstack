# 업무 스케줄러 UX 개선 요구사항

현재 업무 스케줄러의 Task / Calendar / 작업 기록 기능을 아래 UX를 기준으로 재설계한다.

벤치마크는 TickTick의 Task → Calendar → Focus 흐름이지만, 단순히 TickTick을 복제하지 않는다.

우리 서비스의 핵심 목적은 다음과 같다.

> 사용자가 해야 할 일을 기록하고 → 언제 할지 계획하고 → 실제로 작업하고 → 실제 소요시간을 기록하고 → 계획과 실제의 차이를 학습하여 → 다음 계획을 더 현실적으로 만들어주는 시스템

따라서 핵심 Workflow는 다음과 같아야 한다.

```text
Task 생성
   ↓
Unscheduled Task
   ↓
Weekly Calendar에 Drag & Drop
   ↓
Planned Time Block 생성
   ↓
작업 시간이 되면 Focus 시작
   ↓
Focus Session 기록
   ↓
작업 종료
   ↓
Actual Work Log 생성
   ↓
Planned vs Actual 비교
   ↓
Duration History 업데이트
   ↓
다음 동일/유사 Task 생성 시
Recommended Duration 제안
```

---

# 1. 핵심 개념 분리

가장 중요하다.

Task와 Calendar Event와 실제 작업 기록을 하나의 데이터로 처리하지 않는다.

개념적으로 다음 4가지를 분리한다.

```text
Task
"What"

Time Block
"When I planned"

Focus Session
"When I actually worked"

Work Log
"What actually happened"
```

예:

```text
Task
"Snowflake 공부"

Planned Time Block
20:00 ~ 21:00
planned_duration = 60min

Focus Session
20:12 ~ 21:27
actual_duration = 75min

Work Log
집중도: 4/5
기분: 좋음
내용: Snowflake role / grant 공부
메모: 생각보다 권한 구조 이해에 시간이 오래 걸림
```

이 네 가지 데이터를 하나로 합치지 않는다.

특히

```text
planned_start_at
planned_end_at

actual_start_at
actual_end_at
```

을 절대로 같은 컬럼으로 관리하지 않는다.

계획이 변경되어도 실제 기록은 보존되어야 하기 때문이다.

---

# 2. 전체 화면 구조

Desktop 기준 기본 화면은 다음처럼 구성한다.

```text
┌─────────────────────────────────────────────────────────────┐
│ Header                                                      │
│ Today | Week | Analytics                         2026.09.29 │
├───────────────────┬─────────────────────────────────────────┤
│                   │ MON   TUE   WED   THU   FRI   SAT   SUN │
│ TASKS             │                                         │
│                   │       Weekly Calendar                   │
│ + Add Task        │                                         │
│                   │ 09 ─────────────────────────────────── │
│ Today             │                                         │
│ □ dbt 공부        │ 10     ┌─────────────┐                  │
│ □ 영어 공부       │        │ dbt 공부    │                  │
│ □ 블로그 작성     │        │ 10:00-11:20 │                  │
│                   │        └─────────────┘                  │
│ Inbox             │                                         │
│ □ AWS 공부        │ 11 ─────────────────────────────────── │
│ □ Resume update   │                                         │
│                   │                                         │
├───────────────────┴─────────────────────────────────────────┤
│ ▶ Current Focus: dbt 공부                 00:38:42    ■ Stop│
└─────────────────────────────────────────────────────────────┘
```

핵심은 왼쪽의 **Task backlog**와 오른쪽의 **Calendar**가 동시에 보여야 한다는 것이다.

별도의 페이지를 왔다 갔다 하면서 Task를 스케줄링하게 만들지 않는다.

---

# 3. Task 생성 UX

## Quick Add

사용자가 Task를 만드는 과정은 최대한 빨라야 한다.

기본 입력창:

```text
+ What do you need to do?
```

Enter를 누르면 바로 Task 생성.

Task 생성 시 필수값은 사실상 title 하나뿐이다.

```text
title
```

나머지는 optional이다.

```text
category
priority
deadline
estimated_duration
tags
description
```

Task 생성 Modal을 처음부터 열지 않는다.

### Quick Add 예시

```text
[ Snowflake 공부                           ] Enter
```

생성 후:

```text
Today

□ Snowflake 공부
□ 영어 Listening
□ Blog 글 작성
```

---

# 4. Unscheduled Task 개념

Task를 만들었다고 Calendar에 자동 배치하지 않는다.

Task에는 다음 상태가 존재한다.

```text
UNSCHEDULED
SCHEDULED
IN_PROGRESS
COMPLETED
CANCELLED
```

Task 생성 직후 기본 상태:

```text
UNSCHEDULED
```

예:

```text
Tasks

☰ Snowflake 공부        60m
☰ 영어 공부             40m
☰ Blog 작성             90m
```

이 Task를 Weekly Calendar로 Drag한다.

---

# 5. Task → Calendar Drag & Drop

이 UX가 서비스에서 가장 중요한 interaction 중 하나다.

사용자가 왼쪽 Task를 잡는다.

```text
☰ Snowflake 공부   60m
```

그리고 Tuesday 19:00에 Drop.

Calendar는 Drop 전 Preview를 보여준다.

```text
Tuesday

19:00 ┌──────────────────┐
      │ Snowflake 공부    │
      │ 19:00 → 20:00    │
20:00 └──────────────────┘
```

Drop하면 Time Block이 생성된다.

```text
Task
Snowflake 공부

TimeBlock
start = 19:00
end   = 20:00
duration = 60min
```

Task가 삭제되는 것이 아니라 Task와 TimeBlock이 연결된다.

```text
Task
   │
   └── TimeBlock
```

---

# 6. Calendar Block 조작

Calendar에 생성된 Block은 Google Calendar / TickTick 수준의 interaction을 제공한다.

## Move

전체 Block을 Drag한다.

```text
19:00 → 20:00
```

↓

```text
20:30 → 21:30
```

duration은 그대로 유지한다.

---

## Resize

Block 아래 edge를 drag한다.

```text
19:00 ┌───────────────┐
      │ Snowflake     │
20:00 └──────●────────┘
```

●를 20:30까지 drag:

```text
19:00 ┌───────────────┐
      │ Snowflake     │
      │               │
20:30 └───────────────┘
```

planned duration:

```text
60m → 90m
```

으로 변경한다.

---

# 7. AI Recommended Duration 표시

과거 데이터가 있는 Task라면 Calendar에 Drag하는 순간 추천 시간을 표시한다.

예:

```text
Snowflake 공부

Your estimate
60 min

Based on your history
Recommended
82 min
```

UI:

```text
┌───────────────────────────┐
│ Snowflake 공부            │
│                           │
│ Recommended     1h 20m    │
│ Your estimate   1h        │
│                           │
│ [Use 1h 20m]  [Keep 1h]  │
└───────────────────────────┘
```

AI가 임의로 Calendar를 변경하지 않는다.

**항상 recommendation → user confirmation 구조로 한다.**

추천값이 있으면 Drop Preview에서도 보여준다.

```text
19:00 ┌────────────────────┐
      │ Snowflake 공부     │
      │ Recommended: 80m   │
20:20 └────────────────────┘
```

---

# 8. Calendar Task Card 디자인

기본 카드:

```text
┌────────────────────┐
│ Snowflake 공부     │
│ 19:00 - 20:20      │
│                    │
│ ▶ Start            │
└────────────────────┘
```

너무 많은 정보를 넣지 않는다.

기본적으로:

```text
Task title
Time
Status
```

만 보여준다.

Hover하면 Action 표시:

```text
▶ Start
✓ Complete
⋯ More
```

---

# 9. Task → Focus

Calendar 시간이 되었을 때 별도의 Focus 페이지로 이동하게 만들 필요가 없다.

Calendar Block에서 바로 시작한다.

```text
┌────────────────────────┐
│ Snowflake 공부         │
│ 19:00 - 20:20          │
│                        │
│ ▶ Start Focus          │
└────────────────────────┘
```

Start Focus 클릭.

Task 상태:

```text
SCHEDULED
    ↓
IN_PROGRESS
```

FocusSession 생성:

```text
focus_session

started_at = NOW()
ended_at = null
status = ACTIVE
```

---

# 10. Focus 실행 UI

Focus를 시작하면 화면 하단에 항상 고정된 Focus Bar를 표시한다.

```text
┌───────────────────────────────────────────────────────────┐
│ ● Snowflake 공부        00:42:18      Pause      ■ Stop  │
└───────────────────────────────────────────────────────────┘
```

전체 화면을 Focus Timer 화면으로 강제로 전환하지 않는다.

사용자는 Calendar나 Task를 계속 볼 수 있어야 한다.

필요하면 Focus Bar 클릭 시 확장한다.

```text
┌──────────────────────────────────────┐
│            Snowflake 공부           │
│                                      │
│              00:42:18                │
│                                      │
│ Planned             1h 20m           │
│ Elapsed                42m           │
│ Remaining              38m           │
│                                      │
│        Pause        Finish           │
│                                      │
│ Focus Note                          │
│ ────────────────────────────────── │
│ role hierarchy 정리                 │
└──────────────────────────────────────┘
```

---

# 11. Pomodoro와 Actual Work Timer를 구분

우리 서비스의 목적은 실제 소요시간 학습이므로 Pomodoro 중심으로 설계하지 않는다.

핵심은:

```text
Work Timer
```

이다.

예:

```text
Start
19:12

Pause
19:43

Resume
19:51

Stop
20:34
```

실제 집중시간:

```text
31min + 43min
= 74min
```

Elapsed wall time:

```text
82min
```

두 값을 구분할 수 있다.

```text
elapsed_duration
focused_duration
paused_duration
```

---

# 12. Focus Pause

Pause를 누르면:

```text
PAUSED
```

상태로 변경.

사용자가 이유를 선택하는 것은 optional.

Quick options:

```text
Coffee
Phone
Meeting
Break
Other
```

하지만 Pause할 때마다 이유 입력을 요구해서 UX를 방해하지 않는다.

---

# 13. 다른 Task 시작

현재 Focus 중인데 다른 Task를 시작하면 다음 Dialog를 표시한다.

```text
You are currently working on:

Snowflake 공부
00:42:18

Start "영어 공부"?

[Finish current task]
[Pause current task]
[Cancel]
```

동시에 두 개의 ACTIVE Focus Session을 허용하지 않는다.

---

# 14. Focus 완료 UX

Stop / Finish를 누르면 바로 Task를 completed 처리하지 않는다.

먼저 간단한 Work Summary를 보여준다.

```text
Snowflake 공부

Planned
1h 20m

Actual Focus
1h 34m

Difference
+14m

How was your focus?

1   2   3   4   5
            ●

Mood

😫  😕  😐  🙂  😄
             ●

What did you accomplish?

[ Role / grant 구조 정리 완료           ]

[ Complete Task ]
[ Continue Later ]
```

여기서 핵심은:

```text
Stop Focus ≠ Complete Task
```

이다.

작업 시간이 끝났지만 Task가 끝나지 않을 수 있기 때문이다.

---

# 15. Continue Later

예:

```text
Snowflake 공부

planned 80min
worked 94min

하지만 아직 완료하지 못함
```

사용자가:

```text
Continue Later
```

선택.

Task는 다시:

```text
UNSCHEDULED
```

또는

```text
PARTIALLY_COMPLETED
```

상태가 된다.

그리고 Calendar에 다음 Time Block을 추가할 수 있다.

```text
Task

Snowflake 공부

TimeBlock #1
Tuesday 19:00-20:20

FocusSession #1
94min

TimeBlock #2
Wednesday 20:00-20:40
```

**하나의 Task가 여러 개의 Time Block / Focus Session을 가질 수 있어야 한다.**

---

# 16. Task 완료

사용자가 Complete Task를 선택한다.

```text
Task.status = COMPLETED
completed_at = NOW()
```

하지만 모든 기록은 유지한다.

```text
Task
 │
 ├ TimeBlock 1
 ├ TimeBlock 2
 │
 ├ FocusSession 1
 ├ FocusSession 2
 │
 └ WorkLog
```

---

# 17. Calendar에서 Planned와 Actual 구분

과거 날짜를 볼 때 Calendar에는 계획과 실제 작업을 구분해서 보여준다.

예:

```text
Tuesday

19:00 ┌───────────────────┐
      │ Snowflake 공부    │ ← Planned
20:20 └───────────────────┘

      Actual
19:12 ┌───────────────────┐
      │ Snowflake 공부    │
20:46 └───────────────────┘
```

하지만 둘을 동시에 보여주면 복잡해질 수 있으므로 기본 화면에서는:

```text
Planned
```

를 보여주고,

옵션:

```text
[✓] Show actual work
```

을 활성화하면 Actual Session overlay를 보여주는 방식을 사용한다.

TickTick에서도 Focus Record를 Calendar에 표시할 수 있는 방식이 있으므로 이 interaction을 참고한다.

---

# 18. Plan vs Actual Visualization

Task 완료 후 가장 중요한 feedback이다.

```text
Snowflake 공부

Planned
████████████████      80m

Actual
███████████████████   94m

+14 min
+17.5%
```

사용자가 자기 시간 감각을 점점 파악하도록 한다.

하지만 부정적인 표현은 사용하지 않는다.

피해야 할 표현:

```text
You failed your estimate.
Poor time management.
```

대신:

```text
14 min longer than planned
```

처럼 사실만 전달한다.

---

# 19. Duration Learning

동일 유형 Task 기록:

```text
Snowflake Study

Session 1
planned 60
actual 82

Session 2
planned 60
actual 74

Session 3
planned 90
actual 88

Session 4
planned 60
actual 79
```

시스템은 이를 기반으로:

```text
recommended_duration ≈ 80min
```

을 생성한다.

다음 Task 생성:

```text
Snowflake 공부

Recommended
1h 20m

Based on 4 previous sessions
```

중요:

단순 average를 바로 사용하지 않는다.

향후 다음 조건을 사용할 수 있도록 구조를 확장 가능하게 설계한다.

```text
Task type
Historical duration
Time of day
Day of week
Focus score
Mood
Interruptions
Task complexity
User estimate
Recent sessions
```

---

# 20. Task Similarity

처음에는 AI embedding 기반 유사도까지 만들 필요가 없다.

MVP에서는 다음을 기반으로 묶는다.

```text
category
tag
template
task_type
```

예:

```text
Category
English

Task Type
Listening Practice
```

과거:

```text
Listening Practice
35m
42m
38m
46m
```

다음 Listening Task:

```text
Recommended: 40m
```

향후 AI 기반:

```text
"Friends 영어 Listening"
"영어 드라마 Shadowing"
"영어 듣기 연습"
```

을 같은 task type으로 인식하도록 확장 가능하게 한다.

---

# 21. Today UX

Today 화면은 Task List만 보여주는 화면이 되어서는 안 된다.

다음 구조로 만든다.

```text
TODAY

September 29

Planned          5h 20m
Worked           2h 42m
Remaining        2h 38m


NOW

● Snowflake 공부
  00:42:18
  [Pause] [Finish]


NEXT

20:30
English Listening
40 min


LATER

21:30
Blog
1h


UNSCHEDULED

□ Resume update
□ AWS study
```

사용자가 지금 가장 중요하게 알아야 하는 것은:

```text
What am I doing now?
What should I do next?
```

이다.

---

# 22. Daily Review

하루 마지막에 optional Daily Review를 제공한다.

```text
Today

Planned
5h 20m

Actual Focus
4h 38m

Completed
5 / 7 tasks


How was your day?

Mood
1 2 3 4 5

Focus
1 2 3 4 5

Energy
1 2 3 4 5


Anything worth remembering?

[ 오후에는 집중력이 많이 떨어졌다. ]
```

이 값도 향후 Duration Recommendation에 사용할 수 있도록 저장한다.

---

# 23. Weekly View

Weekly Calendar 상단에 과도하지 않은 수준의 summary를 제공한다.

```text
This Week

Planned     31h
Worked      27h
Completed   24 tasks
```

그리고 현재 날짜 강조.

Calendar 자체가 가장 중요한 화면이므로 Dashboard 카드가 Calendar 공간을 많이 차지하면 안 된다.

---

# 24. Rescheduling UX

계획대로 하지 못하는 것은 정상적인 상황으로 취급한다.

Task가 예정 시간을 지나도 완료되지 않았다면:

```text
Snowflake 공부
19:00 - 20:00

Not started

[Start now]
[Reschedule]
[Skip]
```

Reschedule 클릭:

```text
Today 21:00
Tomorrow
Pick time
Back to Inbox
```

사용자가 Calendar에서 그냥 drag해도 동일하게 reschedule 된다.

---

# 25. 계획 변경 기록

Time Block을 이동했다고 기존 history를 완전히 삭제하지 않는다.

예:

```text
original_start
19:00

rescheduled_start
20:30
```

또는 TimeBlockHistory를 사용한다.

```text
19:00 → 20:30
20:30 → 21:00
```

향후 이를 분석하면:

```text
사용자가 어떤 종류의 Task를 자주 미루는가?
어떤 시간대의 계획이 자주 깨지는가?
```

까지 알 수 있다.

MVP UI에는 노출할 필요 없지만 데이터는 확보할 수 있도록 고려한다.

---

# 26. Task Detail

Task를 클릭하면 오른쪽 Drawer를 연다.

페이지 이동은 최소화한다.

```text
┌──────────────────────────────┐
│ Snowflake 공부              │
│                              │
│ Status       Scheduled       │
│ Category     Study           │
│ Priority     Medium          │
│                              │
│ Schedule                     │
│ Sep 29                       │
│ 19:00 - 20:20                │
│                              │
│ Estimated                    │
│ 60m                          │
│                              │
│ Recommended                  │
│ 80m                          │
│ Based on 4 sessions          │
│                              │
│ History                      │
│ Sep 25        74m            │
│ Sep 21        88m            │
│ Sep 18        82m            │
│                              │
│ [▶ Start Focus]              │
└──────────────────────────────┘
```

Drawer이므로 Calendar context가 사라지면 안 된다.

---

# 27. 핵심 상태 모델

Task:

```text
UNSCHEDULED
SCHEDULED
IN_PROGRESS
COMPLETED
CANCELLED
```

FocusSession:

```text
ACTIVE
PAUSED
COMPLETED
CANCELLED
```

TimeBlock:

```text
PLANNED
STARTED
MISSED
COMPLETED
CANCELLED
```

이 상태들을 UI 상태와 정확하게 연결한다.

---

# 28. 최소 데이터 관계

UX 구현을 위해 최소한 다음 관계가 필요하다.

```text
User
 │
 ├── Task
 │     │
 │     ├── TimeBlock
 │     │
 │     └── FocusSession
 │
 ├── WorkLog
 │
 └── DailyReview
```

조금 더 정확하게는:

```text
Task
 ├── 0..N TimeBlocks
 ├── 0..N FocusSessions
 └── 0..N WorkLogs
```

---

# 29. 반드시 지켜야 할 UX 원칙

### Principle 1 — Capture should be instant

Task 생성할 때 Modal부터 보여주지 않는다.

```text
type → enter
```

로 끝낼 수 있어야 한다.

---

### Principle 2 — Planning should be visual

시간 입력 Form 중심이 아니라:

```text
Drag
Drop
Resize
Move
```

중심으로 만든다.

---

### Principle 3 — Start work from where the plan is

Task를 Calendar에서 확인한 후 다른 Focus 페이지를 찾아갈 필요가 없어야 한다.

```text
Calendar Task
      ↓
Start Focus
```

---

### Principle 4 — Actual data should be captured automatically

사용자가:

```text
몇 시에 시작했지?
몇 분 했지?
```

를 나중에 입력하게 하지 않는다.

Timer에서 자동으로 기록한다.

단, manual correction은 지원한다.

---

### Principle 5 — Stop Focus and Complete Task are different

반드시 분리한다.

```text
Focus 종료
≠
Task 완료
```

---

### Principle 6 — One task can span multiple sessions

현실에서는 하나의 작업을 한 번에 끝내지 못한다.

```text
Task
 ├ Focus 40m
 ├ Focus 30m
 └ Focus 25m
```

총 실제 작업시간:

```text
95m
```

으로 계산한다.

---

### Principle 7 — AI recommends, user decides

AI가 Calendar를 마음대로 변경하지 않는다.

```text
AI:
Recommended 80min

User:
Accept / Change / Ignore
```

구조로 한다.

---

# 30. 전체 UX 시나리오 예제

사용자가 오전에 Task를 등록한다.

```text
+ Snowflake 공부
+ 영어 Listening
+ Blog 작성
```

Task Inbox:

```text
☰ Snowflake 공부       Recommended 80m
☰ 영어 Listening      Recommended 40m
☰ Blog 작성           Recommended 90m
```

사용자가 Snowflake 공부를 Calendar로 Drag한다.

```text
Tuesday
19:00
```

시스템:

```text
Recommended duration
1h 20m
```

Calendar:

```text
19:00 ┌─────────────────────┐
      │ Snowflake 공부      │
      │ 1h 20m              │
20:20 └─────────────────────┘
```

19:12 사용자가:

```text
▶ Start
```

클릭.

하단:

```text
● Snowflake 공부
00:00:01

Pause      Finish
```

작업 중 Pause 포함.

21:00 Finish.

결과:

```text
Planned
80m

Actual focus
94m

Difference
+14m
```

사용자:

```text
Focus: 4/5
Mood: 4/5

"Role 구조 정리 완료"
```

그리고:

```text
Complete Task
```

선택.

시스템은 History를 업데이트한다.

```text
Previous recommended
80m

Actual
94m
```

다음에 비슷한 Task를 생성하면:

```text
Snowflake account permission 공부

Recommended
≈ 85m

Based on 5 similar sessions
```

를 제안한다.

---

# 31. 최종 제품 구조

최종적으로 서비스의 핵심 Loop는 다음과 같아야 한다.

```text
          ┌───────────────┐
          │ Capture Task  │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Plan Calendar │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Start Focus   │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Actual Work   │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Reflect       │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Learn         │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Better Plan   │
          └───────┬───────┘
                  │
                  └──────────────→ 반복
```

이 Loop가 이 서비스의 가장 중요한 Product Concept이다.

단순 Todo App을 만들지 않는다.

단순 Calendar App도 만들지 않는다.

단순 Pomodoro App도 만들지 않는다.

**Task Planning과 Actual Behavior의 차이를 지속적으로 기록하고, 사용자의 실제 작업 패턴을 학습하여 다음 계획을 현실적으로 만드는 Personal Work Planning System으로 설계한다.**

---

# 32. 구현 우선순위

첫 번째 단계에서는 AI보다 UX Loop 완성을 우선한다.

```text
P0

Task Quick Add
Task Inbox
Weekly Calendar
Drag & Drop
Resize Time Block
Reschedule
Start Focus
Pause / Resume / Finish
Focus Session 기록
Complete / Continue Later
Planned vs Actual
Multiple Focus Sessions
```

그 다음:

```text
P1

Daily Review
Focus / Mood 기록
Task Category
Task Type
Historical Duration
Basic Recommended Duration
Calendar Actual Overlay
Weekly Analytics
```

마지막:

```text
P2

AI Task Classification
Similar Task Detection
Context-aware Duration Prediction
Time-of-day Analysis
Personal Productivity Pattern
Automatic Schedule Suggestion
```

P0가 완성되기 전에는 AI 기능을 과도하게 구현하지 않는다.

먼저 다음 Loop가 매우 자연스럽게 작동하도록 만들어라.

```text
Create
  ↓
Schedule
  ↓
Work
  ↓
Record
  ↓
Review
```

그 위에 AI를 추가한다.