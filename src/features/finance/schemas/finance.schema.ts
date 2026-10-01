import { z } from "zod";
import { isLocalDateString } from "@/features/scheduler/utils/timezone";
import { ACCOUNT_TYPES, CATEGORY_TYPES, ENTRY_TYPES, OWNERSHIP_TYPES } from "../domain/finance.types";
import { parseAmount } from "../domain/money";
import { BILLING_CYCLES } from "../domain/subscription";

const localDate = z.string().refine(isLocalDateString, "날짜 형식이 올바르지 않습니다.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const displayName = z.string().trim().min(1, "표시 이름을 입력해 주세요.").max(50);

// ------------------------------------------------------------------ household

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(1, "가계 이름을 입력해 주세요.").max(100),
  displayName,
});
export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

export const joinHouseholdSchema = z.object({
  code: z.string().trim().min(4, "초대 코드를 입력해 주세요.").max(40),
  displayName,
});
export type JoinHouseholdInput = z.infer<typeof joinHouseholdSchema>;

export const renameHouseholdSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const updateDisplayNameSchema = z.object({ displayName });
export const emptySchema = z.object({});

// ------------------------------------------------------------------ accounts

const accountFields = {
  name: z.string().trim().min(1, "계좌 이름을 입력해 주세요.").max(100),
  accountType: z.enum(ACCOUNT_TYPES),
  institutionName: optionalText(100),
  ownershipType: z.enum(OWNERSHIP_TYPES),
  ownerUserId: z.uuid().nullable(),
};
const ownerRule = <T extends { ownershipType: string; ownerUserId: string | null }>(v: T) =>
  v.ownershipType === "JOINT" ? v.ownerUserId === null : v.ownerUserId !== null;
const ownerMessage = { message: "개인 계좌는 소유자를 선택하고, 공동 계좌는 소유자를 비워 두세요.", path: ["ownerUserId"] };

export const createAccountSchema = z.object(accountFields).refine(ownerRule, ownerMessage);
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({ accountId: z.uuid(), ...accountFields }).refine(ownerRule, ownerMessage);
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const setActiveSchema = z.object({ id: z.uuid(), active: z.boolean() });
export type SetActiveInput = z.infer<typeof setActiveSchema>;

export const reorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
export type ReorderInput = z.infer<typeof reorderSchema>;

// ------------------------------------------------------------------ categories

const icon = optionalText(50);
export const createCategorySchema = z.object({
  type: z.enum(CATEGORY_TYPES),
  name: z.string().trim().min(1, "카테고리 이름을 입력해 주세요.").max(100),
  icon,
  parentId: z.uuid().nullable(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(1, "카테고리 이름을 입력해 주세요.").max(100),
  icon,
  parentId: z.uuid().nullable(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const deleteCategorySchema = z.object({ id: z.uuid() });

// ------------------------------------------------------------------ transactions

const amount = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const parsed = typeof v === "number" ? parseAmount(v.toFixed(2)) : parseAmount(v);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "금액은 0보다 큰 숫자(소수점 둘째 자리까지)여야 합니다." });
      return z.NEVER;
    }
    return parsed;
  });

const transactionFields = z.object({
  type: z.enum(ENTRY_TYPES),
  amount,
  accountId: z.uuid({ message: "계좌를 선택해 주세요." }),
  transferAccountId: z.uuid().nullable().default(null),
  categoryId: z.uuid().nullable().default(null),
  date: localDate,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간 형식이 올바르지 않습니다.")
    .nullish()
    .transform((v) => v || null),
  merchantName: optionalText(150),
  paidByUserId: z.uuid().nullable().default(null),
  note: optionalText(2000),
});

const transactionRules = (v: z.infer<typeof transactionFields>, ctx: z.RefinementCtx) => {
  if (v.type === "TRANSFER") {
    if (!v.transferAccountId) ctx.addIssue({ code: "custom", message: "받는 계좌를 선택해 주세요.", path: ["transferAccountId"] });
    else if (v.transferAccountId === v.accountId)
      ctx.addIssue({ code: "custom", message: "보내는 계좌와 받는 계좌가 같습니다.", path: ["transferAccountId"] });
  } else if (!v.categoryId) {
    ctx.addIssue({ code: "custom", message: "카테고리를 선택해 주세요.", path: ["categoryId"] });
  }
};

export const createTransactionSchema = transactionFields.superRefine(transactionRules);
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

/** Bulk entry (ADR 0027): expense, income and transfer rows, the same rules as the single form. */
export const BULK_MAX_ROWS = 200;
export const createTransactionsSchema = z.object({
  rows: z
    .array(createTransactionSchema)
    .min(1, "입력한 거래가 없습니다.")
    .max(BULK_MAX_ROWS, `한 번에 ${BULK_MAX_ROWS}건까지 저장할 수 있습니다.`),
});
export type CreateTransactionsInput = z.infer<typeof createTransactionsSchema>;

export const updateTransactionSchema = transactionFields
  .extend({ transactionId: z.uuid() })
  .superRefine(transactionRules);
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const deleteTransactionSchema = z.object({ transactionId: z.uuid() });
export const dayTransactionsSchema = z.object({ date: localDate });

// ------------------------------------------------------------------ subscriptions (ADR 0029)

const subscriptionFields = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(100),
  amount,
  billingCycle: z.enum(BILLING_CYCLES),
  billingDay: z.coerce.number().int().min(1, "결제일은 1–31일입니다.").max(31, "결제일은 1–31일입니다."),
  billingMonth: z.coerce.number().int().min(1).max(12).nullish().transform((v) => v ?? null),
  startDate: localDate,
  endDate: localDate.nullish().or(z.literal("")).transform((v) => v || null),
  accountId: z.uuid({ message: "계좌를 선택해 주세요." }),
  categoryId: z.uuid({ message: "카테고리를 선택해 주세요." }),
  paidByUserId: z.uuid().nullable().default(null),
  note: optionalText(2000),
});

const subscriptionRules = (v: z.infer<typeof subscriptionFields>, ctx: z.RefinementCtx) => {
  if (v.billingCycle === "YEARLY" && v.billingMonth === null)
    ctx.addIssue({ code: "custom", message: "결제 월을 선택해 주세요.", path: ["billingMonth"] });
  if (v.endDate && v.endDate < v.startDate)
    ctx.addIssue({ code: "custom", message: "종료일은 시작일 이후여야 합니다.", path: ["endDate"] });
};
const yearlyOnlyMonth = <T extends { billingCycle: string; billingMonth: number | null }>(v: T): T => ({
  ...v,
  billingMonth: v.billingCycle === "YEARLY" ? v.billingMonth : null,
});

export const createSubscriptionSchema = subscriptionFields.superRefine(subscriptionRules).transform(yearlyOnlyMonth);
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const updateSubscriptionSchema = subscriptionFields
  .extend({ subscriptionId: z.uuid() })
  .superRefine(subscriptionRules)
  .transform(yearlyOnlyMonth);
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const subscriptionIdSchema = z.object({ id: z.uuid() });

// ------------------------------------------------------------------ balances (ADR 0032)

/** The real balance on a date; signed (cards and loans are negative), 0 allowed, at most two decimals. */
export const reconcileSchema = z.object({
  accountId: z.uuid(),
  date: localDate,
  actual: z.union([z.string(), z.number()]).transform((v, ctx) => {
    const text = String(v).trim().replace(/[,$\s]/g, "");
    if (!/^-?\d+(\.\d{1,2})?$/.test(text)) {
      ctx.addIssue({ code: "custom", message: "잔액은 소수점 둘째 자리까지의 숫자여야 합니다." });
      return z.NEVER;
    }
    const n = Number(text);
    if (Math.abs(n) >= 1e12) {
      ctx.addIssue({ code: "custom", message: "금액이 너무 큽니다." });
      return z.NEVER;
    }
    return n;
  }),
});
export type ReconcileInput = z.infer<typeof reconcileSchema>;
export const balanceOnSchema = z.object({ accountId: z.uuid(), date: localDate });

/** Transactions page filters (spec §23). Every field is optional; bad values are dropped, never errors. */
export const transactionFilterSchema = z.object({
  from: localDate.optional().catch(undefined),
  to: localDate.optional().catch(undefined),
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER", "REFUND", "ADJUSTMENT"]).optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  account: z.uuid().optional().catch(undefined),
  paidBy: z.uuid().optional().catch(undefined),
  min: z.coerce.number().nonnegative().optional().catch(undefined),
  max: z.coerce.number().nonnegative().optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;
