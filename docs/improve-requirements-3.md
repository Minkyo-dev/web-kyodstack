# Solo Leveling Personal Growth System
## Purpose · Identity · Goal · Strategy · Tactics · Quest 통합 설계

---

# 1. 제품 방향 수정

기존 시스템의 핵심 경험은 유지한다.

사용자가 느끼는 서비스의 표면은 여전히 **Solo Leveling의 System UI**여야 한다.

```text
SYSTEM
QUEST
DAILY QUEST
MAIN QUEST
STATUS
STATS
LEVEL
EXP
LEVEL UP
SYSTEM MESSAGE
```

이를 일반적인 생산성 SaaS처럼 바꾸지 않는다.

그러나 System 내부의 실제 Logic은 단순한 RPG 구조가 되어서는 안 된다.

기존의 단순 구조:

```text
Task
↓
Complete
↓
EXP
↓
Level Up
```

를 다음과 같은 현실적인 성장 구조로 확장한다.

```text
PURPOSE
   ↓
IDENTITY
   ↓
GOAL
   ↓
STRATEGY
   ↓
TACTIC
   ↓
QUEST
   ↓
ACTION
   ↓
EVIDENCE
   ↓
REFLECTION
   ↓
STAT
   ↓
LEVEL
```

이 구조가 서비스 전체의 기본 철학이다.

---

# 2. 각 개념의 역할을 명확하게 구분한다

가장 중요한 것은 Purpose / Goal / Strategy / Tactics / Quest가 서로 중복되지 않도록 하는 것이다.

## Purpose — 왜 하는가

가장 상위 개념.

사용자가 왜 어떤 방향으로 살아가고 싶은지를 정의한다.

예:

```text
PURPOSE

Build a life where I can choose
what to work on, where to live,
and how to spend my time.
```

또는:

```text
Become capable of creating
valuable software independently.
```

Purpose는 완료되는 것이 아니다.

방향을 제공한다.

---

# 3. Identity — 어떤 사람이 되고 싶은가

Atomic Habits의 Identity 개념은 Purpose 바로 아래에 위치한다.

```text
PURPOSE

Build an independent life.

↓

IDENTITIES

Reliable Engineer
English Speaker
Healthy Person
Builder
```

Purpose가 **Why**라면 Identity는:

> 그 목적을 이루기 위해 나는 어떤 사람이 되어야 하는가?

이다.

예:

```text
Purpose

Global career freedom

↓

Identity

English Speaker
Strong Engineer
Independent Builder
```

---

# 4. Goal — 무엇을 달성할 것인가

Goal은 명확한 결과를 가진다.

```text
GOAL

Reach B2 English speaking ability
by June 2027.
```

또는:

```text
GOAL

Launch Personal Productivity App MVP.
```

Goal에는 가능하면 다음 속성을 가진다.

```text
Target
Deadline
Success Criteria
Related Identity
Related Purpose
```

즉:

```text
Purpose
Why?

Goal
What?
```

---

# 5. Strategy — 목표를 어떻게 달성할 것인가

여기서 Strategy와 Task를 반드시 분리해야 한다.

Strategy는 행동 목록이 아니다.

Strategy는:

> 제한된 시간과 자원을 고려했을 때 목표를 달성하기 위해 어떤 접근 방식을 선택할 것인가?

이다.

예:

```text
GOAL

Improve English speaking.

STRATEGY

Use comprehensible input and
repeated speaking practice rather than
focusing primarily on grammar study.
```

또는:

```text
GOAL

Launch Scheduler MVP.

STRATEGY

Ship the smallest usable version first
and validate personal usage before
building AI features.
```

전략에는 **선택과 포기**가 있어야 한다.

좋은 Strategy:

```text
Focus on speaking and listening.

Do not spend significant time
memorizing isolated vocabulary.
```

나쁜 Strategy:

```text
Study English.
```

이는 Strategy가 아니다.

---

# 6. Tactic — 전략을 실제 행동 방식으로 변환

Tactic은 Strategy를 실행하기 위한 구체적 방식이다.

예:

```text
STRATEGY

Improve speaking through
repeated exposure and output.

↓

TACTICS

• Watch 15 minutes of English content daily
• Shadow 5 sentences
• Record a 2-minute summary
• Review unknown expressions
```

또는 개발 목표:

```text
STRATEGY

Build MVP before advanced AI.

↓

TACTICS

• Implement weekly calendar first
• Track planned vs actual time
• Collect 30 days of behavioral data
• Delay AI prediction until enough data exists
```

---

# 7. Quest — 오늘 실행해야 하는 단위

Quest는 가장 작은 실행 단위다.

```text
TACTIC

Practice English listening daily

↓

DAILY QUEST

Watch 15 minutes of The Intern
and summarize the scene.
```

따라서:

```text
Purpose
↓
Identity
↓
Goal
↓
Strategy
↓
Tactic
↓
Quest
```

이라는 연결관계가 존재해야 한다.

---

# 8. 전체 예시

한 사용자의 영어 성장 구조를 예로 들면 다음과 같다.

```text
PURPOSE

Build a career without
geographical limitations.

↓

IDENTITY

English Speaker

↓

GOAL

Comfortably participate in
English technical conversations.

↓

STRATEGY

Prioritize listening comprehension
and spontaneous speaking.

↓

TACTICS

• Daily listening
• Shadowing
• Speaking summaries
• Weekly conversation practice

↓

DAILY QUEST

Watch 15 min English video
Shadow 5 sentences
Record 2 min summary
```

Todo가 그냥 존재하는 것이 아니라 그 위에 **이유와 방향이 연결**된다.

---

# 9. Solo Leveling UI에서는 이를 어떻게 표현할 것인가

일반적인 생산성 앱처럼 다음과 같이 보여주지 않는다.

```text
Purpose
Goals
Strategy
Tasks
```

너무 기업용 OKR Tool처럼 보인다.

Solo Leveling의 세계관 안에서 표현한다.

---

# 10. SYSTEM — Purpose

Purpose는 System의 가장 상위 Directive로 표현할 수 있다.

```text
━━━━━━━━━━━━━━━━━━━━━━

SYSTEM DIRECTIVE

Build a life with freedom,
capability, and independence.

━━━━━━━━━━━━━━━━━━━━━━
```

이를 사용자의 **Main Directive**라고 부를 수 있다.

DB Domain은 `purpose`지만 UI에서는:

```text
SYSTEM DIRECTIVE
```

라고 표현한다.

---

# 11. Identity는 CLASS 개념으로 활용 가능

Solo Leveling의 Class 시스템과 연결하면 자연스럽다.

예:

```text
CLASS

BUILDER
```

그리고 여러 Identity는 Character Traits처럼 존재할 수 있다.

```text
IDENTITIES

Reliable Engineer
English Speaker
Healthy Person
Creator
```

다만 실제 게임처럼 Class가 능력을 제한해서는 안 된다.

UI 표현일 뿐이다.

---

# 12. Goal은 MISSION으로 표현

Goal은 장기적인 Mission이다.

```text
━━━━━━━━━━━━━━━━━━━━━━

MAIN MISSION

Launch Personal Growth OS MVP

Deadline
December 2026

Progress
████████░░ 72%

━━━━━━━━━━━━━━━━━━━━━━
```

Quest와 Mission을 구분한다.

```text
MISSION
Long-term outcome

QUEST
Executable action
```

---

# 13. Strategy는 PATH로 표현

Strategy는 사용자가 선택한 성장 경로다.

Solo Leveling 스타일 UI에서는:

```text
PATH
```

또는:

```text
STRATEGY
```

둘 중 하나를 사용할 수 있지만 내부적으로 Strategy 의미는 유지한다.

예:

```text
━━━━━━━━━━━━━━━━━━━━━━

SELECTED PATH

MVP-FIRST DEVELOPMENT

Build the minimum useful product,
use it personally,
collect behavioral data,
then add intelligence.

━━━━━━━━━━━━━━━━━━━━━━
```

중요한 점:

Strategy는 사용자의 현재 선택을 보여준다.

---

# 14. Tactic은 PROTOCOL로 표현 가능

반복적으로 사용하는 실행 방식은:

```text
PROTOCOL
```

로 표현할 수 있다.

예:

```text
FOCUS PROTOCOL

1. Select one task
2. Work for 50 minutes
3. Avoid context switching
4. Record actual duration
5. Review outcome
```

또는:

```text
ENGLISH TRAINING PROTOCOL

Listen
↓
Shadow
↓
Summarize
↓
Review
```

이런 표현은 Solo Leveling System UI와도 상당히 잘 맞는다.

---

# 15. 최종 UI Vocabulary

내부 Domain과 사용자 UI를 분리한다.

| Domain | UI 표현 |
|---|---|
| Purpose | System Directive |
| Identity | Identity / Class |
| Goal | Mission |
| Strategy | Path |
| Tactic | Protocol |
| Task | Quest |
| Habit | Daily Quest |
| Failure Recovery | Recovery Quest |
| Metrics | Stats |
| Experience | EXP |
| Growth Milestone | Level Up |
| Analysis | System Analysis |
| Recommendation | System Message |

이 Mapping을 제품 전체에서 일관되게 사용한다.

---

# 16. 전체 구조

```text
                  SYSTEM

                     │
                     ▼

             SYSTEM DIRECTIVE
                 Purpose

                     │
                     ▼

               IDENTITY
             Who am I becoming?

                     │
                     ▼

                MISSION
                  Goal

                     │
                     ▼

                  PATH
                Strategy

                     │
                     ▼

               PROTOCOL
                 Tactic

                     │
                     ▼

                 QUEST
                  Task

                     │
                     ▼

                 ACTION

                     │
                     ▼

                EVIDENCE

                     │
                     ▼

                  STATS

                     │
                     ▼

                 LEVEL UP
```

---

# 17. Atomic Habits는 어디에 들어가는가

Atomic Habits 자체가 하나의 메뉴가 되어서는 안 된다.

Atomic Habits는 시스템의 **행동 설계 철학**으로 녹인다.

대표적인 구조:

```text
Identity
↓
Repeated Action
↓
Evidence
↓
Identity Reinforcement
```

따라서:

```text
IDENTITY

English Speaker

↓

DAILY QUEST

English Listening
20 min

↓

EVIDENCE

18 / 23 sessions completed

↓

SYSTEM

Your recent actions continue
to reinforce the
"English Speaker" identity.
```

---

# 18. Habit은 Strategy가 아니다

이 개념을 반드시 구분한다.

예:

```text
Goal
Speak English fluently

Strategy
Maximize repeated exposure and output

Tactic
20-minute listening session

Habit
Do it Monday-Friday at 7 PM

Quest
Today's 20-minute listening session
```

Habit은 Tactic을 반복시키는 **Execution Rule**이다.

따라서 관계는:

```text
Strategy
   ↓
Tactic
   ↓
Habit
   ↓
Daily Quest
```

라고 볼 수 있다.

---

# 19. Planning도 Strategy와 분리한다

Calendar 계획 역시 Strategy가 아니다.

```text
Strategy

Use morning hours for
high cognitive-load work.
```

그 전략으로부터:

```text
Tactic

Schedule architecture work
before noon.
```

이 생성된다.

그리고 실제 Calendar:

```text
09:00 - 11:00
Architecture Design
```

이것이 Quest Plan이다.

---

# 20. 사용자가 매일 모든 계층을 관리하게 하면 안 된다

이것은 매우 중요한 UX 원칙이다.

사용자에게 매일:

```text
Purpose
Identity
Goal
Strategy
Tactic
Quest
```

를 다 입력시키면 시스템이 지나치게 복잡해진다.

각 개념마다 변경 주기가 다르다.

```text
Purpose
Months / Years

Identity
Months / Years

Goal
Weeks / Months / Years

Strategy
Weeks / Months

Tactic
Days / Weeks

Quest
Hours / Days
```

따라서 UI 노출 빈도도 다르게 한다.

---

# 21. Daily Screen에서는 Quest만 보인다

사용자가 매일 보는 것은 단순해야 한다.

```text
SYSTEM

Wednesday
September 30

━━━━━━━━━━━━━━━━━━

MAIN QUEST

Build Calendar Drag & Drop
09:00 - 11:00

━━━━━━━━━━━━━━━━━━

DAILY QUESTS

○ English Listening
○ Reading
○ Workout

━━━━━━━━━━━━━━━━━━

CAPACITY

Planned      4h 30m
Recommended  5h 00m

━━━━━━━━━━━━━━━━━━

SYSTEM MESSAGE

Your development estimates have
improved by 11% this month.
```

Purpose / Goal / Strategy를 매일 강제로 보여주지 않는다.

---

# 22. 하지만 Quest 상세에서는 연결성을 보여준다

사용자가 Quest를 클릭하면:

```text
QUEST

Implement Calendar Drag & Drop
```

아래에:

```text
MISSION

Launch Scheduler MVP
```

그리고:

```text
PATH

MVP-First Development
```

를 작은 Breadcrumb 형태로 보여준다.

예:

```text
Launch MVP
   › MVP-First Path
      › Calendar Foundation
         › Implement Drag & Drop
```

사용자는:

> 내가 지금 이 일을 왜 하고 있지?

라는 질문에 바로 답할 수 있다.

---

# 23. 모든 Quest가 Mission과 연결될 필요는 없다

현실에는 다음 Task도 존재한다.

```text
Buy groceries
Reply to email
Clean room
Book dentist
```

억지로 모든 Task를 Purpose에 연결하면 시스템이 우스워진다.

따라서 Quest를 두 종류로 나눈다.

```text
Growth Quest
Maintenance Quest
```

### Growth Quest

Purpose / Identity / Mission에 연결된다.

### Maintenance Quest

삶을 유지하기 위한 작업이다.

예:

```text
Laundry
Groceries
Bills
Cleaning
```

이들은 EXP는 받을 수 있지만 Identity Growth에는 강하게 반영하지 않는다.

---

# 24. Strategy Review System

Weekly Review 때 가장 중요한 기능 중 하나로 만든다.

시스템이 단순히:

```text
You completed 32 tasks.
```

라고 하는 것이 아니라:

```text
SYSTEM ANALYSIS

MISSION
Improve English Speaking

CURRENT PATH
Daily Listening + Speaking Practice

Last 4 Weeks

Listening Completion
82%

Speaking Completion
37%

Observation

You consistently complete listening,
but speaking practice is frequently skipped.
```

그리고:

```text
SYSTEM QUESTION

Is the strategy failing,
or is the tactic too difficult?
```

라는 질문을 던진다.

---

# 25. Strategy와 Execution을 구분해서 실패를 분석한다

사용자가 목표를 달성하지 못한 이유를 무조건 의지 부족으로 판단해서는 안 된다.

실패 원인은 여러 계층에 존재한다.

```text
Purpose Problem
↓
Goal Problem
↓
Strategy Problem
↓
Tactic Problem
↓
Planning Problem
↓
Execution Problem
```

예:

```text
Mission
English Speaking

Strategy
Practice 60 minutes every day

Actual
3 / 14 days completed
```

System은:

```text
"You lack discipline."
```

이라고 하면 안 된다.

대신:

```text
SYSTEM ANALYSIS

The current tactic requires
60 minutes per session.

Your actual sustainable session
length is approximately 22 minutes.

The issue appears to be
tactic sustainability rather than
mission commitment.
```

라고 판단한다.

이것이 이 시스템의 핵심 철학이다.

---

# 26. Failure Diagnosis

실패 시 시스템은 다음 순서로 분석한다.

```text
Was the Goal unrealistic?
        ↓
Was the Strategy ineffective?
        ↓
Was the Tactic unsustainable?
        ↓
Was the Plan unrealistic?
        ↓
Was Execution interrupted?
        ↓
Was Recovery successful?
```

따라서 실패 자체가 데이터가 된다.

---

# 27. SYSTEM이 해야 하는 가장 중요한 질문

AI는 사용자에게 무조건 더 열심히 하라고 해서는 안 된다.

시스템은 다음 질문을 다뤄야 한다.

### Purpose

```text
Is this still important to you?
```

### Goal

```text
Is this outcome still worth pursuing?
```

### Strategy

```text
Is this approach working?
```

### Tactic

```text
Can you sustain this action?
```

### Planning

```text
Does this fit your actual capacity?
```

### Execution

```text
What prevented execution?
```

### Recovery

```text
How quickly can you restart?
```

---

# 28. Stat System과 연결

기존 Stats는 유지한다.

추천 핵심 Stat:

```text
FOCUS
EXECUTION
CONSISTENCY
PLANNING
RECOVERY
```

하지만 Goal / Strategy 자체를 Stat으로 만들지는 않는다.

Stat은 여전히 **실제 행동을 관찰한 결과**다.

---

# 29. 새로운 핵심 지표 하나 추가 가능

기존 Stats 외에 장기적으로 다음을 고려할 수 있다.

```text
ALIGNMENT
```

하지만 일반 Stat처럼 캐릭터 능력치로 쓰기보다는 System Metric으로 사용하는 것이 좋다.

Alignment는:

> 사용자의 시간과 행동이 본인이 선택한 Goal / Strategy와 얼마나 연결되어 있는가

를 의미한다.

예:

```text
THIS WEEK

Total Active Time
32h

Mission-aligned Time
17h

Alignment
53%
```

하지만 이를:

```text
You are only 53% aligned.
```

처럼 판단적으로 표현하지 않는다.

---

# 30. Weekly Status Screen

Weekly Status는 다음과 같이 발전시킨다.

```text
━━━━━━━━━━━━━━━━━━━━━━

STATUS

LV. 18

FOCUS        72 ↑
EXECUTION    81 ↑
CONSISTENCY  76 ↑
PLANNING     64 ↓
RECOVERY     83 ↑

━━━━━━━━━━━━━━━━━━━━━━

ACTIVE MISSION

Launch Personal Growth OS MVP

Progress
███████░░░ 68%

━━━━━━━━━━━━━━━━━━━━━━

SELECTED PATH

MVP-FIRST

Validation
Before Intelligence

━━━━━━━━━━━━━━━━━━━━━━

THIS WEEK

Deep Work
14h 20m

Mission-Aligned Work
11h 05m

Quest Completion
29 / 34

Habit Consistency
82%

━━━━━━━━━━━━━━━━━━━━━━
```

그리고:

```text
SYSTEM ANALYSIS

Execution remains strong.

However, 38% of development time
was spent outside the current
MVP strategy.

Consider postponing non-essential
features until the core scheduling
loop is complete.
```

이 메시지가 굉장히 중요하다.

단순히:

> 많이 했네.

가 아니라:

> 중요한 것을 했는가?

를 평가하기 때문이다.

---

# 31. 시스템이 생산성을 정의하는 방식

기존 생산성 앱:

```text
More Tasks
=
More Productivity
```

이 시스템에서는 다르게 정의한다.

```text
Productivity

≠ More Tasks

Productivity

= Meaningful Progress
  toward chosen goals
  within sustainable capacity
```

즉:

```text
Doing More
```

가 아니라:

```text
Doing the Right Things
Consistently
```

이다.

---

# 32. 제품의 철학을 네 문장으로 정의

## 1. Direction before Action

행동보다 방향이 먼저다.

```text
Purpose
→ Goal
→ Action
```

---

## 2. Strategy before Effort

노력하기 전에 방법을 확인한다.

```text
Wrong Strategy
+
More Effort

≠

Better Result
```

---

## 3. Systems before Motivation

의지에 의존하지 않는다.

```text
Environment
Habit
Calendar
Protocol
```

을 사용한다.

---

## 4. Evidence before Judgment

느낌이 아니라 행동 데이터를 본다.

```text
"I am lazy."

X
```

대신:

```text
"You completed 74% of planned work,
but tasks scheduled after 8 PM
were completed only 31% of the time."
```

---

# 33. Solo Leveling의 핵심 감각은 유지

이 모든 철학 때문에 RPG 감성을 약하게 만들어서는 안 된다.

오히려 System이 더 지능적으로 느껴져야 한다.

사용자가 느껴야 하는 경험:

```text
The System is watching.

The System is learning.

The System understands my patterns.

The System gives me quests.

The System detects weaknesses.

The System adjusts difficulty.

The System shows my growth.
```

하지만 중요한 차이는:

```text
The System controls me.
```

가 되어서는 안 된다는 것이다.

항상 사용자가 최종 결정권을 가진다.

---

# 34. 가장 중요한 개념: System은 Dungeon Master가 아니라 Advisor

System은 다음을 할 수 있다.

```text
Observe
Analyze
Recommend
Predict
Challenge
Warn
```

하지만:

```text
Command
Punish
Judge
Force
```

하지 않는다.

게임적인 표현으로 명령하는 것처럼 보이더라도 실제 UX에서는 선택권을 제공한다.

예:

```text
SYSTEM

Today's workload exceeds
your sustainable capacity
by approximately 90 minutes.

Recommended:

Move "Refactor Analytics Page"
to tomorrow.

[Accept]

[Keep Current Plan]
```

---

# 35. Level의 의미도 다시 정의

Level은 인간의 가치나 생산성을 의미하지 않는다.

Level은:

> System 안에서 축적된 경험과 행동 기록의 누적치

정도로 정의한다.

따라서:

```text
LV. 30
```

사용자가:

```text
LV. 12
```

보다 더 훌륭한 사람이란 뜻이 아니다.

단순히 더 많은 성장 여정을 기록했다는 의미다.

---

# 36. 최종 System Loop

최종적으로 제품의 Loop는 다음과 같다.

```text
                    PURPOSE
                       │
                       ▼
                   IDENTITY
                       │
                       ▼
                    MISSION
                     Goal
                       │
                       ▼
                     PATH
                   Strategy
                       │
                       ▼
                   PROTOCOL
                    Tactic
                       │
                       ▼
                     HABIT
                       │
                       ▼
                     QUEST
                       │
                       ▼
                     PLAN
                       │
                       ▼
                    ACTION
                       │
                       ▼
                   EVIDENCE
                       │
                       ▼
                    REVIEW
                       │
               ┌───────┴───────┐
               ▼               ▼
             STATS         STRATEGY REVIEW
               │               │
               ▼               │
            LEVEL UP           │
                               │
                     ┌─────────┴─────────┐
                     ▼                   ▼
               Adjust Tactic       Adjust Strategy
                     │                   │
                     └─────────┬─────────┘
                               ▼
                           NEXT QUEST
```

---

# 37. Claude에게 전달할 핵심 수정 지시

기존 Solo Leveling System UI 및 Gamification Experience는 유지한다.

제품을 일반적인 Productivity Dashboard로 변경하지 않는다.

대신 기존 Domain Model과 Business Logic에 다음 계층을 추가한다.

```text
Purpose
Identity
Goal / Mission
Strategy / Path
Tactic / Protocol
Habit
Quest
Execution
Evidence
Reflection
Stat
Level
```

특히 다음 관계를 코드와 DB에서도 명확하게 표현한다.

```text
Purpose
has many Identities

Identity
has many Goals

Goal
has one or more Strategies

Strategy
has many Tactics

Tactic
can generate Habits

Habit
generates Daily Quests

Goal / Strategy / Tactic
can also generate one-time Quests

Quest
produces Execution

Execution
produces Evidence

Evidence
updates Stats

Evidence
also feeds Strategy Review
```

모든 Task를 억지로 Mission에 연결하지 말고 Maintenance Quest를 허용한다.

AI는 단순 Quest 생성기가 아니라 다음 계층을 분석하는 **System Intelligence** 역할을 한다.

```text
Purpose Alignment
Goal Progress
Strategy Effectiveness
Tactic Sustainability
Planning Accuracy
Execution Pattern
Recovery Pattern
```

---

# 38. 최종 제품 정의

이 제품은:

> **A Solo Leveling-inspired personal operating system that turns purpose into strategy, strategy into quests, and real-world actions into measurable growth.**

사용자는 단순히 할 일을 관리하는 것이 아니다.

```text
Why am I doing this?
        ↓
What am I trying to achieve?
        ↓
How will I achieve it?
        ↓
What should I repeatedly do?
        ↓
What should I do today?
        ↓
What actually happened?
        ↓
What should change next?
```

를 하나의 System 안에서 관리한다.

그리고 사용자에게 보이는 언어는 끝까지:

```text
SYSTEM
MISSION
PATH
PROTOCOL
QUEST
STATUS
STAT
EXP
LEVEL UP
```

이어야 한다.

즉,

**철학과 구조는 현실적인 Personal Growth System이고,  
사용자가 경험하는 인터페이스와 세계관은 Solo Leveling System이다.**