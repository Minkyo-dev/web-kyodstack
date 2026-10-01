import { describe, expect, it } from "vitest";
import type { CategoryShare } from "@/features/finance/domain/aggregate";
import { budgetMonths, budgetTotals, mergeBudgets, paceOf, statusOf, sumBudgets } from "@/features/finance/domain/budgets";
import type { Category } from "@/features/finance/domain/finance.types";
import { clearMonthBudgetSchema, setDefaultBudgetSchema, setMonthBudgetSchema } from "@/features/finance/schemas/finance.schema";

const share = (categoryId: string, amount: number): CategoryShare => ({
  categoryId,
  name: categoryId,
  icon: null,
  amount,
  percentage: 0,
  previous: 0,
  delta: 0,
});
const categories = [{ id: "rent", name: "주거", icon: "🏠" }] as Category[];

describe("statusOf", () => {
  it("uses the 80 % and 100 % boundaries", () => {
    expect(statusOf(0.79)).toBe("ok");
    expect(statusOf(0.8)).toBe("warning");
    expect(statusOf(1)).toBe("warning");
    expect(statusOf(1.01)).toBe("over");
  });
});

describe("mergeBudgets / budgetTotals", () => {
  const budgets = new Map([
    ["food", 800],
    ["eat", 300],
    ["rent", 2000],
  ]);
  const rows = mergeBudgets([share("food", 742.5), share("eat", 342), share("misc", 210), share("refund-only", -15)], budgets, categories);

  it("adds budgeted categories with nothing spent and orders by ratio, then amount", () => {
    expect(rows.map((r) => r.categoryId)).toEqual(["eat", "food", "rent", "misc", "refund-only"]);
    expect(rows.find((r) => r.categoryId === "rent")).toMatchObject({ name: "주거", icon: "🏠", amount: 0, ratio: 0, status: "ok" });
  });

  it("computes remaining and status per category", () => {
    expect(rows.find((r) => r.categoryId === "eat")).toMatchObject({ remaining: -42, status: "over" });
    expect(rows.find((r) => r.categoryId === "food")).toMatchObject({ remaining: 57.5, status: "warning" });
    expect(rows.find((r) => r.categoryId === "misc")).toMatchObject({ budget: null, status: null });
  });

  it("totals the budget, the budgeted spending and the spending outside any budget", () => {
    expect(budgetTotals(rows)).toEqual({
      total: 3100,
      spentBudgeted: 1084.5,
      spentOutside: 210,
      remaining: 2015.5,
      ratio: 1084.5 / 3100,
    });
  });
});

describe("paceOf", () => {
  it("is null outside the month that contains today", () => {
    expect(paceOf(3000, 100, "2026-10-15", 2026, 9)).toBeNull();
    expect(paceOf(3000, 100, "2026-10-15", 2026, 11)).toBeNull();
  });

  it("spreads the budget evenly and counts today in both halves", () => {
    expect(paceOf(3100, 1200, "2026-10-10", 2026, 10)).toEqual({
      expected: 1000,
      delta: 200,
      perDay: 86.36,
      remainingDays: 22,
      elapsedDays: 10,
    });
  });

  it("handles the first and last day and an exhausted budget", () => {
    expect(paceOf(3100, 0, "2026-10-01", 2026, 10)).toMatchObject({ expected: 100, perDay: 100, remainingDays: 31 });
    expect(paceOf(3100, 3500, "2026-10-31", 2026, 10)).toMatchObject({ expected: 3100, delta: 400, perDay: 0, remainingDays: 1 });
  });
});

describe("budgetMonths / sumBudgets", () => {
  it("counts January to this month this year and all months of a past year", () => {
    expect(budgetMonths(2026, "2026-03-09")).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(budgetMonths(2025, "2026-03-09")).toHaveLength(12);
    expect(budgetMonths(2027, "2026-03-09")).toEqual([]);
  });

  it("adds month budgets per category", () => {
    const line = (categoryId: string, amount: number) => ({ categoryId, amount, isOverride: false, defaultAmount: amount });
    expect(sumBudgets([[line("a", 100.1), line("b", 5)], [line("a", 200.2)]])).toEqual(
      new Map([
        ["a", 300.3],
        ["b", 5],
      ]),
    );
  });
});

describe("budget schemas", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("treats an empty default as no budget", () => {
    expect(setDefaultBudgetSchema.parse({ categoryId: id, amount: "" }).amount).toBeNull();
    expect(setDefaultBudgetSchema.parse({ categoryId: id, amount: "1,200.5" }).amount).toBe(1200.5);
  });
  it("rejects zero, negative and three decimals", () => {
    expect(setDefaultBudgetSchema.safeParse({ categoryId: id, amount: "0" }).success).toBe(false);
    expect(setMonthBudgetSchema.safeParse({ categoryId: id, month: "2026-10", amount: "-5" }).success).toBe(false);
    expect(setMonthBudgetSchema.safeParse({ categoryId: id, month: "2026-10", amount: "1.234" }).success).toBe(false);
  });
  it("checks the month format", () => {
    expect(setMonthBudgetSchema.safeParse({ categoryId: id, month: "2026-13", amount: "5" }).success).toBe(false);
    expect(clearMonthBudgetSchema.safeParse({ categoryId: id, month: "2026-10" }).success).toBe(true);
  });
});
