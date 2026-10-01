import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { Category } from "../domain/finance.types";
import type { CreateCategoryInput, ReorderInput, SetActiveInput, UpdateCategoryInput } from "../schemas/finance.schema";
import { requireHousehold } from "./household.service";

async function loadCategory(ctx: ActionContext, householdId: string, id: string): Promise<Category> {
  const { data, error } = await ctx.supabase
    .from("finance_categories")
    .select("*")
    .eq("id", id)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  // A deleted category (ADR 0027) is gone for every write path.
  if (!data || data.deleted_at) throw new AppError("NOT_FOUND");
  return data;
}

/** A parent must be a top-level category of the same type in the same household (two levels, spec §7). */
async function assertParent(ctx: ActionContext, householdId: string, parentId: string, type: string) {
  const parent = await loadCategory(ctx, householdId, parentId);
  if (parent.parent_id) throw new AppError("VALIDATION_ERROR", "하위 카테고리 아래에는 더 만들 수 없습니다.");
  if (parent.type !== type) throw new AppError("VALIDATION_ERROR", "같은 종류(수입/지출)의 카테고리 아래로만 옮길 수 있습니다.");
}

async function nextSortOrder(ctx: ActionContext, householdId: string, type: string, parentId: string | null) {
  let query = ctx.supabase
    .from("finance_categories")
    .select("sort_order")
    .eq("household_id", householdId)
    .eq("type", type);
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  const { data, error } = await query.order("sort_order", { ascending: false }).limit(1).maybeSingle();
  if (error) throw fromDbError(error);
  return (data?.sort_order ?? -1) + 1;
}

export async function createCategory(ctx: ActionContext, input: CreateCategoryInput): Promise<Category> {
  const { householdId } = await requireHousehold(ctx);
  if (input.parentId) await assertParent(ctx, householdId, input.parentId, input.type);
  const { data, error } = await ctx.supabase
    .from("finance_categories")
    .insert({
      household_id: householdId,
      type: input.type,
      name: input.name,
      icon: input.icon,
      parent_id: input.parentId,
      sort_order: await nextSortOrder(ctx, householdId, input.type, input.parentId),
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data;
}

/** Rename, change icon, or move under another parent / to the top level (spec §25). */
export async function updateCategory(ctx: ActionContext, input: UpdateCategoryInput): Promise<Category> {
  const { householdId } = await requireHousehold(ctx);
  const current = await loadCategory(ctx, householdId, input.categoryId);
  const moving = input.parentId !== current.parent_id;
  if (moving && input.parentId) {
    if (input.parentId === current.id) throw new AppError("VALIDATION_ERROR", "자기 자신 아래로 옮길 수 없습니다.");
    await assertParent(ctx, householdId, input.parentId, current.type);
    const children = await ctx.supabase
      .from("finance_categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", current.id);
    if (children.error) throw fromDbError(children.error);
    if ((children.count ?? 0) > 0) {
      throw new AppError("VALIDATION_ERROR", "하위 카테고리가 있는 카테고리는 다른 카테고리 아래로 옮길 수 없습니다.");
    }
  }
  const { data, error } = await ctx.supabase
    .from("finance_categories")
    .update({
      name: input.name,
      icon: input.icon,
      parent_id: input.parentId,
      ...(moving ? { sort_order: await nextSortOrder(ctx, householdId, current.type, input.parentId) } : {}),
    })
    .eq("id", current.id)
    .eq("household_id", householdId)
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data;
}

/**
 * Archive / restore (spec §25): past transactions keep the category; it leaves the picker. Archiving a parent archives
 * its children too, so the picker never offers "archived parent > child". Restoring touches only the one category.
 */
export async function setCategoryActive(ctx: ActionContext, input: SetActiveInput): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const current = await loadCategory(ctx, householdId, input.id);
  if (input.active && current.parent_id) {
    const parent = await loadCategory(ctx, householdId, current.parent_id);
    if (!parent.is_active) throw new AppError("VALIDATION_ERROR", "상위 카테고리를 먼저 복원해 주세요.");
  }
  let query = ctx.supabase.from("finance_categories").update({ is_active: input.active }).eq("household_id", householdId);
  query = input.active
    ? query.eq("id", current.id)
    : query.is("deleted_at", null).or(`id.eq.${current.id},parent_id.eq.${current.id}`);
  const { error } = await query;
  if (error) throw fromDbError(error);
}

/**
 * Logical delete (ADR 0027): the row stays so past transactions keep their category, but it leaves settings, pickers
 * and filters for good. Deleting a parent deletes its children too.
 */
export async function deleteCategory(ctx: ActionContext, id: string): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const current = await loadCategory(ctx, householdId, id);
  const { error } = await ctx.supabase
    .from("finance_categories")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .or(`id.eq.${current.id},parent_id.eq.${current.id}`);
  if (error) throw fromDbError(error);
}

export async function reorderCategories(ctx: ActionContext, input: ReorderInput): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const { data, error } = await ctx.supabase
    .from("finance_categories")
    .select("id, parent_id, type")
    .eq("household_id", householdId)
    .in("id", input.ids);
  if (error) throw fromDbError(error);
  if (data.length !== new Set(input.ids).size) throw new AppError("NOT_FOUND");
  // Only siblings can be reordered together.
  if (new Set(data.map((c) => `${c.type}:${c.parent_id ?? ""}`)).size > 1) throw new AppError("VALIDATION_ERROR");
  const res = await ctx.supabase.rpc("finance_reorder", { p_table: "categories", p_ids: input.ids });
  if (res.error) throw fromDbError(res.error);
}
