import type { Account } from "./finance.types";
import { fromCents, sumAmounts, toCents } from "./money";
import { dueDatesBetween, type SubscriptionPlan } from "./subscription";

/**
 * Account balances (ADR 0032). The SQL functions compute every balance from transactions; this module only combines
 * those numbers for the screens: net worth, liquid assets, card debt, the month's series and the forecast.
 */
export type AccountBalance = { accountId: string; balance: number; reconciledOn: string | null };
export type DailyBalanceRow = {
  day: string;
  account_id: string;
  balance: number;
  inflow: number;
  outflow: number;
  adjustment: number;
};

const LIQUID = new Set(["CHECKING", "SAVINGS", "CASH"]);
const LIABILITY = new Set(["CREDIT_CARD", "LOAN"]);

/** Cards and loans: the user enters what is owed as a positive number; the balance is its negation. */
export const isLiability = (accountType: string) => LIABILITY.has(accountType);
export const balanceFromInput = (accountType: string, value: number) => (isLiability(accountType) && value !== 0 ? -value : value);
export const inputFromBalance = (accountType: string, balance: number) => (isLiability(accountType) ? -balance : balance);

export type Position = { netWorth: number; liquid: number; cardDebt: number };

export function position(accounts: Pick<Account, "id" | "account_type">[], balances: AccountBalance[]): Position {
  const type = new Map(accounts.map((a) => [a.id, a.account_type]));
  const pick = (match: (t: string, b: number) => boolean) =>
    balances.filter((b) => match(type.get(b.accountId) ?? "", b.balance)).map((b) => b.balance);
  return {
    netWorth: sumAmounts(balances.map((b) => b.balance)),
    liquid: sumAmounts(pick((t) => LIQUID.has(t))),
    cardDebt: Math.abs(sumAmounts(pick((t, b) => t === "CREDIT_CARD" && b < 0))),
  };
}

export type SeriesPoint = { day: string; value: number; change: number };

/** Net worth at the end of each day, from the per-account rows (the first day is the opening day). */
export function netWorthSeries(rows: DailyBalanceRow[]): SeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + toCents(r.balance));
  const days = [...byDay.keys()].sort();
  return days.map((day, i) => {
    const cents = byDay.get(day)!;
    return { day, value: fromCents(cents), change: i === 0 ? 0 : fromCents(cents - byDay.get(days[i - 1])!) };
  });
}

export type Charge = { date: string; amount: number };

/** Subscription charges still to come in (after, until]. */
export function upcomingCharges(
  plans: (SubscriptionPlan & { amount: number })[],
  after: string,
  until: string,
): Charge[] {
  const from = nextDay(after);
  if (from > until) return [];
  return plans
    .flatMap((p) => dueDatesBetween(p, from, until).map((date) => ({ date, amount: p.amount })))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The dashed line: the starting value on `start`, then minus each charge on its date, one point per day to `end`. */
export function forecastSeries(startValue: number, start: string, end: string, charges: Charge[]): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  let cents = toCents(startValue);
  for (let day = start; day <= end; day = nextDay(day)) {
    const spent = charges.filter((c) => c.date === day).reduce((acc, c) => acc + toCents(c.amount), 0);
    cents -= day === start ? 0 : spent;
    points.push({ day, value: fromCents(cents), change: day === start || spent === 0 ? 0 : -fromCents(spent) });
  }
  return points;
}

export type AccountMonthRow = {
  accountId: string;
  start: number;
  inflow: number;
  outflow: number;
  adjustment: number;
  end: number;
};

/**
 * The calendar table: per account, the balance on the opening day (the previous month's last day), the month's
 * inflow / outflow / adjustment, and the balance on the last loaded day.
 */
export function monthTable(rows: DailyBalanceRow[], openingDay: string): AccountMonthRow[] {
  const out = new Map<string, AccountMonthRow>();
  const last = new Map<string, string>();
  for (const r of rows) {
    let row = out.get(r.account_id);
    if (!row) {
      row = { accountId: r.account_id, start: 0, inflow: 0, outflow: 0, adjustment: 0, end: 0 };
      out.set(r.account_id, row);
    }
    if (r.day === openingDay) {
      row.start = r.balance;
    } else {
      row.inflow = fromCents(toCents(row.inflow) + toCents(r.inflow));
      row.outflow = fromCents(toCents(row.outflow) + toCents(r.outflow));
      row.adjustment = fromCents(toCents(row.adjustment) + toCents(r.adjustment));
    }
    if (!last.has(r.account_id) || r.day > last.get(r.account_id)!) {
      last.set(r.account_id, r.day);
      row.end = r.balance;
    }
  }
  return [...out.values()];
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
