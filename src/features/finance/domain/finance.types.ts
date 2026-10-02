import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
export type Household = Tables["finance_households"]["Row"];
export type HouseholdMember = Tables["finance_household_members"]["Row"];
export type Account = Tables["finance_accounts"]["Row"];
export type Category = Tables["finance_categories"]["Row"];
export type Transaction = Tables["finance_transactions"]["Row"];
export type Subscription = Tables["finance_subscriptions"]["Row"];

export const MEMBER_ROLES = ["OWNER", "MEMBER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH", "INVESTMENT", "LOAN", "OTHER"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  CHECKING: "입출금",
  SAVINGS: "저축",
  CREDIT_CARD: "신용카드",
  CASH: "현금",
  INVESTMENT: "투자",
  LOAN: "대출",
  OTHER: "기타",
};

export const OWNERSHIP_TYPES = ["PERSONAL", "JOINT"] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];
export const OWNERSHIP_LABEL: Record<OwnershipType, string> = { PERSONAL: "개인", JOINT: "공동" };

export const CATEGORY_TYPES = ["EXPENSE", "INCOME"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];
export const CATEGORY_TYPE_LABEL: Record<CategoryType, string> = { EXPENSE: "지출", INCOME: "수입" };

/** All types the schema stores. The forms record all but ADJUSTMENT, which only reconciling writes (ADR 0032, 0035). */
export const TRANSACTION_TYPES = ["EXPENSE", "INCOME", "TRANSFER", "REFUND", "ADJUSTMENT"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export const ENTRY_TYPES = ["EXPENSE", "INCOME", "TRANSFER", "REFUND"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];
/** The category list a transaction type picks from: a refund (ADR 0035) goes back to an expense category. */
export const categoryTypeOf = (type: "EXPENSE" | "INCOME" | "REFUND"): CategoryType => (type === "INCOME" ? "INCOME" : "EXPENSE");
export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  EXPENSE: "지출",
  INCOME: "수입",
  TRANSFER: "이체",
  REFUND: "환불",
  ADJUSTMENT: "조정",
};

/** Members as the UI needs them: the household keeps its own display names (ADR 0025). */
export type MemberRef = { userId: string; displayName: string; role: MemberRole };

/** Everything finance pages and forms need about the caller's household. */
export type FinanceContext = {
  household: Household;
  me: MemberRef;
  members: MemberRef[];
  today: string;
};

/** Reference data shared by every finance screen (forms, rows, details). */
export type FinanceLookups = {
  accounts: Account[];
  categories: Category[];
  members: MemberRef[];
  meId: string;
  today: string;
  currency: string;
};

export type DayTotals = { date: string; income: number; expense: number; net: number };
export type MonthTotals = { month: number; income: number; expense: number; net: number };
