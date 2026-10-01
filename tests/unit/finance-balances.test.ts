import { describe, expect, it } from "vitest";
import {
  balanceFromInput,
  forecastSeries,
  inputFromBalance,
  monthTable,
  netWorthSeries,
  position,
  upcomingCharges,
  type DailyBalanceRow,
} from "@/features/finance/domain/balances";
import { dueDatesBetween, type SubscriptionPlan } from "@/features/finance/domain/subscription";
import { reconcileSchema } from "@/features/finance/schemas/finance.schema";

const accounts = [
  { id: "chk", account_type: "CHECKING" },
  { id: "sav", account_type: "SAVINGS" },
  { id: "card", account_type: "CREDIT_CARD" },
  { id: "loan", account_type: "LOAN" },
  { id: "inv", account_type: "INVESTMENT" },
];

describe("position", () => {
  it("sums net worth, liquid assets and card debt", () => {
    const p = position(accounts, [
      { accountId: "chk", balance: 1200.1, reconciledOn: null },
      { accountId: "sav", balance: 5000.2, reconciledOn: null },
      { accountId: "card", balance: -820.55, reconciledOn: null },
      { accountId: "loan", balance: -3000, reconciledOn: null },
      { accountId: "inv", balance: 2000, reconciledOn: null },
    ]);
    expect(p).toEqual({ netWorth: 4379.75, liquid: 6200.3, cardDebt: 820.55 });
  });

  it("does not count a card in credit as debt", () => {
    expect(position(accounts, [{ accountId: "card", balance: 15, reconciledOn: null }]).cardDebt).toBe(0);
  });
});

describe("owed input", () => {
  it("negates what is owed on cards and loans only", () => {
    expect(balanceFromInput("CREDIT_CARD", 820.5)).toBe(-820.5);
    expect(balanceFromInput("LOAN", 0)).toBe(0);
    expect(balanceFromInput("CHECKING", -20)).toBe(-20);
    expect(inputFromBalance("CREDIT_CARD", -820.5)).toBe(820.5);
    expect(inputFromBalance("SAVINGS", 300)).toBe(300);
  });
});

const row = (day: string, account_id: string, balance: number, inflow = 0, outflow = 0, adjustment = 0): DailyBalanceRow => ({
  day,
  account_id,
  balance,
  inflow,
  outflow,
  adjustment,
});

describe("netWorthSeries / monthTable", () => {
  const rows = [
    row("2026-09-30", "chk", 1000),
    row("2026-09-30", "card", -200),
    row("2026-10-01", "chk", 900, 0, 100),
    row("2026-10-01", "card", -200),
    row("2026-10-02", "chk", 1400.1, 500.1, 0),
    row("2026-10-02", "card", -150, 50, 0, 0),
    row("2026-10-03", "chk", 1420.1, 0, 0, 20),
    row("2026-10-03", "card", -150),
  ];

  it("adds the accounts per day and reports the daily change", () => {
    expect(netWorthSeries(rows)).toEqual([
      { day: "2026-09-30", value: 800, change: 0 },
      { day: "2026-10-01", value: 700, change: -100 },
      { day: "2026-10-02", value: 1250.1, change: 550.1 },
      { day: "2026-10-03", value: 1270.1, change: 20 },
    ]);
  });

  it("uses the opening day as start and sums the rest", () => {
    const table = monthTable(rows, "2026-09-30");
    expect(table.find((r) => r.accountId === "chk")).toEqual({
      accountId: "chk",
      start: 1000,
      inflow: 500.1,
      outflow: 100,
      adjustment: 20,
      end: 1420.1,
    });
    expect(table.find((r) => r.accountId === "card")).toMatchObject({ start: -200, inflow: 50, end: -150 });
  });
});

const plan = (over: Partial<SubscriptionPlan & { amount: number }> = {}): SubscriptionPlan & { amount: number } => ({
  billing_cycle: "MONTHLY",
  billing_day: 15,
  billing_month: null,
  start_date: "2026-01-01",
  end_date: null,
  is_active: true,
  charged_through: null,
  amount: 10,
  ...over,
});

describe("dueDatesBetween / upcomingCharges / forecastSeries", () => {
  it("lists every due date in a range", () => {
    expect(dueDatesBetween(plan(), "2026-10-01", "2026-12-31")).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
    expect(dueDatesBetween(plan({ end_date: "2026-11-20" }), "2026-10-01", "2026-12-31")).toEqual(["2026-10-15", "2026-11-15"]);
    expect(dueDatesBetween(plan({ is_active: false }), "2026-10-01", "2026-12-31")).toEqual([]);
  });

  it("counts only charges after today up to the month end", () => {
    const charges = upcomingCharges([plan(), plan({ billing_day: 31, amount: 5 }), plan({ billing_day: 1 })], "2026-10-15", "2026-10-31");
    expect(charges).toEqual([{ date: "2026-10-31", amount: 5 }]);
  });

  it("steps the forecast down on each charge date", () => {
    const series = forecastSeries(100, "2026-10-29", "2026-10-31", [{ date: "2026-10-30", amount: 7.5 }]);
    expect(series).toEqual([
      { day: "2026-10-29", value: 100, change: 0 },
      { day: "2026-10-30", value: 92.5, change: -7.5 },
      { day: "2026-10-31", value: 92.5, change: 0 },
    ]);
  });
});

describe("reconcileSchema", () => {
  const base = { accountId: "00000000-0000-4000-8000-000000000001", date: "2026-10-01" };
  it("accepts signed amounts, zero and thousands separators", () => {
    expect(reconcileSchema.parse({ ...base, actual: "1,234.50" }).actual).toBe(1234.5);
    expect(reconcileSchema.parse({ ...base, actual: "-820.5" }).actual).toBe(-820.5);
    expect(reconcileSchema.parse({ ...base, actual: 0 }).actual).toBe(0);
  });
  it("rejects more than two decimals and text", () => {
    expect(reconcileSchema.safeParse({ ...base, actual: "1.234" }).success).toBe(false);
    expect(reconcileSchema.safeParse({ ...base, actual: "abc" }).success).toBe(false);
  });
});
