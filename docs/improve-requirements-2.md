# Solo Leveling-inspired Productivity System
## Personal Task Scheduler Gamification Design Specification

---

# 1. 문서 목적

현재 개발 중인 개인 업무 스케줄러에 RPG형 성장 시스템을 추가한다.

게임화의 모티브는 《Solo Leveling》의 **System / Quest / Level / Stat / Skill / Reward** 구조에서 가져오되, 특정 작품의 UI, 그래픽, 명칭, 애셋, 폰트 등을 직접 복제하지 않는다.

가져오고자 하는 것은 작품의 외형이 아니라 다음과 같은 **성장 경험 구조**다.

```text
Quest 발생
↓
사용자 행동
↓
System이 행동을 기록
↓
결과 분석
↓
EXP / 성장 피드백
↓
Level Up
↓
새로운 Quest
↓
사용자의 실제 능력과 자기 이해 향상
```

이 구조를 업무 스케줄러의 기존 흐름에 결합한다.

기존 서비스 핵심 흐름:

```text
Task
↓
Calendar
↓
Focus
↓
Actual Work
↓
Review
↓
Recommendation
```

게임화 후:

```text
Quest
↓
Plan
↓
Execute
↓
Focus
↓
Clear
↓
Analyze
↓
EXP / Stats / Practice
↓
System Recommendation
↓
Better Plan
```

---

# 2. 제품의 핵심 철학

이 서비스를 단순한 Gamified Todo App으로 만들지 않는다.

다음과 같은 앱이 되어서는 안 된다.

```text
Task 완료
→ +10 XP
→ Level Up
```

이 서비스의 핵심은:

> 사용자가 실제로 어떻게 일하고 있는지를 기록하고,
> 자기 자신에 대한 이해와 계획 정확도를 지속적으로 개선하는 Personal Planning System

이다.

Level과 EXP는 이를 재미있게 지속시키기 위한 보조 장치다.

최종적으로 사용자가 느껴야 하는 경험은:

```text
I planned it.
↓
I actually did it.
↓
The system recorded it.
↓
The system understood the result.
↓
My character progressed.
↓
The system understands me better.
↓
My next plan becomes more realistic.
```

이다.

---

# 3. 가장 중요한 설계 원칙

## 3.1 Task와 시간 기록을 분리한다

절대로 하나의 Task 객체에 모든 것을 저장하지 않는다.

다음 개념을 분리한다.

```text
Task
= 무엇을 해야 하는가

Time Block
= 언제 하기로 계획했는가

Focus Session
= 실제로 언제 작업했는가

Work Log
= 실제 작업 결과가 어땠는가
```

관계:

```text
Task
├── 0..N TimeBlocks
├── 0..N FocusSessions
└── 0..N WorkLogs
```

한 Task를 여러 번 나누어 작업할 수 있어야 한다.

예:

```text
Task
Snowflake 공부

TimeBlock #1
Tue 19:00–20:00

Focus #1
42m

TimeBlock #2
Wed 20:00–21:00

Focus #2
51m
```

Task 총 Actual Work:

```text
42 + 51 = 93 min
```

---

# 4. Task → Quest

DB와 내부 Domain에서는 계속 `Task`를 사용한다.

Gamification UI가 활성화된 경우에만 Task를 `Quest`로 표현할 수 있다.

```text
Task         → Quest
Task List    → Quest List
Completed    → Cleared
Focus Start  → Quest Started
```

하지만 사용성보다 게임 용어를 우선하지 않는다.

사용자가 Gamification Mode를 끄면 일반 생산성 용어로 돌아갈 수 있어야 한다.

---

# 5. 전체 UX Flow

```text
Task 생성
↓
Unscheduled Task
↓
Weekly Calendar Drag & Drop
↓
Time Block 생성
↓
작업 시간 도착
↓
Start Focus
↓
Focus Session 실행
↓
Finish Focus
↓
Work Log 기록
↓
Complete / Continue Later
↓
Actual Metrics 생성
↓
Stat Engine 업데이트
↓
EXP / Achievement 처리
↓
AI System Analysis
↓
다음 Task 추천
```

---

# 6. Task 생성 UX

Task 입력은 빠르게 끝나야 한다.

기본:

```text
+ What do you need to do?
```

사용자가 입력하고 Enter:

```text
Snowflake RBAC 공부
```

Task 생성.

Task 생성 시 필수 필드:

```text
title
```

나머지는 optional:

```text
description
category
task_type
priority
deadline
estimated_duration
tags
project_id
```

처음부터 큰 Modal을 띄우지 않는다.

---

# 7. Unscheduled Task

Task 생성 직후 Calendar에 자동 배치하지 않는다.

Task 상태:

```text
UNSCHEDULED
SCHEDULED
IN_PROGRESS
COMPLETED
CANCELLED
```

왼쪽 Sidebar:

```text
QUESTS

☰ Snowflake 공부      ~80m
☰ English Listening   ~40m
☰ Portfolio           ~90m
```

---

# 8. Calendar Scheduling

사용자가 Task를 Weekly Calendar로 Drag & Drop한다.

```text
Snowflake 공부
       ↓ drag

Tuesday 19:00
```

Drop Preview:

```text
19:00 ┌───────────────────┐
      │ Snowflake Study   │
      │ Recommended 80m   │
20:20 └───────────────────┘
```

Drop 후 TimeBlock 생성:

```text
task_id
planned_start_at
planned_end_at
planned_duration
```

---

# 9. Calendar Interaction

반드시 지원:

```text
Drag
Drop
Move
Resize
Reschedule
```

## Move

```text
19:00–20:00
↓
20:30–21:30
```

duration 유지.

## Resize

```text
19:00–20:00
↓
19:00–20:30
```

planned_duration 변경.

---

# 10. Focus System

Calendar Task에서 바로 Focus를 시작할 수 있어야 한다.

```text
Snowflake Study

19:00–20:20

[Start Focus]
```

Focus 시작 시:

```text
Task.status = IN_PROGRESS
```

FocusSession:

```text
status = ACTIVE
started_at = now()
```

---

# 11. Focus UI

Focus 시작 후 화면 하단에 항상 보이는 Focus Bar 제공.

```text
ACTIVE QUEST

Snowflake Study       00:38:42

Pause        Finish
```

전체 화면을 강제로 Focus 페이지로 이동시키지 않는다.

사용자는 Calendar와 Tasks를 계속 볼 수 있어야 한다.

---

# 12. Pause / Resume

지원:

```text
START
PAUSE
RESUME
FINISH
```

기록:

```text
started_at
ended_at
paused_duration
active_duration
elapsed_duration
```

예:

```text
Start 19:12

Pause 19:43

Resume 19:51

Finish 20:34
```

계산:

```text
elapsed = 82m
pause = 8m
active = 74m
```

---

# 13. 한 번에 하나의 Active Focus

동시에 두 Focus Session이 ACTIVE이면 안 된다.

새 Task 시작 시:

```text
You are currently working on:

Snowflake Study
00:42:18

Start "English Listening"?

[Finish current]
[Pause current]
[Cancel]
```

---

# 14. Finish Focus ≠ Complete Task

핵심 원칙:

```text
Focus 종료
≠
Task 완료
```

Focus 종료 후:

```text
Planned
80m

Actual Focus
94m

Difference
+14m
```

그리고:

```text
How was your focus?
1 2 3 4 5

How was your energy?
1 2 3 4 5

What happened?

[________________]

[Complete Task]
[Continue Later]
```

---

# 15. Continue Later

Task가 끝나지 않았다면:

```text
Continue Later
```

선택.

Task는 다시:

```text
UNSCHEDULED
```

또는:

```text
PARTIAL
```

상태로 두어도 된다.

그리고 나중에 새로운 TimeBlock을 추가할 수 있다.

---

# 16. Planned vs Actual

서비스의 핵심 데이터다.

반드시 분리:

```text
planned_start
planned_end
planned_duration

actual_start
actual_end
actual_active_duration
```

Task 완료 후:

```text
Planned
██████████████        80m

Actual
████████████████      94m

+14m
```

---

# 17. Gamification Layer의 역할

Gamification은 실제 업무 데이터를 대체하지 않는다.

구조:

```text
REAL PRODUCTIVITY DATA
        ↓
ANALYTICS
        ↓
GAMIFICATION
```

절대로:

```text
Gamification
↓
Productivity calculation
```

순서로 만들지 않는다.

---

# 18. Player Level

전체 사용자 Level을 둔다.

```text
LEVEL 17

██████████████░░

1,420 / 1,800 XP
```

Level은 절대 감소하지 않는다.

나쁜 하루 때문에:

```text
17 → 16
```

이 되는 구조를 만들지 않는다.

Level은 누적 활동량의 상징이다.

---

# 19. EXP의 역할

EXP는 사용자의 능력을 평가하는 점수가 아니다.

EXP는:

```text
Engagement
Progression
Feedback
```

을 위한 게임 메커니즘이다.

예:

```text
Meaningful focus completed   +20 XP
Task completed               +20 XP
Weekly Quest completed       +100 XP
Recovery Quest completed     +40 XP
```

---

# 20. EXP Farming 방지

다음과 같은 문제가 없어야 한다.

```text
Chrome 열기
메일 확인
Slack 열기
물 마시기
```

수십 개 생성 후 완료 → XP 획득.

따라서 XP 계산에는 diminishing return을 둔다.

예:

```text
0–30m
normal

30–90m
slower growth

90m+
very small additional gain
```

또한 Task 완료 XP 역시 하루 무한 반복 지급하지 않는다.

---

# 21. Stat 설계 원칙

Stat은 절대로 AI가 임의로 생성하지 않는다.

Stat은:

> 사용자의 측정 가능한 행동을 요약한 값

이다.

다음은 사용하지 않는다.

```text
Intelligence
Discipline
Productivity
Skill
Focus Ability
```

객관적으로 측정할 수 없기 때문이다.

---

# 22. 최종 Stat

MVP에서는 다음 네 개만 사용한다.

```text
CALIBRATION

RELIABILITY

CONSISTENCY

RECOVERY
```

---

# 23. CALIBRATION

의미:

> 사용자가 자신의 작업 소요시간을 얼마나 정확하게 예상하는가.

기본:

```text
planned_duration
actual_duration
```

Task Score:

```text
100 × min(
    actual / planned,
    planned / actual
)
```

예:

```text
Planned  Actual  Score

60       60      100
60       66      91
60       75      80
60       90      67
60       120     50
```

---

# 24. Calibration Bias

Calibration에는 점수만 표시하지 않는다.

반드시 Bias도 제공한다.

예:

```text
Calibration
82

Typical Error
±18%

Bias
+14%

You usually underestimate.
```

`+14%`:

실제 작업 시간이 계획보다 평균 약 14% 오래 걸리는 경향.

---

# 25. Task Type별 Calibration

모든 Task를 같은 집단으로 계산하지 않는다.

예:

```text
Calibration

Overall          78
Coding           71
English          91
Documentation    82
```

Duration Recommendation은 Overall보다 Task Type 데이터를 우선한다.

---

# 26. RELIABILITY

의미:

> 스스로 Calendar에 넣어 둔 일정에 대해 얼마나 책임 있게 처리했는가.

중요:

Task Completion Rate와 다르다.

Calendar Commitment를 기준으로 한다.

예:

```text
On time / early          1.0
≤15m late                0.9
≤30m late                0.75
Proactive reschedule     0.85
Late reschedule          0.5
Missed                   0
```

---

# 27. Committed Time Block

Stat Farming 방지를 위해 모든 Calendar Block을 Reliability 계산에 넣지 않는다.

예:

```text
scheduled at least 2 hours before start
```

같은 조건을 만족한 일정만:

```text
Committed Time Block
```

으로 본다.

즉:

```text
13:55 Task 생성
14:00 Calendar 등록
14:00 바로 시작
```

같은 행동으로 Reliability를 쉽게 올릴 수 없게 한다.

---

# 28. CONSISTENCY

의미:

> 많은 시간을 몰아서 일하는지가 아니라, 계획된 활동을 얼마나 안정적으로 지속하는가.

Streak 기반으로 만들지 않는다.

예:

```text
Mon ✓
Tue ✓
Wed -
Thu ✓
Fri ✓
```

사용자 설정:

```text
Planned Work Days:
Mon Tue Wed Thu Fri

Minimum Meaningful Work:
30 min
```

최근 4~6주의 데이터를 사용한다.

---

# 29. Consistency ≠ Work Hours

예:

```text
A:
Monday 12h
Tue–Fri 0

B:
Mon–Fri 2h each
```

총 시간:

```text
A 12h
B 10h
```

Consistency는 B가 높아야 한다.

---

# 30. RECOVERY

의미:

> 계획이 실패한 뒤 얼마나 빨리 다시 정상적인 실행으로 돌아오는가.

예:

```text
Monday
English MISS
```

Case A:

```text
Tuesday
English Completed
```

좋은 Recovery.

Case B:

```text
Friday
다시 시작
```

느린 Recovery.

예:

```text
Next planned day        100
Within 2 planned days    75
Within 3 planned days    50
Later                    25
Abandoned                 0
```

---

# 31. 데이터가 부족하면 점수를 만들지 않는다

Fake precision 금지.

예:

```text
Calibration

Collecting data...

5 / 8 eligible tasks
```

초기 기준 예:

```text
Calibration
8 completed tasks

Reliability
10 committed blocks

Consistency
3 weeks

Recovery
5 recovery events
```

---

# 32. Rolling Window

Stat은 전체 인생 누적 평균이 되어서는 안 된다.

최근 행동을 더 잘 반영해야 한다.

예:

```text
Recent 28 days
```

또는 EWMA.

개념:

```text
new_stat =
old_stat × 0.8
+
recent_behavior × 0.2
```

Stat이 하루 만에 과도하게 변하지 않게 smoothing한다.

---

# 33. Focus는 Stat으로 만들지 않는다

우리가 실제로 측정할 수 있는 것은:

```text
session duration
pause duration
pause count
user focus rating
```

뿐이다.

90분 Timer:

```text
90 minutes timer
```

≠

```text
90 minutes deep focus
```

따라서:

```text
FOCUS 84
```

같은 점수를 만들지 않는다.

대신 Analytics:

```text
FOCUS PATTERNS

Median Session
42m

Average Pause Ratio
12%

Self-rated Focus
4.1 / 5
```

---

# 34. Mood와 Energy도 Stat이 아니다

Mood / Energy는 Context Feature다.

예:

```text
Mood
Energy
Stress
```

나중에 충분한 데이터가 쌓이면:

```text
Sessions rated Energy 4–5
tended to last 18% longer.
```

처럼 correlation을 보여줄 수 있다.

인과관계처럼 표현하지 않는다.

---

# 35. Skill Level의 재정의

`Snowflake LV.18`을 실제 기술 능력처럼 표현하면 안 된다.

학습시간과 실력이 동일하지 않기 때문이다.

따라서 이름:

```text
Practice Level
```

예:

```text
Data Engineering
Practice Lv.18

English
Practice Lv.12
```

의미:

> 해당 영역에서 얼마나 지속적으로 활동했는가.

실제 능력평가가 아니다.

---

# 36. GenAI의 역할

GenAI는 Stat 계산기가 아니다.

핵심 원칙:

> AI가 사용자를 평가하지 말고, 사용자의 행동을 이해하게 한다.

구조:

```text
GenAI
↓
Structured Feature Extraction

Algorithm
↓
Stat Calculation
```

---

# 37. GenAI를 사용하지 말아야 하는 방식

금지:

```text
Prompt:
Evaluate user productivity.

AI:
Calibration = 81
Reliability = 72
Focus = 87
```

이 방식은 일관성, 재현성, 신뢰성이 없다.

---

# 38. GenAI Task Classification

Task:

```text
Airflow Celery Worker에서 dbt 실행 테스트
```

AI Output:

```json
{
  "domain": "data_engineering",
  "skills": [
    "airflow",
    "dbt",
    "docker"
  ],
  "task_type": "debugging",
  "complexity": 4,
  "confidence": 0.88
}
```

AI는 이런 semantic feature 생성에 사용한다.

---

# 39. Task Type

예:

```text
Reading
Study
Coding
Debugging
Documentation
Writing
Meeting
Planning
Design
Research
Exercise
```

Duration Prediction에서 매우 중요한 Feature다.

---

# 40. Complexity

AI가 Task Complexity 후보를 생성할 수 있다.

```text
1 Routine
2 Simple
3 Moderate
4 Complex
5 Highly ambiguous
```

단:

```text
complexity = 4
```

를 Stat으로 직접 사용하지 않는다.

Duration Prediction Feature로 사용한다.

---

# 41. Work Log Interpretation

Work Log:

```text
docker 환경 문제가 생겨서
생각보다 오래 걸렸다.

dbt 설정 자체는 금방 끝났지만
worker가 profile을 인식하지 못해서
디버깅하는 데 시간이 많이 들었다.
```

AI:

```json
{
  "delay_reason": "environment_issue",
  "scope_changed": false,
  "unexpected_blocker": true,
  "blocker_type": "technical",
  "confidence": 0.91
}
```

---

# 42. AI가 Stat을 수정하지 않는다

AI가:

```text
unexpected blocker
```

를 찾았다고 해서 마음대로 Calibration 계산에서 제외하지 않는다.

Flow:

```text
AI detects blocker
↓
User confirms if necessary
↓
structured flag created
↓
Stat engine applies predefined weight
```

예:

```text
normal event
weight 1.0

confirmed external blocker
weight 0.3
```

---

# 43. AI Feature Provenance

AI가 만든 모든 Feature에는 provenance를 저장한다.

예:

```text
task_features

id
task_id
feature_type
feature_value

source
AI
USER
SYSTEM

confidence

model
model_version

created_at
```

사용자가 수정하면:

```text
source = USER
confidence = 1.0
```

---

# 44. Similar Task Detection

Task Similarity에는 Embedding을 사용할 수 있다.

예:

```text
Snowflake grant 공부

Snowflake RBAC 공부

Role permission 구조 정리
```

Semantic similarity가 높으면 같은 그룹으로 묶을 수 있다.

과거:

```text
78m
92m
85m
```

추천:

```text
85m
```

---

# 45. Duration Recommendation

처음부터 LLM에게 시간을 맞히게 하지 않는다.

과거 데이터 기반 통계가 중심이다.

예:

```text
Task Type:
English Listening

Recent actual:
38
42
36
51
40
43
```

Median:

```text
41m
```

추천:

```text
45m
```

---

# 46. Variance / Confidence

다음 데이터:

```text
59
62
61
58
60
```

추천:

```text
60m
Confidence HIGH
```

반면:

```text
30
95
42
120
55
```

추천:

```text
45–90m
Confidence LOW
```

단일 숫자를 억지로 제시하지 않는다.

---

# 47. Daily Capacity

매우 중요한 Analytics다.

예:

사용자 계획:

```text
Tomorrow
5h 40m
```

최근 실제 집중 가능량:

```text
Typical weekday capacity
3h 15m
```

System:

```text
SYSTEM NOTICE

During the last 4 weeks,
your typical weekday focus capacity
was about:

3h 15m

Tomorrow you scheduled:

5h 40m

This is significantly above
your recent pattern.

[Adjust Schedule]
[Keep Plan]
```

Capacity는 Stat이 아니다.

```text
Analytics
```

다.

---

# 48. System AI

AI UI는:

```text
AI
```

보다:

```text
SYSTEM
```

이라는 Persona로 표현할 수 있다.

예:

```text
SYSTEM ANALYSIS
SYSTEM NOTICE
SYSTEM RECOMMENDATION
SYSTEM UPDATE
```

하지만 근거를 표시한다.

```text
Based on 8 similar sessions
```

---

# 49. AI System Assessment

Objective Stats와 AI 평가를 분리한다.

Objective:

```text
Calibration   82
Reliability   76
Consistency   81
Recovery      91
```

AI:

```text
SYSTEM ASSESSMENT

Planning tendency
Slightly optimistic

Work style
Longer focused sessions

Current risk
Overloaded evenings

Strong pattern
Reliable morning execution
```

이 영역은 숫자가 아니라 qualitative profile이다.

---

# 50. System Explanation

Stat 계산:

```text
Calibration
72 → 78
```

AI에게 underlying metrics 제공:

```text
previous_bias: +31%
current_bias: +14%
recent_tasks: ...
```

AI Output:

```text
SYSTEM

Your estimates became more accurate
during the last three weeks.

Typical underestimation:

+31% → +14%
```

즉:

```text
Algorithm calculates.
AI explains.
```

---

# 51. Daily Quest

Daily Quest는 일반 Task와 다르다.

Task:

```text
Snowflake Study
Portfolio UI
English Listening
```

Daily Quest:

```text
DAILY QUEST

Build Momentum

□ Focus ≥ 90m
□ Complete 2 planned tasks
□ Practice English ≥ 30m
```

즉 여러 행동을 묶은 Meta Objective다.

---

# 52. AI Quest Generation

AI가 Quest 후보를 생성할 수 있다.

Input:

```text
available time
today tasks
recent capacity
current goals
recent weak patterns
```

AI:

```text
Daily Quest candidate

1. Complete highest-priority task
2. Focus at least 90 minutes
3. English ≥30 minutes
```

그 후 Rule Engine이 검증한다.

```text
Generated Quest
↓
Capacity Validation
↓
Conflict Validation
↓
Final Quest
```

LLM Output을 바로 실행하지 않는다.

---

# 53. Weekly Quest

Daily Streak보다 중요하게 설계한다.

예:

```text
WEEKLY QUEST

Maintain Momentum

□ Focus ≥ 8h
□ Complete ≥75% committed blocks
□ English ≥3 sessions
□ Keep daily planning within capacity
```

Reward:

```text
+300 XP
```

---

# 54. Main Quest

Project를 Main Quest처럼 표현할 수 있다.

예:

```text
MAIN QUEST

Build Portfolio V2

Progress
████████████░░ 72%

Objectives

✓ Architecture
✓ Database
✓ Design System
□ Scheduler
□ Analytics
□ Deployment
```

---

# 55. Recovery Quest

Penalty System을 만들지 않는다.

금지:

```text
Failed Quest

-100 XP
```

대신:

```text
RECOVERY QUEST

Restart Momentum

□ Select one important task
□ Schedule 30 minutes
□ Start the session

Reward
+40 XP
```

철학:

```text
Failure
→ Punishment
```

가 아니라:

```text
Failure
→ Recovery
```

이다.

---

# 56. Achievement

실제 의미 있는 행동에 부여한다.

예:

```text
FIRST STEP
First Focus Session

RELIABLE PLANNER
10 sessions with ±10% estimate error

CONSISTENT BUILDER
Weekly Quest completed 4 weeks

RECOVERY
Returned after extended inactivity

DEEP SESSION
10 sessions over 60 minutes
```

---

# 57. Title

Identity를 강화하는 장치.

예:

```text
BUILDER

CONSISTENT OPERATOR

EARLY STARTER

RELIABLE PLANNER

SYSTEM THINKER
```

Title은 특정 작품 명칭을 복제하지 않고 서비스 독자적인 이름을 사용한다.

---

# 58. System Notification

세 단계.

## Tiny

```text
+20 XP
```

## Toast

```text
QUEST CLEARED

Snowflake Study
+40 XP
```

## Event

```text
LEVEL UP

17 → 18
```

Full-screen UI는 드문 이벤트에서만 사용한다.

---

# 59. UX Style

평상시:

```text
Calm Productivity UI
```

이벤트:

```text
System UI
```

즉:

```text
Normal work
→ minimal UI

Meaningful event
→ System animation
```

항상 neon / glow / animation을 사용하지 않는다.

---

# 60. Gamification Settings

사용자가 끌 수 있어야 한다.

```text
Gamification Mode      ON
Quest Terminology      ON
System Animations      ON
Sound Effects          OFF
Achievement Toasts     ON
```

Gamification을 꺼도 서비스 핵심 기능은 정상적으로 작동해야 한다.

---

# 61. Main Screen

메인 화면의 중심은 항상 Task + Calendar다.

예:

```text
┌─────────────────────────────────────────────────────┐
│ LV.17  ███████░░  1420 / 1800 XP                  │
├───────────────┬─────────────────────────────────────┤
│ QUESTS        │ WEEK CALENDAR                       │
│               │                                     │
│ + Add         │        Snowflake Study              │
│               │        19:00–20:20                  │
│ Snowflake     │                                     │
│ English       │        English Listening            │
│ Portfolio     │        21:00–21:40                  │
│               │                                     │
├───────────────┴─────────────────────────────────────┤
│ ACTIVE QUEST                                        │
│ Snowflake Study    00:38:42     Pause     Finish   │
└─────────────────────────────────────────────────────┘
```

Gamification Dashboard가 작업 UI를 대체하면 안 된다.

---

# 62. Progress Page

별도의 Progress 페이지:

```text
PLAYER STATUS

LEVEL 17

XP
████████████░░


BEHAVIOR

CALIBRATION
82

RELIABILITY
76

CONSISTENCY
81

RECOVERY
91
```

아래:

```text
YOUR PATTERNS

Typical Session
46m

Typical Daily Capacity
3h 15m

Planning Bias
+14%

Reliable Time
09:00–12:00

High Reschedule Period
19:00–21:00
```

그리고:

```text
PRACTICE

Data Engineering   Lv.18
English            Lv.12
Writing            Lv.7
```

---

# 63. Recommended Database Entities

기존:

```text
users

tasks

time_blocks

focus_sessions

focus_session_pauses

work_logs

daily_reviews
```

추가:

```text
player_profiles

xp_events

player_stats

player_stat_history

practice_domains

user_practice_domains

task_practice_domains

task_features

quests

quest_objectives

achievements

user_achievements

titles

user_titles

system_insights
```

---

# 64. player_profiles

```text
id
user_id

level
total_xp
current_level_xp

equipped_title_id

created_at
updated_at
```

---

# 65. xp_events

EXP는 Ledger 형태로 기록한다.

```text
id
user_id

event_type

task_id
focus_session_id
quest_id

xp_amount

metadata

created_at
```

절대로:

```text
player.total_xp += 20
```

만 하고 원인을 버리지 않는다.

---

# 66. player_stats

```text
id
user_id

calibration_score
reliability_score
consistency_score
recovery_score

calculated_at
```

---

# 67. player_stat_history

```text
id
user_id

stat_type
value

eligible_sample_count

window_start
window_end

created_at
```

History를 저장해야:

```text
Calibration
52 → 68 → 76 → 84
```

같은 성장 시각화가 가능하다.

---

# 68. task_features

AI / User / System Feature 저장.

```text
id
task_id

feature_type
feature_value

source
AI | USER | SYSTEM

confidence

model
model_version

created_at
```

---

# 69. quests

```text
id
user_id

type
DAILY
WEEKLY
MAIN
CHALLENGE
RECOVERY

title
description

status

start_at
end_at

reward_xp

generated_by
SYSTEM | AI | USER

created_at
```

---

# 70. quest_objectives

```text
id
quest_id

metric

target_value
current_value

operator

completed_at
```

Metric 예:

```text
FOCUS_MINUTES

COMMITTED_BLOCK_COMPLETION

TASK_COMPLETION

PRACTICE_MINUTES

CALIBRATION_TARGET
```

---

# 71. Practice System

```text
practice_domains

id
name
parent_id
```

예:

```text
Technology
└── Data Engineering
    ├── Snowflake
    ├── Airflow
    ├── dbt
    └── Spark
```

---

# 72. Architecture

최종 Logical Architecture:

```text
                         USER
                          │
                          ↓
                    TASK / CALENDAR
                          │
            ┌─────────────┴─────────────┐
            ↓                           ↓
      Planned Data                Actual Data
      Time Blocks                Focus Sessions
            │                           │
            └─────────────┬─────────────┘
                          ↓
                    RAW BEHAVIOR
                          │
              ┌───────────┴───────────┐
              ↓                       ↓
        Analytics Engine            GenAI
              │                       │
              │                  Classification
              │                  Interpretation
              │                  Explanation
              │                       │
              └───────────┬───────────┘
                          ↓
                   Structured Features
                          │
              ┌───────────┴───────────┐
              ↓                       ↓
          Stat Engine          Recommendation Engine
              │                       │
              ↓                       ↓
          Player Stats          Better Scheduling
              │                       │
              └───────────┬───────────┘
                          ↓
                    GAMIFICATION
                          │
                ┌─────────┼─────────┐
                ↓         ↓         ↓
               XP       Quest   Achievement
                │
                ↓
              Level
```

---

# 73. AI와 통계 엔진의 책임 분리

## GenAI

담당:

```text
Task classification
Task complexity estimation
Semantic similarity
Work log interpretation
System explanation
Quest suggestion
Pattern summarization
```

담당하지 않음:

```text
Final Stat score
Final XP rule
Objective completion
Raw duration calculation
Calendar commitment calculation
```

---

# 74. Statistical Engine

담당:

```text
Calibration
Reliability
Consistency
Recovery

Duration median
Duration distribution
Bias
Variance
Confidence
Capacity
Rolling trends
```

결과는 reproducible해야 한다.

---

# 75. Recommendation Engine

사용 입력:

```text
Task type
Practice domain
Complexity
Historical duration
Recent similar tasks
Time of day
Day of week
Historical variance
Daily capacity
```

Output:

```text
recommended_duration

recommended_range

confidence

reason
```

예:

```text
Recommended
85–95 min

Confidence
High

Based on
8 similar debugging sessions
```

---

# 76. MVP 구현 순서

AI부터 만들지 않는다.

## Phase 1 — Core Workflow

```text
Task Quick Add

Task Inbox

Weekly Calendar

Drag & Drop

Resize

Reschedule

Focus Start

Pause / Resume

Finish Focus

Complete / Continue Later

Multiple Focus Sessions

Planned vs Actual
```

이 단계가 완벽해야 한다.

---

# 77. Phase 2 — Analytics

```text
Task Type

Actual Duration

Planning Error

Planning Bias

Committed Time Block

Reliability

Consistency

Recovery

Typical Session Duration

Daily Capacity
```

---

# 78. Phase 3 — Gamification

```text
XP

Level

System Notification

Quest Clear

Daily Quest

Weekly Quest

Recovery Quest

Achievements

Titles

Practice Levels
```

---

# 79. Phase 4 — GenAI

```text
Task Classification

Complexity Classification

Similar Task Detection

Work Log Interpretation

System Assessment

Stat Explanation

Quest Generation

Recommendation Explanation
```

---

# 80. Phase 5 — Advanced Personal Planning

충분한 데이터를 확보한 뒤:

```text
Personal capacity prediction

Time-of-day recommendation

Automatic calendar suggestions

Task sequencing

Overplanning warning

Context-aware duration prediction

Weekly planning assistant
```

을 추가한다.

---

# 81. 제품에서 절대로 하지 말아야 할 것

다음 구조는 피한다.

### 1.

```text
AI가 사용자를 평가

Discipline = 57
```

금지.

### 2.

```text
작업시간이 길수록 XP 증가
```

금지.

### 3.

```text
Task 개수가 많을수록 높은 점수
```

금지.

### 4.

```text
실패하면 XP 감소
```

금지.

### 5.

```text
Streak가 끊기면 progress 초기화
```

금지.

### 6.

```text
AI가 Calendar를 마음대로 수정
```

금지.

AI는 항상:

```text
Recommend
↓
User confirms
```

구조.

---

# 82. 중요한 UX 철학

## Capture should be instant

```text
type → Enter
```

## Planning should be visual

```text
Drag
Drop
Resize
Move
```

## Work should start from the plan

```text
Calendar
↓
Start Focus
```

## Actual data should be automatic

Timer 기반.

## Reflection should be optional but useful

사용자를 귀찮게 하지 않는다.

## AI should explain, not judge

AI는 행동을 해석하고 설명한다.

## Stats should be measurable

측정할 수 없는 능력은 점수로 만들지 않는다.

---

# 83. 최종 System Experience 예시

사용자가:

```text
Task:
Airflow Celery Worker에서 dbt 실행 테스트

Estimate:
60m
```

Calendar에:

```text
19:00–20:00
```

배치.

System:

```text
SYSTEM RECOMMENDATION

Similar debugging tasks
usually took:

85–105 min

Recommended:
95 min

[Use 95 min]
[Keep 60 min]
```

사용자:

```text
Use 95 min
```

Focus 시작.

```text
ACTIVE QUEST

Airflow + dbt debugging

00:42:13

Goal
95 min
```

작업 완료:

```text
Actual
101 min
```

Work Log:

```text
Docker profile 문제 때문에
예상보다 조금 오래 걸렸다.
```

AI:

```text
SYSTEM ANALYSIS

Primary delay:
Environment troubleshooting

Task type:
Debugging

The final duration was
close to the system estimate.
```

Algorithm:

```text
Calibration
78 → 80
```

EXP:

```text
+40 XP
```

System:

```text
QUEST CLEARED

Airflow + dbt debugging

Planned
95m

Actual
101m

Calibration
78 → 80

+40 XP
```

다음 유사 Task:

```text
dbt incremental debugging
```

System:

```text
Recommended

90–105 min

Confidence
High

Based on
9 similar sessions
```

이것이 이 서비스가 지향해야 하는 핵심 경험이다.

---

# 84. 최종 Product Definition

이 제품을 다음처럼 정의한다.

> A personal planning system that learns how the user actually works and gradually improves the realism of future plans.

Gamification의 역할:

> Make personal growth visible and rewarding.

GenAI의 역할:

> Understand behavior and explain patterns.

Stat Engine의 역할:

> Measure objectively.

Recommendation Engine의 역할:

> Improve future plans.

Calendar의 역할:

> Turn intention into commitment.

Focus의 역할:

> Turn commitment into actual behavioral data.

---

# 85. Claude 구현 지시

현재 코드베이스와 기존 설계를 검토한 뒤 위 원칙을 기준으로 다음을 수행하라.

1. 현재 Domain Model이 `Task`, `TimeBlock`, `FocusSession`, `WorkLog`을 제대로 분리하고 있는지 검토한다.

2. 하나의 Task가 여러 `TimeBlock`, 여러 `FocusSession`을 가질 수 있도록 수정한다.

3. 계획 데이터와 실제 작업 데이터를 절대 덮어쓰지 않도록 schema를 개선한다.

4. Task Inbox와 Weekly Calendar 사이 Drag & Drop 기반 Scheduling UX를 개선한다.

5. Calendar Block에서 직접 Focus를 시작할 수 있도록 한다.

6. Focus Stop과 Task Completion을 분리한다.

7. Planned vs Actual 데이터를 저장하고 Analytics Layer를 구성한다.

8. `Calibration`, `Reliability`, `Consistency`, `Recovery`의 계산 로직을 독립적인 Stat Engine으로 구현한다.

9. Stat 계산 로직은 GenAI에 의존하지 않는 deterministic algorithm으로 작성한다.

10. AI Layer는 task classification, semantic feature extraction, work-log interpretation, system explanation 용도로만 사용한다.

11. 모든 AI-derived feature에는 source / confidence / model metadata를 저장한다.

12. XP와 Stat을 분리한다.

13. XP event는 반드시 ledger 형태로 저장한다.

14. Level, Quest, Achievement, Title을 별도의 Gamification Domain으로 구현한다.

15. Gamification Domain이 Core Task Domain과 강결합되지 않도록 한다.

16. Daily / Weekly / Recovery Quest를 Meta Objective로 구현한다.

17. AI-generated Quest는 Rule Validation 이후에만 사용자에게 제공한다.

18. 사용자의 과거 Task를 기반으로 duration recommendation을 제공한다.

19. recommendation에는 반드시 `confidence`와 `reason`을 포함한다.

20. 메인 UI는 계속 Task + Calendar 중심으로 유지한다.

21. Gamification은 의미 있는 이벤트 순간에만 강하게 노출한다.

22. Gamification Mode를 끌 수 있도록 한다.

23. 전체 구조를 Production-ready 관점에서 다시 설계한다.

24. 필요한 경우 기존 Architecture / DB Schema / Component Structure / API / State Management를 리팩터링한다.

25. 구현 전 변경 사항을 다음 순서로 정리해서 제시한다.

```text
1. Current architecture problems

2. Proposed architecture

3. Domain model changes

4. Database schema changes

5. API changes

6. Frontend component changes

7. State management changes

8. Analytics / stat formulas

9. AI integration design

10. Gamification engine

11. Migration strategy

12. Implementation priority

13. Risks / edge cases

14. Test strategy
```

이후 실제 코드 수정에 들어간다.

가장 중요한 것은 게임처럼 보이게 만드는 것이 아니다.

**사용자의 실제 행동을 정확하게 기록하고, 그 데이터를 기반으로 자기 이해가 성장하는 경험을 만드는 것**을 최우선으로 한다.