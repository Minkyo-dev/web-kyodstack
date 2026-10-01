import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type { Category, Subscription, Transaction } from "../domain/finance.types";
import type { CategoryRow, DailyRow, MonthlyRow } from "../domain/aggregate";
import type { AccountBalance, DailyBalanceRow } from "../domain/balances";
import { budgetMonths, sumBudgets, type BudgetLine } from "../domain/budgets";
import type { TransactionFilter } from "../schemas/finance.schema";

/**
 * Reads for the finance screens. Totals always come from the SQL aggregates (spec §26, §29); only the transactions of
 * one day or one filtered list are fetched as rows.
 */

export async function getDailyTotals(supabase: SupabaseServerClient, householdId: string, from: string, to: string) {
  const { data, error } = await supabase.rpc("finance_daily_totals", { p_household: householdId, p_from: from, p_to: to });
  if (error) throw fromDbError(error);
  return data as DailyRow[];
}

export async function getMonthlyTotals(supabase: SupabaseServerClient, householdId: string, year: number) {
  const { data, error } = await supabase.rpc("finance_monthly_totals", { p_household: householdId, p_year: year });
  if (error) throw fromDbError(error);
  return data as MonthlyRow[];
}

export async function getCategoryTotals(supabase: SupabaseServerClient, householdId: string, from: string, to: string) {
  const { data, error } = await supabase.rpc("finance_category_totals", { p_household: householdId, p_from: from, p_to: to });
  if (error) throw fromDbError(error);
  return data as CategoryRow[];
}

const newestFirst = { ascending: false } as const;

export async function listTransactionsByDate(supabase: SupabaseServerClient, householdId: string, date: string) {
  const { data, error } = await supabase
    .from("finance_transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("transaction_date", date)
    .order("transaction_time", { ascending: true, nullsFirst: true })
    .order("created_at");
  if (error) throw fromDbError(error);
  return data as Transaction[];
}

export async function listRecentTransactions(supabase: SupabaseServerClient, householdId: string, limit = 5) {
  const { data, error } = await supabase
    .from("finance_transactions")
    .select("*")
    .eq("household_id", householdId)
    .order("transaction_date", newestFirst)
    .order("created_at", newestFirst)
    .limit(limit);
  if (error) throw fromDbError(error);
  return data as Transaction[];
}

export async function countTransactions(supabase: SupabaseServerClient, householdId: string) {
  const { count, error } = await supabase
    .from("finance_transactions")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId);
  if (error) throw fromDbError(error);
  return count ?? 0;
}

/** PostgREST `or()` syntax treats , ( ) as separators; strip them (and LIKE wildcards) from a search term. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%_\\"]/g, " ").replace(/\s+/g, " ").trim();
}

export const TRANSACTION_LIST_LIMIT = 300;

/** Spec §23: date range, type, category (a parent includes its children), account (either side of a transfer), payer,
 * amount range and a text search over merchant and memo. */
export async function listTransactions(
  supabase: SupabaseServerClient,
  householdId: string,
  filter: TransactionFilter,
  categories: Category[],
) {
  let query = supabase.from("finance_transactions").select("*").eq("household_id", householdId);
  if (filter.from) query = query.gte("transaction_date", filter.from);
  if (filter.to) query = query.lte("transaction_date", filter.to);
  if (filter.type) query = query.eq("type", filter.type);
  if (filter.category) {
    const ids = [filter.category, ...categories.filter((c) => c.parent_id === filter.category).map((c) => c.id)];
    query = query.in("category_id", ids);
  }
  if (filter.account) query = query.or(`account_id.eq.${filter.account},transfer_account_id.eq.${filter.account}`);
  if (filter.paidBy) query = query.eq("paid_by_user_id", filter.paidBy);
  if (filter.min !== undefined) query = query.gte("amount", filter.min);
  if (filter.max !== undefined) query = query.lte("amount", filter.max);
  const q = filter.q ? sanitizeSearch(filter.q) : "";
  if (q) query = query.or(`merchant_name.ilike.*${q}*,note.ilike.*${q}*`);

  const { data, error } = await query
    .order("transaction_date", newestFirst)
    .order("transaction_time", { ascending: false, nullsFirst: false })
    .order("created_at", newestFirst)
    .limit(TRANSACTION_LIST_LIMIT + 1);
  if (error) throw fromDbError(error);
  return { rows: (data as Transaction[]).slice(0, TRANSACTION_LIST_LIMIT), truncated: data.length > TRANSACTION_LIST_LIMIT };
}

/** Recurring payment plans (ADR 0029), active first. */
export async function listSubscriptions(supabase: SupabaseServerClient, householdId: string): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from("finance_subscriptions")
    .select("*")
    .eq("household_id", householdId)
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw fromDbError(error);
  return data;
}

/** Every account's balance at the end of `asOf` (ADR 0032), computed in SQL from the transactions. */
export async function getAccountBalances(supabase: SupabaseServerClient, householdId: string, asOf: string): Promise<AccountBalance[]> {
  const { data, error } = await supabase.rpc("finance_account_balances", { p_household: householdId, p_as_of: asOf });
  if (error) throw fromDbError(error);
  return data.map((r) => ({ accountId: r.account_id, balance: Number(r.balance), reconciledOn: r.reconciled_on }));
}

/** End-of-day balance and the day's flows per account for each day in [from, to]. */
export async function getDailyBalances(supabase: SupabaseServerClient, householdId: string, from: string, to: string) {
  const { data, error } = await supabase.rpc("finance_daily_balances", { p_household: householdId, p_from: from, p_to: to });
  if (error) throw fromDbError(error);
  return data.map((r) => ({ ...r, balance: Number(r.balance), inflow: Number(r.inflow), outflow: Number(r.outflow), adjustment: Number(r.adjustment) })) as DailyBalanceRow[];
}

/** The effective budget per category for a month (ADR 0033): the one-month amount, else the latest default. */
export async function getMonthBudgets(supabase: SupabaseServerClient, householdId: string, month: string): Promise<BudgetLine[]> {
  const { data, error } = await supabase.rpc("finance_month_budgets", { p_household: householdId, p_month: month });
  if (error) throw fromDbError(error);
  return data.map((r) => ({
    categoryId: r.category_id,
    amount: Number(r.amount),
    isOverride: r.is_override,
    defaultAmount: r.default_amount === null ? null : Number(r.default_amount),
  }));
}

/** Budget per category for a dashboard period: one month, or the sum of the year's counted months. */
export async function getPeriodBudgets(
  supabase: SupabaseServerClient,
  householdId: string,
  period: { mode: "monthly"; key: { year: number; month: number } } | { mode: "yearly"; year: number },
  today: string,
): Promise<Map<string, number>> {
  const months =
    period.mode === "monthly"
      ? [`${period.key.year}-${String(period.key.month).padStart(2, "0")}-01`]
      : budgetMonths(period.year, today);
  const lines = await Promise.all(months.map((m) => getMonthBudgets(supabase, householdId, m)));
  return sumBudgets(lines);
}
