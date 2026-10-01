# Household Finance Service
## Product & Technical Design Specification

## 1. 프로젝트 목적

기존 개인 웹사이트의 Private Utility 영역에 **부부가 함께 사용하는 가계부 서비스**를 추가한다.

이 서비스는 개인별 소비를 따로 관리하는 개인 가계부가 아니다.

핵심 관리 단위는 `User`가 아니라 `Household`이다.

```text
Household
├── Member A
├── Member B
│
├── Accounts
├── Categories
├── Transactions
└── Financial History
```

두 사용자는 각각 자신의 계정으로 로그인하지만 동일한 Household에 속하며, 가계 재정 데이터를 함께 관리한다.

서비스가 가장 먼저 해결해야 할 질문은 다음 세 가지다.

```text
1. 이번 달 / 올해 우리 집 돈의 흐름은 어떤가?
2. 언제 돈이 많이 들어오거나 나갔는가?
3. 특정 날짜에 정확히 어떤 거래가 있었는가?
```

따라서 핵심 UX 구조는 다음과 같이 설계한다.

```text
Dashboard
    ↓
Calendar
    ↓
Day Drawer
    ↓
Transaction Detail
```

---

# 2. 기술 스택

기존 프로젝트 스택을 그대로 유지한다.

```text
Frontend / BFF
Next.js
App Router
TypeScript

Hosting
Vercel

Authentication
Supabase Auth

Database
Supabase PostgreSQL

Authorization
Supabase Row Level Security

UI
React
Tailwind CSS
shadcn/ui 또는 기존 Design System
```

별도의 Backend 서버는 MVP 단계에서는 만들지 않는다.

```text
Browser
   ↓
Next.js
   ↓
Server Actions / Route Handlers
   ↓
Service Layer
   ↓
Supabase
```

UI Component에서 직접 Business Logic을 처리하지 않는다.

---

# 3. 핵심 설계 원칙

## 3.1 Household First

Finance 데이터의 최상위 Tenant Key는 `user_id`가 아니라:

```text
household_id
```

이다.

예를 들어 Category는 다음과 같이 만들어서는 안 된다.

```text
User A
├── Food
├── Housing

User B
├── Food
├── Housing
```

대신:

```text
Household
├── Food
├── Housing
├── Transportation
└── Shopping
```

을 두 사람이 공통으로 사용한다.

---

## 3.2 User와 Household 역할 분리

User는 다음과 같은 개인 행위를 나타낸다.

```text
누가 로그인했는가
누가 거래를 입력했는가
누가 결제했는가
누가 Account를 소유하는가
```

Household는 다음을 소유한다.

```text
Categories
Transactions
Shared financial history
Dashboard
Calendar
```

---

## 3.3 Dashboard와 Calendar의 책임 분리

Dashboard는 다음 질문에 답한다.

> 우리 가계의 전체적인 돈의 흐름은 어떠한가?

Calendar는 다음 질문에 답한다.

> 언제 돈이 들어오고 나갔는가?

Day Drawer는 다음 질문에 답한다.

> 그날 정확히 무엇에 돈을 썼는가?

따라서 동일한 정보를 여러 화면에서 반복하지 않는다.

---

# 4. Information Architecture

MVP Navigation:

```text
Finance

├── Dashboard
├── Calendar
├── Transactions
└── Settings
    ├── Accounts
    └── Categories
```

향후 확장:

```text
Finance
├── Dashboard
├── Calendar
├── Transactions
├── Budget
├── Goals
├── Recurring
├── Analytics
└── Settings
```

Budget, Goal, AI 기능은 현재 MVP 범위에 포함하지 않는다.

---

# 5. Household Model

현재 실제 사용자는 부부 2명이다.

하지만 DB 구조에는 `user_1`, `user_2`와 같은 하드코딩을 하지 않는다.

```text
finance_households

Household A
   │
   ├── Member A
   └── Member B
```

Schema:

```sql
create table finance_households (
    id uuid primary key default gen_random_uuid(),

    name varchar(100) not null,

    base_currency char(3) not null default 'CAD',

    timezone varchar(50) not null default 'America/Toronto',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

Household Member:

```sql
create table finance_household_members (
    id uuid primary key default gen_random_uuid(),

    household_id uuid not null
        references finance_households(id)
        on delete cascade,

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    role varchar(20) not null default 'MEMBER',

    joined_at timestamptz not null default now(),

    unique(household_id, user_id)
);
```

Role:

```text
OWNER
MEMBER
```

MVP에서는 두 Role의 기능 차이가 크지 않아도 된다.

추후 Household Setting 권한 등에 사용할 수 있도록 구조만 지원한다.

---

# 6. Account Model

Account는 Household 내에서 공유해서 조회할 수 있지만 특정 사용자 소유일 수도 있고 공동 소유일 수도 있다.

예:

```text
Household

├── Brandon - TD Checking
├── Brandon - AMEX
├── Partner - CIBC Checking
├── Partner - Visa
└── Joint Savings
```

Account Type:

```text
CHECKING
SAVINGS
CREDIT_CARD
CASH
INVESTMENT
LOAN
OTHER
```

Ownership Type:

```text
PERSONAL
JOINT
```

Schema:

```sql
create table finance_accounts (
    id uuid primary key default gen_random_uuid(),

    household_id uuid not null
        references finance_households(id)
        on delete cascade,

    name varchar(100) not null,

    account_type varchar(30) not null,

    institution_name varchar(100),

    currency_code char(3) not null default 'CAD',

    ownership_type varchar(20) not null default 'PERSONAL',

    owner_user_id uuid
        references auth.users(id),

    initial_balance numeric(14, 2) not null default 0,

    is_active boolean not null default true,

    sort_order integer not null default 0,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

Validation:

```text
ownership_type = PERSONAL
→ owner_user_id required

ownership_type = JOINT
→ owner_user_id null
```

Account는 물리적으로 삭제하기보다는 Archive를 기본 정책으로 사용한다.

기존 Transaction이 Account를 참조할 수 있기 때문이다.

---

# 7. Category Model

Category는 **두 사용자가 완전히 공유한다.**

Category ownership:

```text
Household → Category
```

절대 다음 구조로 만들지 않는다.

```text
User → Category
```

Category는 Income / Expense를 구분한다.

```text
EXPENSE

Food
├── Grocery
├── Restaurant
├── Delivery
└── Coffee

Housing
├── Rent
├── Utilities
└── Internet


INCOME

Salary
Bonus
Freelance
Investment
Other
```

Schema:

```sql
create table finance_categories (
    id uuid primary key default gen_random_uuid(),

    household_id uuid not null
        references finance_households(id)
        on delete cascade,

    parent_id uuid
        references finance_categories(id),

    type varchar(20) not null,

    name varchar(100) not null,

    icon varchar(50),

    sort_order integer not null default 0,

    is_active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

지원 기능:

```text
Create
Rename
Change Icon
Reorder
Create Subcategory
Archive
```

Category depth는 UI에서는 최대 2단계까지만 지원한다.

```text
Food
└── Grocery
```

무한 Nested Category UI는 만들지 않는다.

---

# 8. Transaction Model

Transaction이 이 서비스의 Source of Truth다.

Dashboard, Calendar 및 Analytics에서 보이는 모든 숫자는 Transaction에서 계산할 수 있어야 한다.

지원 Transaction Type:

```text
EXPENSE
INCOME
TRANSFER
REFUND
ADJUSTMENT
```

특히 `TRANSFER`는 Expense로 계산하면 안 된다.

예:

```text
Checking → Credit Card

$1,000
```

이것은:

```text
Expense $1,000
```

이 아니라:

```text
Transfer $1,000
```

이다.

이를 잘못 처리하면 실제 소비가 중복 계산된다.

Schema:

```sql
create table finance_transactions (
    id uuid primary key default gen_random_uuid(),

    household_id uuid not null
        references finance_households(id)
        on delete cascade,

    account_id uuid not null
        references finance_accounts(id),

    category_id uuid
        references finance_categories(id),

    type varchar(20) not null,

    amount numeric(14, 2) not null,

    currency_code char(3) not null default 'CAD',

    merchant_name varchar(150),

    description text,

    transaction_date date not null,

    transaction_time time,

    paid_by_user_id uuid
        references auth.users(id),

    created_by_user_id uuid not null
        references auth.users(id),

    updated_by_user_id uuid
        references auth.users(id),

    transfer_account_id uuid
        references finance_accounts(id),

    transfer_group_id uuid,

    source varchar(20) not null default 'MANUAL',

    note text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

`source`:

```text
MANUAL
CSV
BANK_SYNC
SYSTEM
```

현재 MVP에서는 MANUAL만 사용해도 되지만 향후 확장을 위해 Column은 유지한다.

---

# 9. paid_by와 created_by 구분

두 값을 절대 하나로 합치지 않는다.

예:

```text
남편의 AMEX에서 결제가 발생했다.

아내가 해당 Transaction을 시스템에 입력했다.
```

그렇다면:

```text
paid_by_user_id
= Husband

created_by_user_id
= Wife
```

다.

이 둘은 의미가 다르다.

---

# 10. Dashboard

Dashboard는 서비스의 첫 화면이다.

사용자가 진입 후 약 5초 안에 현재 가계 흐름을 파악할 수 있어야 한다.

Dashboard에는 기간 Switch를 제공한다.

```text
[ Monthly ] [ Yearly ]
```

---

# 11. Monthly Dashboard

Header:

```text
< October 2026 >

[ Monthly ] [ Yearly ]
```

첫 번째 영역은 Financial Summary다.

```text
Income
$8,400

Expense
$5,320

Net
+$3,080

Savings Rate
36.7%
```

계산:

```text
net =
income - expense

saving_rate =
net / income
```

Income이 0이면 Savings Rate 계산 시 divide-by-zero를 처리한다.

---

# 12. Previous Period Comparison

월 Dashboard에서는 전월 비교를 제공한다.

예:

```text
Income
$8,400
↑ 3.2% from September

Expense
$5,320
↓ 6.8% from September
```

각 KPI에서 지나치게 많은 정보를 보여주지 않는다.

다음 정도면 충분하다.

```text
Current value
Previous-period percentage difference
```

---

# 13. Monthly Cash Flow

Dashboard의 핵심 Visualization이다.

Monthly Mode에서는 현재 월의 일별 Income / Expense / Net 흐름을 보여준다.

Concept:

```text
Date       Income       Expense       Net

Oct 01        0             42        -42
Oct 02        0             73        -73
Oct 05     4200             15       4185
```

차트에서는 Income과 Expense를 쉽게 비교할 수 있어야 한다.

과도한 Animation이나 Decoration은 사용하지 않는다.

---

# 14. Expense Category Breakdown

현재 월의 Expense를 Category 기준으로 보여준다.

예:

```text
Housing              $2,400     45%
Food                    920     17%
Transportation          430      8%
Shopping                620     12%
Entertainment           310      6%
Other                   640     12%
```

Category마다 가능하다면 전월 대비 값도 보여준다.

```text
Food
$920
+$180 from September
```

Pie Chart만 보여주지 않는다.

금액과 비율을 텍스트로 반드시 함께 제공한다.

---

# 15. Yearly Dashboard

Yearly Mode에서는 특정 연도를 보여준다.

```text
< 2026 >

Annual Income
$102,400

Annual Expense
$66,300

Net
+$36,100

Savings Rate
35.3%
```

핵심 Visualization은 Monthly Cash Flow다.

```text
Month       Income       Expense       Net

Jan          8,100         5,200       2,900
Feb          8,000         4,900       3,100
Mar          8,200         6,300       1,900
...
```

이 화면의 가장 중요한 목적은:

```text
어느 달에 지출이 크게 증가했는가?
어느 달에 소득이 변했는가?
연간 저축 흐름은 어떠한가?
```

를 빠르게 확인하는 것이다.

---

# 16. Calendar

Calendar는 일별 Cash Flow 탐색 화면이다.

기본 Month View:

```text
October 2026

SUN   MON   TUE   WED   THU   FRI   SAT

                    1     2     3
                   +0    +0    +0
                   -42   -73  -120

 4     5     6     7     8     9    10
+0   +4200  +0    +0    +0    +0    +0
-83   -15   -60   -31  -120  -180   -42
```

각 날짜에서 보여줄 것은 최대한 제한한다.

```text
Date
Income
Expense
```

예:

```text
12

+$4,200
-$138
```

Calendar에서는 Account Balance를 표시하지 않는다.

이 화면은 자산 상태가 아니라 **그날의 흐름**을 보여주는 화면이다.

---

# 17. Calendar Interaction

사용자가 날짜를 선택하면 다른 Page로 이동하지 않는다.

Desktop:

```text
Right Drawer
```

Mobile:

```text
Bottom Sheet
```

를 사용한다.

Flow:

```text
Calendar
    ↓
Select Date
    ↓
Day Drawer
```

URL state와 연결하는 것도 고려한다.

예:

```text
/finance/calendar?month=2026-10&date=2026-10-12
```

이렇게 만들면 Refresh 또는 URL 공유 시 선택된 날짜 상태를 복원할 수 있다.

---

# 18. Day Drawer

날짜를 클릭하면 해당 날짜의 모든 거래를 보여준다.

Example:

```text
October 12, 2026

Income
+$4,200

Expense
-$138

Net
+$4,062

------------------------

INCOME

Salary
+$4,200
TD Checking


EXPENSE

Loblaws
-$73
Food > Grocery
AMEX

TTC
-$3.30
Transportation
Visa

Starbucks
-$6
Food > Coffee
AMEX

Uber Eats
-$56
Food > Delivery
Visa

------------------------

+ Add Transaction
```

---

# 19. Day Drawer Interaction

Drawer 안에서 Transaction을 클릭하면 해당 거래의 상세 정보를 보여준다.

페이지 이동이나 새로운 Modal 중첩은 피한다.

추천 UX:

```text
Day Drawer

Transaction List
      ↓
Click Transaction
      ↓
Transaction Detail

← October 12
```

Back 버튼을 누르면 다시 해당 날짜의 Transaction List로 돌아간다.

---

# 20. Transaction Detail

Example:

```text
Loblaws

-$73.12

Food > Grocery

Account
AMEX

Paid by
Brandon

Date
October 12, 2026

Time
8:32 PM

Memo
Weekly groceries

[Edit]
[Delete]
```

---

# 21. Add Transaction

Dashboard, Calendar, Day Drawer 어디에서도 `+ Transaction`을 실행할 수 있어야 한다.

입력 UX는 매우 빠르게 만들어야 한다.

```text
Add Transaction

[ Expense ] [ Income ] [ Transfer ]

Amount
$ _______

Category
Food > Grocery

Account
AMEX

Date
Today

Merchant
Loblaws

Paid By
Member A

Memo
Optional

[ Save ]
```

필수 입력값을 최소화한다.

EXPENSE / INCOME:

```text
amount
category
account
date
```

정도면 저장할 수 있어야 한다.

Merchant, Time, Memo 등은 optional이다.

---

# 22. Transfer UX

Transfer에서는 Category를 요구하지 않는다.

```text
Transfer

Amount
$1,000

From
TD Checking

To
AMEX

Date
October 15
```

DB에서는 같은 Transfer를 식별할 수 있도록 `transfer_group_id`를 사용한다.

Dashboard Expense 계산에서는 제외한다.

---

# 23. Transactions Page

Calendar는 날짜 기반 탐색에 최적화한다.

Transactions Page는 검색과 필터링에 최적화한다.

지원 Filter:

```text
Date Range
Transaction Type
Category
Account
Paid By
Amount Range
Search
```

예:

```text
October 1 - October 31

All Accounts
Food
Paid by Anyone

Search: Starbucks
```

---

# 24. Account Settings

```text
Settings
└── Accounts
```

Example:

```text
Accounts

Cash & Bank

TD Checking
Personal · Brandon · CAD

TD Savings
Personal · Brandon · CAD

CIBC Checking
Personal · Partner · CAD


Credit Cards

AMEX
Personal · Brandon · CAD

Visa
Personal · Partner · CAD


Shared

Joint Savings
Joint · CAD


+ Add Account
```

지원:

```text
Create
Rename
Change Type
Change Owner
Change Institution
Reorder
Archive
```

---

# 25. Category Settings

```text
Settings
└── Categories
```

Example:

```text
Expense

Food
├── Grocery
├── Restaurant
├── Delivery
└── Coffee

Housing
├── Rent
├── Utilities
└── Internet

Transportation
├── Public Transit
├── Uber
└── Parking
```

사용자가 Drag & Drop으로 순서를 바꿀 수 있다.

지원:

```text
Create
Rename
Change Icon
Move
Reorder
Archive
```

Category 삭제보다는 Archive를 기본으로 한다.

예를 들어 `Coffee` Category가 200개 거래에서 사용 중이어도 기존 데이터를 손상시키지 않는다.

```text
Coffee
is_active = false
```

기존 거래에서는 계속 표시되고 새로운 거래 입력 Category Picker에서는 숨긴다.

---

# 26. Query Strategy

Frontend에서 모든 Transaction을 가져온 후 JS로 Dashboard 통계를 계산하지 않는다.

Aggregation은 DB / Service Layer에서 처리한다.

---

# 27. Dashboard Query Contract

Logical endpoint:

```text
GET /finance/dashboard
```

Parameters:

```text
mode=monthly
year=2026
month=10
```

또는:

```text
mode=yearly
year=2026
```

Example response:

```json
{
  "period": {
    "mode": "monthly",
    "year": 2026,
    "month": 10
  },

  "summary": {
    "income": 8400,
    "expense": 5320,
    "net": 3080,
    "savingRate": 0.3667
  },

  "comparison": {
    "incomeChange": 0.032,
    "expenseChange": -0.068,
    "netChange": 0.12
  },

  "categories": [
    {
      "categoryId": "...",
      "name": "Housing",
      "amount": 2400,
      "percentage": 0.451
    },
    {
      "categoryId": "...",
      "name": "Food",
      "amount": 920,
      "percentage": 0.173
    }
  ]
}
```

---

# 28. Calendar Query Strategy

Calendar를 조회할 때 해당 월의 모든 Transaction Detail을 내려보내지 않는다.

먼저 일별 Aggregate만 조회한다.

Logical endpoint:

```text
GET /finance/calendar?year=2026&month=10
```

Example:

```json
[
  {
    "date": "2026-10-01",
    "income": 0,
    "expense": 42,
    "net": -42
  },
  {
    "date": "2026-10-05",
    "income": 4200,
    "expense": 15,
    "net": 4185
  }
]
```

사용자가 특정 날짜를 선택하면 그때 Transaction을 가져온다.

```text
GET /finance/transactions?date=2026-10-05
```

즉:

```text
Calendar Load
       ↓
Daily Aggregation

Date Click
       ↓
Transaction Details
```

로 분리한다.

---

# 29. Aggregation Rules

Dashboard와 Calendar에서는 다음 Transaction Type만 Income / Expense 계산에 사용한다.

```text
INCOME
EXPENSE
```

`TRANSFER`는 Cash Flow Expense/Income에 포함하지 않는다.

`REFUND` 처리 규칙은 MVP 단계에서 명확하게 정의한다.

추천 방식:

```text
REFUND
→ Expense offset
```

예:

```text
Purchase
-$100

Refund
+$30

Net Expense
$70
```

Implementation 시 Dashboard aggregation과 Calendar aggregation에서 동일한 계산 규칙을 사용해야 한다.

계산 Rule을 화면별로 중복 구현하지 않는다.

---

# 30. Service Layer

추천 구조:

```text
UI
 ↓
Server Action / Route Handler
 ↓
Finance Service
 ↓
Repository / Query
 ↓
Supabase
```

Example:

```text
getMonthlyDashboard()

getYearlyDashboard()

getCalendarSummary()

getTransactionsByDate()

createTransaction()

updateTransaction()

deleteTransaction()

createAccount()

archiveAccount()

createCategory()

archiveCategory()
```

Business Logic은 React Component에 넣지 않는다.

---

# 31. Repository Structure

```text
src/

├── app/
│   └── (private)/
│       └── finance/
│           ├── page.tsx
│           │
│           ├── calendar/
│           │   └── page.tsx
│           │
│           ├── transactions/
│           │   └── page.tsx
│           │
│           └── settings/
│               ├── accounts/
│               │   └── page.tsx
│               └── categories/
│                   └── page.tsx
│
├── features/
│   └── finance/
│
│       ├── dashboard/
│       │   ├── components/
│       │   ├── services/
│       │   ├── queries/
│       │   └── types/
│
│       ├── calendar/
│       │   ├── components/
│       │   ├── services/
│       │   └── types/
│
│       ├── transactions/
│       │   ├── components/
│       │   ├── actions/
│       │   ├── services/
│       │   ├── queries/
│       │   └── types/
│
│       ├── accounts/
│       ├── categories/
│       └── household/
│
├── components/
│   └── ui/
│
├── lib/
│   ├── supabase/
│   └── auth/
│
└── types/
```

Feature 간 DB Query를 무분별하게 공유하지 않는다.

공통 Finance Query가 필요하다면 `features/finance/shared` 정도를 사용할 수 있다.

---

# 32. Recommended Components

Dashboard:

```text
FinanceHeader
PeriodSwitcher
FinanceSummary
SummaryMetric
CashFlowChart
CategoryBreakdown
CategoryRow
RecentTransactions
```

Calendar:

```text
FinanceCalendar
CalendarHeader
CalendarDay
CalendarDaySummary
DayTransactionDrawer
```

Transaction:

```text
TransactionForm
TransactionTypeSelector
AccountSelector
CategorySelector
MemberSelector
TransactionList
TransactionRow
TransactionDetail
```

Settings:

```text
AccountList
AccountForm
CategoryTree
CategoryItem
CategoryForm
```

---

# 33. Security / RLS

두 사용자 모두 같은 Household에 속해 있기 때문에 단순히:

```sql
auth.uid() = user_id
```

로 Finance 데이터를 보호하면 안 된다.

대신:

> 현재 로그인 사용자가 해당 Household의 Member인가?

를 기준으로 RLS를 작성한다.

Logical condition:

```sql
exists (
    select 1
    from finance_household_members hm
    where hm.household_id = target.household_id
      and hm.user_id = auth.uid()
)
```

이 Policy를 다음 Table에 적용한다.

```text
finance_accounts
finance_categories
finance_transactions
```

따라서 Member A와 Member B는 Household 데이터를 모두 볼 수 있지만 다른 Household 데이터는 접근할 수 없다.

---

# 34. Data Integrity

Application Layer에서 다음 Validation을 수행한다.

Transaction을 저장할 때:

```text
Transaction.household_id

Account.household_id

Category.household_id
```

가 모두 동일해야 한다.

예:

```text
Transaction Household A

Account Household B
```

와 같은 조합은 절대 저장하지 않는다.

`paid_by_user_id` 역시 해당 Household Member인지 검사한다.

---

# 35. Responsive Design

Desktop:

```text
Sidebar + Main Content
```

Calendar Date Select:

```text
Right Drawer
```

Mobile:

Navigation은 Bottom Navigation 또는 Compact Navigation을 사용할 수 있다.

Calendar Date Select:

```text
Bottom Sheet
```

를 사용한다.

Mobile에서 Desktop Drawer를 억지로 축소하지 않는다.

---

# 36. Design Principles

전체 Personal Site와 스타일을 통일하되 Finance는 생산성 도구처럼 보여야 한다.

피해야 할 것:

```text
과도하게 둥근 Card
불필요한 Gradient
과도한 Shadow
Dashboard 전체를 Card Grid로 만드는 것
지나친 Animation
너무 많은 색
```

추천:

```text
명확한 Typography hierarchy
Whitespace
Thin border
Subtle separators
Tabular number alignment
빠른 정보 탐색
```

금액 표시에서는 가능하다면 `tabular-nums`를 사용한다.

---

# 37. Income / Expense Color

색상만으로 Income과 Expense를 구분하면 안 된다.

항상:

```text
+ $4,200
- $138
```

처럼 sign을 같이 보여준다.

색상은 보조 정보로만 사용한다.

Accessibility를 고려한다.

---

# 38. Empty State

새 Household에서는 Dashboard가 빈 Chart만 보여서는 안 된다.

Example:

```text
No transactions yet.

Add your first income or expense to start
tracking your household cash flow.

[ Add Transaction ]
```

Calendar도 동일하게 자연스러운 Empty State를 만든다.

---

# 39. Loading State

Dashboard 전체에 하나의 giant spinner를 사용하지 않는다.

각 Section별 Skeleton을 사용한다.

예:

```text
Summary Skeleton
Chart Skeleton
Category Skeleton
```

Calendar Month navigation에서도 기존 Calendar UI는 유지하고 데이터 영역만 loading 처리한다.

---

# 40. MVP Scope

V1에서는 다음 기능을 반드시 구현한다.

```text
Household membership

Shared Categories

Personal / Joint Accounts

Income Transaction

Expense Transaction

Transfer Transaction

Dashboard
- Monthly
- Yearly
- Income
- Expense
- Net
- Saving Rate
- Cash Flow Trend
- Category Breakdown
- Previous period comparison

Calendar
- Month view
- Daily Income
- Daily Expense
- Month navigation

Day Drawer
- Daily summary
- Transaction list
- Transaction detail
- Add transaction
- Edit transaction

Transactions
- List
- Search
- Filter

Settings
- Account management
- Category management
```

---

# 41. MVP에서 제외

다음은 지금 구현하지 않는다.

```text
Bank API synchronization

Receipt OCR

Investment performance tracking

Net Worth

Budget

Financial Goal

AI recommendation

Subscription detection

Automatic categorization

CSV Import

Multi-currency conversion

Debt planning
```

다만 Schema를 불필요하게 막지 않도록 향후 확장 가능성 정도만 고려한다.

---

# 42. Implementation Priority

구현 순서는 다음 순서를 권장한다.

```text
1. Household / Member
        ↓
2. Account
        ↓
3. Category
        ↓
4. Transaction
        ↓
5. Transaction CRUD
        ↓
6. Calendar Aggregation
        ↓
7. Day Drawer
        ↓
8. Monthly Dashboard
        ↓
9. Yearly Dashboard
        ↓
10. Transactions Search / Filter
        ↓
11. Settings UX refinement
```

Dashboard부터 만들지 않는다.

Source of Truth인 Transaction 구조부터 완성한다.

---

# 43. Core User Flow

가장 중요한 User Flow:

```text
User Login

    ↓

Finance Dashboard

    ↓

"October expense is unusually high."

    ↓

Calendar

    ↓

October 12
-$638

    ↓

Day Drawer

    ↓

Costco        -$280
Restaurant    -$150
Amazon        -$170
TTC            -$38

    ↓

Transaction Detail

    ↓

Edit Category / Memo if needed
```

이 Flow가 자연스러우면 서비스의 핵심 목적은 달성된 것이다.

---

# 44. Acceptance Criteria

MVP 완료 조건은 다음과 같다.

### Household

두 개의 사용자 계정이 동일한 Household에 접속할 수 있다.

한 사용자가 등록한 Transaction을 다른 사용자가 로그인해서 볼 수 있다.

다른 Household의 데이터에는 접근할 수 없다.

### Category

두 사용자가 동일한 Category를 사용한다.

한 사용자가 Category를 추가하면 다른 사용자에게도 동일하게 나타난다.

Category Archive 시 과거 Transaction은 유지된다.

### Account

각 사용자는 자신의 Account를 만들 수 있다.

Joint Account도 만들 수 있다.

모든 Household Member가 Account와 Transaction을 조회할 수 있다.

### Transaction

Income, Expense, Transfer를 등록할 수 있다.

Transaction 수정과 삭제가 가능하다.

Transfer가 Expense 통계에 포함되지 않는다.

### Dashboard

월 단위 Income / Expense / Net / Saving Rate를 정확하게 보여준다.

전월 비교가 가능하다.

연 단위 Income / Expense / Net / Saving Rate를 보여준다.

Category별 Expense를 보여준다.

### Calendar

각 날짜마다 Income과 Expense 합계를 보여준다.

날짜 선택 시 페이지 이동 없이 Detail UI가 열린다.

### Day Drawer

해당 날짜의 Income / Expense / Net을 보여준다.

해당 날짜의 모든 Transaction을 보여준다.

Transaction Detail로 이동할 수 있다.

Transaction 추가와 수정이 가능하다.

Desktop에서는 Right Drawer를 사용한다.

Mobile에서는 Bottom Sheet를 사용한다.

---

# 45. 최종 제품 철학

이 가계부는 단순히 다음을 기록하는 서비스가 아니다.

```text
Starbucks
-$6
```

사용자가 가계의 흐름을 점진적으로 탐색할 수 있도록 만든다.

```text
Household Financial Overview

          ↓

Monthly / Yearly Flow

          ↓

Daily Flow

          ↓

Individual Transaction
```

각 화면은 서로 다른 수준의 질문에 답해야 한다.

```text
Dashboard
"우리 집 돈의 흐름은 어떤가?"

Calendar
"언제 돈이 움직였는가?"

Day Drawer
"그날 무슨 일이 있었는가?"

Transaction
"이 돈은 정확히 무엇인가?"
```

이 구조를 제품 전체의 핵심 Information Architecture로 유지한다.

기능을 추가할 때도 이 계층을 깨뜨리지 않는다.

현재 단계에서는 AI나 복잡한 개인재무 기능보다:

```text
Household
→ Account
→ Category
→ Transaction
→ Calendar
→ Dashboard
```

의 정확성과 UX 완성도를 가장 높은 우선순위로 둔다.

## Claude에게 주는 구현 원칙

기존 프로젝트 구조와 Design System이 있다면 그것을 우선 재사용한다.

현재 기능을 구현하기 위해 기존 프로젝트 전체 Architecture를 불필요하게 재작성하지 않는다.

먼저 기존 repository를 분석하고 현재 Authentication, Supabase client, Layout, UI Component, Naming Convention을 파악한 뒤 Finance Domain을 추가한다.

Business Logic과 aggregation 로직을 React Component에 넣지 않는다.

Database query, calculation, validation은 Service / Query Layer로 분리한다.

UI를 과도하게 추상화하지 않는다.

MVP 요구사항에 없는 기능을 임의로 추가하지 않는다.

특히 Budget, AI, Bank Sync, OCR 등을 현재 구현에 포함시키지 않는다.

각 단계가 완료될 때마다 다음을 확인한다.

```text
Data integrity
RLS
Responsive UX
Loading state
Empty state
Error handling
```

그리고 모든 Finance 기능의 Source of Truth는 항상 `finance_transactions`가 되어야 한다.