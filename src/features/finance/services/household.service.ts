import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { MemberRole } from "../domain/finance.types";
import type { CreateHouseholdInput, JoinHouseholdInput } from "../schemas/finance.schema";

export type Membership = { householdId: string; role: MemberRole };

/**
 * The caller's household. Every finance mutation starts here: the household id always comes from the membership row,
 * never from the client.
 */
export async function requireHousehold(ctx: ActionContext): Promise<Membership> {
  const { data, error } = await ctx.supabase
    .from("finance_household_members")
    .select("household_id, role")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND", "가계에 먼저 참여해 주세요.");
  return { householdId: data.household_id, role: data.role as MemberRole };
}

/** Member ids of the household, for payer/owner checks (spec §34). */
export async function householdMemberIds(ctx: ActionContext, householdId: string): Promise<Set<string>> {
  const { data, error } = await ctx.supabase
    .from("finance_household_members")
    .select("user_id")
    .eq("household_id", householdId);
  if (error) throw fromDbError(error);
  return new Set(data.map((m) => m.user_id));
}

export async function createHousehold(ctx: ActionContext, input: CreateHouseholdInput): Promise<string> {
  const { data, error } = await ctx.supabase.rpc("finance_create_household", {
    p_name: input.name,
    p_display_name: input.displayName,
  });
  if (error) {
    if (error.code === "23505") throw new AppError("CONFLICT", "이미 가계에 참여하고 있습니다.");
    throw fromDbError(error);
  }
  return data;
}

export async function joinHousehold(ctx: ActionContext, input: JoinHouseholdInput): Promise<string> {
  const { data, error } = await ctx.supabase.rpc("finance_join_household", {
    p_code: input.code,
    p_display_name: input.displayName,
  });
  if (error) {
    if (error.code === "P0002") throw new AppError("NOT_FOUND", "초대 코드를 찾을 수 없습니다.");
    if (error.code === "23505") throw new AppError("CONFLICT", "이미 가계에 참여하고 있습니다.");
    throw fromDbError(error);
  }
  return data;
}

export async function renameHousehold(ctx: ActionContext, name: string): Promise<void> {
  const { householdId, role } = await requireHousehold(ctx);
  if (role !== "OWNER") throw new AppError("NOT_FOUND", "가계 이름은 소유자만 바꿀 수 있습니다.");
  const { error } = await ctx.supabase.from("finance_households").update({ name }).eq("id", householdId);
  if (error) throw fromDbError(error);
}

export async function updateDisplayName(ctx: ActionContext, displayName: string): Promise<void> {
  await requireHousehold(ctx);
  const { error } = await ctx.supabase
    .from("finance_household_members")
    .update({ display_name: displayName })
    .eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}

export async function rotateInviteCode(ctx: ActionContext): Promise<string> {
  const { role } = await requireHousehold(ctx);
  if (role !== "OWNER") throw new AppError("NOT_FOUND", "초대 코드는 소유자만 바꿀 수 있습니다.");
  const { data, error } = await ctx.supabase.rpc("finance_rotate_invite_code");
  if (error) throw fromDbError(error);
  return data;
}
