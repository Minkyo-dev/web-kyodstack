import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { isNewLink } from "../domain/link-rules";
import type { Identity, Mission, MissionCriterion, Path, Protocol, Purpose } from "../domain/direction.types";
import type {
  CreateIdentityInput,
  CreateMissionInput,
  CreateProtocolInput,
  SetCriterionProgressInput,
  SetPurposeInput,
  SwitchPathInput,
  UpdateIdentityInput,
  UpdateMissionInput,
  UpdatePathInput,
  UpdateProtocolInput,
  UpsertCriterionInput,
} from "../schemas/direction.schema";

const retiredError = (code?: string) =>
  code === "23514" ? new AppError("VALIDATION_ERROR", "교체된 전략은 수정할 수 없습니다.") : null;

/** Archive the active purpose, then insert the new one. A concurrent call fails on the partial unique index. */
export async function setPurpose(ctx: ActionContext, input: SetPurposeInput): Promise<Purpose> {
  const archived = await ctx.supabase
    .from("purposes")
    .update({ status: "archived" })
    .eq("user_id", ctx.user.id)
    .eq("status", "active");
  if (archived.error) throw fromDbError(archived.error);
  const { data, error } = await ctx.supabase
    .from("purposes")
    .insert({ user_id: ctx.user.id, statement: input.statement })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as Purpose;
}

export async function createIdentity(ctx: ActionContext, input: CreateIdentityInput): Promise<Identity> {
  const { count } = await ctx.supabase.from("identities").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id);
  const { data, error } = await ctx.supabase
    .from("identities")
    .insert({ user_id: ctx.user.id, name: input.name, description: input.description, sort_order: count ?? 0 })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as Identity;
}

export async function updateIdentity(ctx: ActionContext, input: UpdateIdentityInput): Promise<Identity> {
  const { data, error } = await ctx.supabase
    .from("identities")
    .update({ name: input.name, description: input.description, status: input.status, sort_order: input.sortOrder })
    .eq("id", input.identityId)
    .eq("user_id", ctx.user.id)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as Identity;
}

/** Replace a mission's identity links. The composite FKs reject other users' identities. */
async function setMissionIdentities(ctx: ActionContext, missionId: string, identityIds: string[]) {
  const del = await ctx.supabase.from("mission_identities").delete().eq("mission_id", missionId).eq("user_id", ctx.user.id);
  if (del.error) throw fromDbError(del.error);
  if (identityIds.length === 0) return;
  const ins = await ctx.supabase
    .from("mission_identities")
    .insert([...new Set(identityIds)].map((identity_id) => ({ user_id: ctx.user.id, mission_id: missionId, identity_id })));
  if (ins.error) throw fromDbError(ins.error);
}

export async function createMission(ctx: ActionContext, input: CreateMissionInput): Promise<Mission> {
  const purpose = await ctx.supabase
    .from("purposes")
    .select("id")
    .eq("user_id", ctx.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (purpose.error) throw fromDbError(purpose.error);
  const { data, error } = await ctx.supabase
    .from("missions")
    .insert({
      user_id: ctx.user.id,
      purpose_id: purpose.data?.id ?? null,
      title: input.title,
      outcome: input.outcome,
      deadline: input.deadline ?? null,
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  await setMissionIdentities(ctx, data.id, input.identityIds);
  return data as Mission;
}

export async function updateMission(ctx: ActionContext, input: UpdateMissionInput): Promise<Mission> {
  const before = await ctx.supabase
    .from("missions")
    .select("status, closed_at")
    .eq("id", input.missionId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (before.error) throw fromDbError(before.error);
  if (!before.data) throw new AppError("NOT_FOUND");
  const closedAt =
    input.status === "active" ? null : before.data.status === input.status ? before.data.closed_at : new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("missions")
    .update({ title: input.title, outcome: input.outcome, deadline: input.deadline, status: input.status, closed_at: closedAt })
    .eq("id", input.missionId)
    .eq("user_id", ctx.user.id)
    .select()
    .single();
  if (error) throw fromDbError(error);
  await setMissionIdentities(ctx, input.missionId, input.identityIds);
  return data as Mission;
}

export async function upsertCriterion(ctx: ActionContext, input: UpsertCriterionInput): Promise<MissionCriterion> {
  const row = {
    user_id: ctx.user.id,
    mission_id: input.missionId,
    label: input.label,
    kind: input.kind,
    target_value: input.targetValue,
    unit: input.unit,
  };
  const query = input.criterionId
    ? ctx.supabase.from("mission_criteria").update(row).eq("id", input.criterionId).eq("user_id", ctx.user.id)
    : ctx.supabase.from("mission_criteria").insert(row);
  // A foreign mission id fails the composite FK (23503 → NOT_FOUND).
  const { data, error } = await query.select().maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as MissionCriterion;
}

export async function deleteCriterion(ctx: ActionContext, criterionId: string): Promise<void> {
  const { error } = await ctx.supabase.from("mission_criteria").delete().eq("id", criterionId).eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}

/** Check criteria toggle met_at; numeric criteria are met once current ≥ target. */
export async function setCriterionProgress(ctx: ActionContext, input: SetCriterionProgressInput): Promise<MissionCriterion> {
  const current = await ctx.supabase
    .from("mission_criteria")
    .select("kind, target_value, met_at")
    .eq("id", input.criterionId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (current.error) throw fromDbError(current.error);
  if (!current.data) throw new AppError("NOT_FOUND");
  if (current.data.kind === "check" && input.met === undefined) throw new AppError("VALIDATION_ERROR");
  if (current.data.kind === "numeric" && input.currentValue === undefined) throw new AppError("VALIDATION_ERROR");
  const now = new Date().toISOString();
  const patch =
    current.data.kind === "check"
      ? { met_at: input.met ? (current.data.met_at ?? now) : null }
      : {
          current_value: input.currentValue!,
          met_at: input.currentValue! >= Number(current.data.target_value) ? (current.data.met_at ?? now) : null,
        };
  const { data, error } = await ctx.supabase
    .from("mission_criteria")
    .update(patch)
    .eq("id", input.criterionId)
    .eq("user_id", ctx.user.id)
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as MissionCriterion;
}

export async function switchPath(ctx: ActionContext, input: SwitchPathInput): Promise<Path> {
  const { data, error } = await ctx.supabase
    .rpc("switch_path", {
      p_mission_id: input.missionId,
      p_title: input.title,
      p_approach: input.approach,
      p_trade_offs: input.tradeOffs ?? undefined,
    })
    .single();
  if (error) {
    if (error.code === "P0002") throw new AppError("NOT_FOUND", "진행 중인 목표를 찾을 수 없습니다.");
    throw fromDbError(error);
  }
  return data as Path;
}

export async function updatePath(ctx: ActionContext, input: UpdatePathInput): Promise<Path> {
  const { data, error } = await ctx.supabase
    .from("paths")
    .update({ title: input.title, approach: input.approach, trade_offs: input.tradeOffs })
    .eq("id", input.pathId)
    .eq("user_id", ctx.user.id)
    .select()
    .maybeSingle();
  if (error) throw retiredError(error.code) ?? fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as Path;
}

export async function createProtocol(ctx: ActionContext, input: CreateProtocolInput): Promise<Protocol> {
  const path = await ctx.supabase
    .from("paths")
    .select("id, mission_id, status")
    .eq("id", input.pathId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (path.error) throw fromDbError(path.error);
  if (!path.data) throw new AppError("NOT_FOUND");
  if (path.data.status !== "active") throw new AppError("VALIDATION_ERROR", "교체된 전략은 수정할 수 없습니다.");
  const { count } = await ctx.supabase.from("protocols").select("id", { count: "exact", head: true }).eq("path_id", input.pathId);
  const { data, error } = await ctx.supabase
    .from("protocols")
    .insert({
      user_id: ctx.user.id,
      path_id: path.data.id,
      mission_id: path.data.mission_id,
      title: input.title,
      steps: input.steps,
      intended_minutes: input.intendedMinutes,
      sort_order: count ?? 0,
    })
    .select()
    .single();
  if (error) throw retiredError(error.code) ?? fromDbError(error);
  return data as Protocol;
}

export async function updateProtocol(ctx: ActionContext, input: UpdateProtocolInput): Promise<Protocol> {
  const { data, error } = await ctx.supabase
    .from("protocols")
    .update({
      title: input.title,
      steps: input.steps,
      intended_minutes: input.intendedMinutes,
      status: input.status,
      sort_order: input.sortOrder,
    })
    .eq("id", input.protocolId)
    .eq("user_id", ctx.user.id)
    .select()
    .maybeSingle();
  if (error) throw retiredError(error.code) ?? fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as Protocol;
}

/**
 * Resolve a task's mission/protocol link (ADR 0020). Both ids must belong to the caller; a protocol implies its
 * mission. New links need an active mission / an active protocol on an active path; unchanged links are kept.
 */
export async function resolveDirectionLink(
  ctx: ActionContext,
  input: { missionId?: string | null; protocolId?: string | null },
  current?: { mission_id: string | null; protocol_id: string | null },
): Promise<{ mission_id: string | null; protocol_id: string | null }> {
  if (input.protocolId) {
    const { data, error } = await ctx.supabase
      .from("protocols")
      .select("id, mission_id, status, path:paths!protocols_path_id_mission_id_fkey(status)")
      .eq("id", input.protocolId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError("NOT_FOUND", "실행 방식을 찾을 수 없습니다.");
    if (input.missionId && input.missionId !== data.mission_id) {
      throw new AppError("VALIDATION_ERROR", "실행 방식이 선택한 목표에 속하지 않습니다.");
    }
    if (isNewLink(input.protocolId, current?.protocol_id) && (data.status !== "active" || data.path?.status !== "active")) {
      throw new AppError("VALIDATION_ERROR", "보관되었거나 교체된 실행 방식에는 연결할 수 없습니다.");
    }
    return { mission_id: data.mission_id, protocol_id: data.id };
  }
  if (input.missionId) {
    const { data, error } = await ctx.supabase
      .from("missions")
      .select("id, status")
      .eq("id", input.missionId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError("NOT_FOUND", "목표를 찾을 수 없습니다.");
    if (isNewLink(input.missionId, current?.mission_id) && data.status !== "active") {
      throw new AppError("VALIDATION_ERROR", "종료된 목표에는 연결할 수 없습니다.");
    }
    return { mission_id: data.id, protocol_id: null };
  }
  return { mission_id: null, protocol_id: null };
}
