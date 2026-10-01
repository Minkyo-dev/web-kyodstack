import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { Account } from "../domain/finance.types";
import type { CreateAccountInput, ReorderInput, SetActiveInput, UpdateAccountInput } from "../schemas/finance.schema";
import { householdMemberIds, requireHousehold } from "./household.service";

async function assertOwner(ctx: ActionContext, householdId: string, ownerUserId: string | null) {
  if (ownerUserId === null) return;
  const members = await householdMemberIds(ctx, householdId);
  if (!members.has(ownerUserId)) throw new AppError("VALIDATION_ERROR", "소유자는 가계 구성원이어야 합니다.");
}

export async function createAccount(ctx: ActionContext, input: CreateAccountInput): Promise<Account> {
  const { householdId } = await requireHousehold(ctx);
  await assertOwner(ctx, householdId, input.ownerUserId);
  const [household, last] = await Promise.all([
    ctx.supabase.from("finance_households").select("base_currency").eq("id", householdId).single(),
    ctx.supabase
      .from("finance_accounts")
      .select("sort_order")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (household.error) throw fromDbError(household.error);
  if (last.error) throw fromDbError(last.error);
  const { data, error } = await ctx.supabase
    .from("finance_accounts")
    .insert({
      household_id: householdId,
      name: input.name,
      account_type: input.accountType,
      institution_name: input.institutionName,
      ownership_type: input.ownershipType,
      owner_user_id: input.ownerUserId,
      currency_code: household.data.base_currency,
      sort_order: (last.data?.sort_order ?? -1) + 1,
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data;
}

export async function updateAccount(ctx: ActionContext, input: UpdateAccountInput): Promise<Account> {
  const { householdId } = await requireHousehold(ctx);
  await assertOwner(ctx, householdId, input.ownerUserId);
  const { data, error } = await ctx.supabase
    .from("finance_accounts")
    .update({
      name: input.name,
      account_type: input.accountType,
      institution_name: input.institutionName,
      ownership_type: input.ownershipType,
      owner_user_id: input.ownerUserId,
    })
    .eq("id", input.accountId)
    .eq("household_id", householdId)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

/** Archive (spec §6): transactions keep pointing at the account; it leaves the pickers. */
export async function setAccountActive(ctx: ActionContext, input: SetActiveInput): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const { data, error } = await ctx.supabase
    .from("finance_accounts")
    .update({ is_active: input.active })
    .eq("id", input.id)
    .eq("household_id", householdId)
    .select("id")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
}

export async function reorderAccounts(ctx: ActionContext, input: ReorderInput): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const { data, error } = await ctx.supabase
    .from("finance_accounts")
    .select("id")
    .eq("household_id", householdId)
    .in("id", input.ids);
  if (error) throw fromDbError(error);
  if (data.length !== new Set(input.ids).size) throw new AppError("NOT_FOUND");
  const res = await ctx.supabase.rpc("finance_reorder", { p_table: "accounts", p_ids: input.ids });
  if (res.error) throw fromDbError(res.error);
}
