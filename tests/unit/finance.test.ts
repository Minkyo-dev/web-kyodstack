import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatSigned,
  netOf,
  parseAmount,
  percentChange,
  savingRate,
  sumAmounts,
} from "@/features/finance/domain/money";
import { daysInMonth, monthRange, parseMonthKey, shiftMonth } from "@/features/finance/domain/period";
import { categoryBreakdown, categoryPath, compare, fillDays, fillMonths, summarize } from "@/features/finance/domain/aggregate";
import { buildCategoryTree, categoryOptions, dropInOrder, moveInOrder } from "@/features/finance/domain/category-tree";
import type { Category } from "@/features/finance/domain/finance.types";
import {
  createAccountSchema,
  createTransactionSchema,
  transactionFilterSchema,
  updateAccountSchema,
} from "@/features/finance/schemas/finance.schema";

const cat = (id: string, name: string, extra: Partial<Category> = {}): Category => ({
  id,
  name,
  household_id: "h",
  parent_id: null,
  type: "EXPENSE",
  icon: null,
  sort_order: 0,
  is_active: true,
  deleted_at: null,
  created_at: "",
  updated_at: "",
  ...extra,
});

describe("money", () => {
  it("sums in cents", () => {
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts(["73.12", "6", "3.3"])).toBe(82.42);
    expect(netOf(8400, 5320)).toBe(3080);
  });

  it("savings rate = net / income, null without income (spec §11)", () => {
    expect(savingRate(8400, 5320)).toBeCloseTo(0.3667, 4);
    expect(savingRate(0, 120)).toBeNull();
  });

  it("percent change is null against zero and uses |previous|", () => {
    expect(percentChange(110, 100)).toBeCloseTo(0.1);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(-50, -100)).toBeCloseTo(0.5);
  });

  it("always prints a sign (spec §37)", () => {
    expect(formatSigned(4200)).toBe("+$4,200");
    expect(formatSigned(-138)).toBe("-$138");
    expect(formatSigned(-73.12)).toBe("-$73.12");
    expect(formatSigned(0)).toBe("$0");
    expect(formatMoney(3.3)).toBe("$3.30");
  });

  it("parses typed amounts", () => {
    expect(parseAmount("1,234.5")).toBe(1234.5);
    expect(parseAmount("$12")).toBe(12);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("period", () => {
  it("month ranges and shifts across years", () => {
    expect(monthRange(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("falls back on bad month keys", () => {
    const fb = { year: 2026, month: 10 };
    expect(parseMonthKey("2026-13", fb)).toEqual(fb);
    expect(parseMonthKey("2026-03", fb)).toEqual({ year: 2026, month: 3 });
    expect(parseMonthKey(undefined, fb)).toEqual(fb);
  });
});

describe("aggregate", () => {
  it("fills every day and month with zeros", () => {
    const days = fillDays(2026, 10, [{ day: "2026-10-05", income: "4200", expense: "15" }]);
    expect(days).toHaveLength(31);
    expect(days[4]).toEqual({ date: "2026-10-05", income: 4200, expense: 15, net: 4185 });
    expect(days[0]).toEqual({ date: "2026-10-01", income: 0, expense: 0, net: 0 });
    const months = fillMonths([{ month: 3, income: 10, expense: 4 }]);
    expect(months).toHaveLength(12);
    expect(months[2].net).toBe(6);
  });

  it("summarizes and compares with the previous period", () => {
    const cur = summarize([{ income: 8400, expense: 5320 }]);
    const prev = summarize([{ income: 8000, expense: 6000 }]);
    expect(cur).toEqual({ income: 8400, expense: 5320, net: 3080, savingRate: 3080 / 8400 });
    const c = compare(cur, prev);
    expect(c.incomeChange).toBeCloseTo(0.05);
    expect(c.expenseChange).toBeCloseTo(-0.11333, 4);
    expect(compare(cur, summarize([])).incomeChange).toBeNull();
  });

  it("breaks expense down by category with share and change", () => {
    const cats = [cat("food", "식비"), cat("home", "주거"), cat("fun", "여가")];
    const rows = categoryBreakdown(
      [
        { category_id: "home", expense: 2400 },
        { category_id: "food", expense: "920" },
      ],
      [
        { category_id: "food", expense: 740 },
        { category_id: "fun", expense: 100 },
      ],
      cats,
    );
    expect(rows.map((r) => r.name)).toEqual(["주거", "식비", "여가"]);
    expect(rows[1]).toMatchObject({ amount: 920, previous: 740, delta: 180 });
    expect(rows[0].percentage).toBeCloseTo(2400 / 3320);
    expect(rows[2]).toMatchObject({ amount: 0, percentage: 0, delta: -100 });
  });

  it("names a subcategory with its parent", () => {
    const cats = [cat("food", "식비"), cat("groc", "장보기", { parent_id: "food" })];
    expect(categoryPath(cats, "groc")).toBe("식비 > 장보기");
    expect(categoryPath(cats, "food")).toBe("식비");
    expect(categoryPath(cats, null)).toBeNull();
  });
});

describe("category tree", () => {
  const cats = [
    cat("food", "식비", { sort_order: 1 }),
    cat("home", "주거", { sort_order: 0 }),
    cat("coffee", "커피", { parent_id: "food", sort_order: 1, is_active: false }),
    cat("groc", "장보기", { parent_id: "food", sort_order: 0 }),
    cat("salary", "급여", { type: "INCOME" }),
  ];

  it("builds two levels of one type in sort order", () => {
    const tree = buildCategoryTree(cats, "EXPENSE");
    expect(tree.map((n) => n.id)).toEqual(["home", "food"]);
    expect(tree[1].children.map((c) => c.id)).toEqual(["groc", "coffee"]);
  });

  it("hides archived categories from the picker except the current one (spec §25)", () => {
    expect(categoryOptions(cats, "EXPENSE").map((o) => o.label)).toEqual(["주거", "식비", "식비 > 장보기"]);
    expect(categoryOptions(cats, "EXPENSE", "coffee").map((o) => o.label)).toContain("식비 > 커피");
    expect(categoryOptions(cats, "INCOME").map((o) => o.id)).toEqual(["salary"]);
  });

  it("leaves deleted categories out of the tree and the picker, except the current one (ADR 0027)", () => {
    const withDeleted = [...cats, cat("old", "옛날", { is_active: false, deleted_at: "2026-10-01T00:00:00Z" })];
    expect(buildCategoryTree(withDeleted, "EXPENSE").map((n) => n.id)).not.toContain("old");
    expect(categoryOptions(withDeleted, "EXPENSE").map((o) => o.id)).not.toContain("old");
    expect(categoryOptions(withDeleted, "EXPENSE", "old").map((o) => o.id)).toContain("old");
  });

  it("reorders by step or drop", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "a", -1)).toBeNull();
    expect(dropInOrder(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(dropInOrder(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });
});

describe("transaction schema", () => {
  const base = {
    type: "EXPENSE",
    amount: "73.12",
    accountId: "00000000-0000-4000-8000-000000000001",
    categoryId: "00000000-0000-4000-8000-000000000002",
    date: "2026-10-12",
  };

  it("needs only amount, category, account and date for income/expense (spec §21)", () => {
    const r = createTransactionSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ amount: 73.12, time: null, merchantName: null, note: null, paidByUserId: null });
  });

  it("requires a category for income/expense and a distinct destination for a transfer", () => {
    expect(createTransactionSchema.safeParse({ ...base, categoryId: null }).success).toBe(false);
    const transfer = { ...base, type: "TRANSFER", categoryId: null };
    expect(createTransactionSchema.safeParse(transfer).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...transfer, transferAccountId: base.accountId }).success).toBe(false);
    expect(
      createTransactionSchema.safeParse({ ...transfer, transferAccountId: "00000000-0000-4000-8000-000000000003" }).success,
    ).toBe(true);
  });

  it("takes a refund with an (expense) category (ADR 0035)", () => {
    expect(createTransactionSchema.safeParse({ ...base, type: "REFUND" }).success).toBe(true);
    expect(createTransactionSchema.safeParse({ ...base, type: "REFUND", categoryId: null }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...base, type: "ADJUSTMENT" }).success).toBe(false);
  });

  it("rejects bad amounts, dates and times", () => {
    expect(createTransactionSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...base, time: "25:00" }).success).toBe(false);
  });

  it("drops invalid filters instead of failing the page", () => {
    expect(transactionFilterSchema.parse({ from: "nope", min: "abc", type: "X", q: "Starbucks" })).toEqual({
      from: undefined,
      min: undefined,
      type: undefined,
      q: "Starbucks",
    });
  });
});

describe("account schema: card payment day (ADR 0034)", () => {
  const card = {
    name: "Visa",
    accountType: "CREDIT_CARD",
    institutionName: "",
    ownershipType: "JOINT",
    ownerUserId: null,
  };
  const from = "00000000-0000-4000-8000-000000000009";

  it("is optional and defaults to none", () => {
    expect(createAccountSchema.parse(card)).toMatchObject({ paymentDay: null, paymentAccountId: null });
  });

  it("takes a day 1–31 together with a payment account", () => {
    expect(createAccountSchema.parse({ ...card, paymentDay: 31, paymentAccountId: from })).toMatchObject({
      paymentDay: 31,
      paymentAccountId: from,
    });
    expect(createAccountSchema.safeParse({ ...card, paymentDay: 0, paymentAccountId: from }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...card, paymentDay: 32, paymentAccountId: from }).success).toBe(false);
    const half = createAccountSchema.safeParse({ ...card, paymentDay: 15 });
    expect(half.success).toBe(false);
    expect(half.error?.issues[0].path).toEqual(["paymentAccountId"]);
    expect(createAccountSchema.safeParse({ ...card, paymentAccountId: from }).success).toBe(false);
  });

  it("is dropped for any other account type", () => {
    const parsed = updateAccountSchema.parse({
      ...card,
      accountId: "00000000-0000-4000-8000-000000000001",
      accountType: "CHECKING",
      paymentDay: 15,
      paymentAccountId: from,
    });
    expect(parsed).toMatchObject({ paymentDay: null, paymentAccountId: null });
  });

  it("still checks the owner rule", () => {
    expect(createAccountSchema.safeParse({ ...card, ownershipType: "PERSONAL" }).success).toBe(false);
  });
});

describe("formatCompact", () => {
  it("is deterministic (no Intl compact notation)", async () => {
    const { formatCompact } = await import("@/features/finance/domain/money");
    expect(formatCompact(30)).toBe("$30");
    expect(formatCompact(690.55)).toBe("$691");
    expect(formatCompact(2400)).toBe("$2.4K");
    expect(formatCompact(4000)).toBe("$4K");
    expect(formatCompact(999_999)).toBe("$1M");
    expect(formatCompact(1_250_000)).toBe("$1.3M");
    expect(formatCompact(-1500)).toBe("-$1.5K");
  });
});
