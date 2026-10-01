import type { Account } from "./finance.types";

/** Spec §24 grouping: cash & bank, credit cards, other personal accounts, then joint ("Shared") accounts. */
export const ACCOUNT_GROUPS: { label: string; match: (a: Account) => boolean }[] = [
  { label: "현금·은행", match: (a) => a.ownership_type === "PERSONAL" && ["CHECKING", "SAVINGS", "CASH"].includes(a.account_type) },
  { label: "신용카드", match: (a) => a.ownership_type === "PERSONAL" && a.account_type === "CREDIT_CARD" },
  { label: "투자·대출·기타", match: (a) => a.ownership_type === "PERSONAL" && ["INVESTMENT", "LOAN", "OTHER"].includes(a.account_type) },
  { label: "공동", match: (a) => a.ownership_type === "JOINT" },
];
