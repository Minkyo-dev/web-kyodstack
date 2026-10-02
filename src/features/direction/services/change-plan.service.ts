import "server-only";
import type { ActionContext } from "@/lib/action";
import type { CreateChangePlanInput } from "../schemas/direction.schema";
import type { Mission } from "../domain/direction.types";
import { createMission, createProtocol, switchPath, upsertCriterion } from "./direction.service";
import { createHabit } from "./habit.service";

/**
 * The new-change wizard (ADR 0038 §3): mission → criteria → path → protocol → habit through the existing services,
 * so every check still applies. Not one transaction: a later failure leaves the change with the steps before it.
 */
export async function createChangePlan(ctx: ActionContext, input: CreateChangePlanInput): Promise<Mission> {
  const mission = await createMission(ctx, input.change);
  for (const c of input.criteria) await upsertCriterion(ctx, { missionId: mission.id, ...c });
  if (!input.path) return mission;
  const path = await switchPath(ctx, { missionId: mission.id, ...input.path });
  if (!input.rule) return mission;
  const protocol = await createProtocol(ctx, { pathId: path.id, ...input.rule });
  if (input.habit) await createHabit(ctx, { ...input.habit, protocolId: protocol.id });
  return mission;
}
