import { fromCents, toCents } from "./money";

/** ADR 0029: recurring payments. A plan only; each due date becomes an ordinary EXPENSE transaction. */
export const BILLING_CYCLES = ["MONTHLY", "YEARLY"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = { MONTHLY: "매월", YEARLY: "매년" };

export type SubscriptionPlan = {
  billing_cycle: string;
  billing_day: number;
  billing_month: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  charged_through: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The charge date in a month: the billing day, or the month's last day when it is shorter (same rule as the SQL). */
export function dueDateIn(year: number, month: number, billingDay: number): string {
  return `${year}-${pad(month)}-${pad(Math.min(billingDay, daysIn(year, month)))}`;
}

function nextDayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The next date this plan will charge on or after `today`, or null when it never will again (paused, or past its end).
 * Dates already charged (≤ charged_through) are skipped.
 */
export function nextDueDate(plan: SubscriptionPlan, today: string): string | null {
  if (!plan.is_active) return null;
  let from = plan.start_date > today ? plan.start_date : today;
  if (plan.charged_through && plan.charged_through >= from) from = nextDayOf(plan.charged_through);
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  // At most 13 months ahead covers a yearly plan.
  for (let i = 0; i < 14; i++) {
    if (plan.billing_cycle === "MONTHLY" || month === plan.billing_month) {
      const due = dueDateIn(year, month, plan.billing_day);
      if (due >= from) return plan.end_date && due > plan.end_date ? null : due;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return null;
}

/** What the plan costs per month (a yearly amount spread over 12), for the list total. */
export function monthlyAmount(plan: { billing_cycle: string; amount: number }): number {
  return plan.billing_cycle === "YEARLY" ? fromCents(Math.round(toCents(plan.amount) / 12)) : plan.amount;
}

export function describeSchedule(plan: Pick<SubscriptionPlan, "billing_cycle" | "billing_day" | "billing_month">): string {
  const day = plan.billing_day >= 31 ? "말일" : `${plan.billing_day}일`;
  return plan.billing_cycle === "YEARLY" ? `매년 ${plan.billing_month}월 ${day}` : `매월 ${day}`;
}
