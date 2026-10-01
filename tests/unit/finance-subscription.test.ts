import { describe, expect, it } from "vitest";
import { describeSchedule, dueDateIn, monthlyAmount, nextDueDate, type SubscriptionPlan } from "@/features/finance/domain/subscription";
import { createSubscriptionSchema } from "@/features/finance/schemas/finance.schema";

const plan = (over: Partial<SubscriptionPlan> = {}): SubscriptionPlan => ({
  billing_cycle: "MONTHLY",
  billing_day: 15,
  billing_month: null,
  start_date: "2026-01-01",
  end_date: null,
  is_active: true,
  charged_through: null,
  ...over,
});

describe("dueDateIn", () => {
  it("clamps to the month's last day", () => {
    expect(dueDateIn(2026, 2, 31)).toBe("2026-02-28");
    expect(dueDateIn(2028, 2, 30)).toBe("2028-02-29");
    expect(dueDateIn(2026, 4, 31)).toBe("2026-04-30");
    expect(dueDateIn(2026, 1, 5)).toBe("2026-01-05");
  });
});

describe("nextDueDate", () => {
  it("is today when today is the billing day and not yet charged", () => {
    expect(nextDueDate(plan(), "2026-10-15")).toBe("2026-10-15");
  });

  it("skips a date already charged", () => {
    expect(nextDueDate(plan({ charged_through: "2026-10-15" }), "2026-10-15")).toBe("2026-11-15");
  });

  it("rolls into next month after the billing day", () => {
    expect(nextDueDate(plan(), "2026-10-16")).toBe("2026-11-15");
    expect(nextDueDate(plan({ billing_day: 31 }), "2026-10-31")).toBe("2026-10-31");
    expect(nextDueDate(plan({ billing_day: 31 }), "2026-11-01")).toBe("2026-11-30");
  });

  it("waits for a future start date", () => {
    expect(nextDueDate(plan({ start_date: "2026-12-20" }), "2026-10-01")).toBe("2027-01-15");
  });

  it("finds a yearly plan's month, across the year end", () => {
    const yearly = plan({ billing_cycle: "YEARLY", billing_month: 3, billing_day: 10 });
    expect(nextDueDate(yearly, "2026-10-01")).toBe("2027-03-10");
    expect(nextDueDate(yearly, "2027-03-10")).toBe("2027-03-10");
  });

  it("is null when paused or past the end date", () => {
    expect(nextDueDate(plan({ is_active: false }), "2026-10-01")).toBeNull();
    expect(nextDueDate(plan({ end_date: "2026-10-10" }), "2026-10-01")).toBeNull();
    expect(nextDueDate(plan({ end_date: "2026-10-20" }), "2026-10-01")).toBe("2026-10-15");
  });
});

describe("monthlyAmount / describeSchedule", () => {
  it("spreads a yearly amount over 12 months", () => {
    expect(monthlyAmount({ billing_cycle: "YEARLY", amount: 120 })).toBe(10);
    expect(monthlyAmount({ billing_cycle: "YEARLY", amount: 100 })).toBe(8.33);
    expect(monthlyAmount({ billing_cycle: "MONTHLY", amount: 17.99 })).toBe(17.99);
  });

  it("describes the schedule", () => {
    expect(describeSchedule({ billing_cycle: "MONTHLY", billing_day: 5, billing_month: null })).toBe("매월 5일");
    expect(describeSchedule({ billing_cycle: "YEARLY", billing_day: 31, billing_month: 2 })).toBe("매년 2월 말일");
  });
});

describe("createSubscriptionSchema", () => {
  const base = {
    name: "Netflix",
    amount: "17.99",
    billingCycle: "MONTHLY",
    billingDay: "15",
    billingMonth: null,
    startDate: "2026-10-01",
    endDate: "",
    accountId: "00000000-0000-4000-8000-000000000001",
    categoryId: "00000000-0000-4000-8000-000000000002",
    paidByUserId: null,
    note: "",
  };

  it("parses form strings", () => {
    const r = createSubscriptionSchema.parse(base);
    expect(r).toMatchObject({ amount: 17.99, billingDay: 15, billingMonth: null, endDate: null, note: null });
  });

  it("requires a month for a yearly plan and drops it for a monthly one", () => {
    expect(createSubscriptionSchema.safeParse({ ...base, billingCycle: "YEARLY" }).success).toBe(false);
    expect(createSubscriptionSchema.parse({ ...base, billingMonth: "4" }).billingMonth).toBeNull();
    expect(createSubscriptionSchema.parse({ ...base, billingCycle: "YEARLY", billingMonth: "4" }).billingMonth).toBe(4);
  });

  it("rejects an end before the start and an out-of-range day", () => {
    expect(createSubscriptionSchema.safeParse({ ...base, endDate: "2026-09-30" }).success).toBe(false);
    expect(createSubscriptionSchema.safeParse({ ...base, billingDay: "32" }).success).toBe(false);
    expect(createSubscriptionSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
  });
});
