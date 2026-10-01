import "server-only";
import { cache } from "react";
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { todayLocalDate } from "@/features/scheduler/utils/timezone";
import { chargeDueSubscriptions } from "../services/subscription.service";
import type { FinanceContext, FinanceLookups, MemberRef, MemberRole } from "../domain/finance.types";

/** The caller's household, their membership and the member list; null before they create or join one. */
export async function loadFinanceContext(supabase: SupabaseServerClient, userId: string): Promise<FinanceContext | null> {
  const mine = await supabase
    .from("finance_household_members")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (mine.error) throw fromDbError(mine.error);
  if (!mine.data) return null;
  const householdId = mine.data.household_id;

  const [household, members] = await Promise.all([
    supabase.from("finance_households").select("*").eq("id", householdId).single(),
    supabase
      .from("finance_household_members")
      .select("user_id, display_name, role, joined_at")
      .eq("household_id", householdId)
      .order("joined_at"),
  ]);
  if (household.error) throw fromDbError(household.error);
  if (members.error) throw fromDbError(members.error);

  const refs: MemberRef[] = members.data.map((m) => ({
    userId: m.user_id,
    displayName: m.display_name,
    role: m.role as MemberRole,
  }));
  return {
    household: household.data,
    me: refs.find((m) => m.userId === userId)!,
    members: refs,
    today: todayLocalDate(household.data.timezone),
  };
}

/**
 * Per-request cache for pages: the layout and the page share one lookup. It also records any subscription charges
 * that fell due (ADR 0029) before a page reads totals; that write is idempotent and never blocks the page.
 */
export const getFinanceContext = cache(async (userId: string) => {
  const supabase = await createClient();
  const ctx = await loadFinanceContext(supabase, userId);
  if (ctx) {
    try {
      await chargeDueSubscriptions(supabase, ctx.household.id);
    } catch (error) {
      log({ action: "finance.subscription.charge", userId, success: false, detail: String(error) });
    }
  }
  return ctx;
});

/** Accounts and categories (archived ones included: old transactions still show them) plus members. */
export const getFinanceLookups = cache(async (userId: string): Promise<FinanceLookups | null> => {
  const ctx = await getFinanceContext(userId);
  if (!ctx) return null;
  const supabase = await createClient();
  const [accounts, categories] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select("*")
      .eq("household_id", ctx.household.id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("finance_categories")
      .select("*")
      .eq("household_id", ctx.household.id)
      .order("sort_order")
      .order("created_at"),
  ]);
  if (accounts.error) throw fromDbError(accounts.error);
  if (categories.error) throw fromDbError(categories.error);
  return {
    accounts: accounts.data,
    categories: categories.data,
    members: ctx.members,
    meId: ctx.me.userId,
    today: ctx.today,
    currency: ctx.household.base_currency,
  };
});
