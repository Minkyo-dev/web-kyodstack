"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as direction from "../services/direction.service";
import {
  createIdentitySchema,
  createMissionSchema,
  createProtocolSchema,
  criterionIdSchema,
  setCriterionProgressSchema,
  setPurposeSchema,
  switchPathSchema,
  updateIdentitySchema,
  updateMissionSchema,
  updatePathSchema,
  updateProtocolSchema,
  upsertCriterionSchema,
} from "../schemas/direction.schema";

// The directive page, the scheduler (task breadcrumbs) and projects all live under /scheduler.
const done = <T>(value: T) => {
  revalidatePath("/scheduler", "layout");
  return value;
};

export async function setPurposeAction(input: unknown) {
  return runAction("direction.purpose.set", setPurposeSchema, input, async (d, ctx) => done(await direction.setPurpose(ctx, d)));
}
export async function createIdentityAction(input: unknown) {
  return runAction("direction.identity.create", createIdentitySchema, input, async (d, ctx) => done(await direction.createIdentity(ctx, d)));
}
export async function updateIdentityAction(input: unknown) {
  return runAction("direction.identity.update", updateIdentitySchema, input, async (d, ctx) => done(await direction.updateIdentity(ctx, d)));
}
export async function createMissionAction(input: unknown) {
  return runAction("direction.mission.create", createMissionSchema, input, async (d, ctx) => done(await direction.createMission(ctx, d)));
}
export async function updateMissionAction(input: unknown) {
  return runAction("direction.mission.update", updateMissionSchema, input, async (d, ctx) => done(await direction.updateMission(ctx, d)));
}
export async function upsertCriterionAction(input: unknown) {
  return runAction("direction.criterion.upsert", upsertCriterionSchema, input, async (d, ctx) => done(await direction.upsertCriterion(ctx, d)));
}
export async function deleteCriterionAction(input: unknown) {
  return runAction("direction.criterion.delete", criterionIdSchema, input, async (d, ctx) =>
    done(await direction.deleteCriterion(ctx, d.criterionId)),
  );
}
export async function setCriterionProgressAction(input: unknown) {
  return runAction("direction.criterion.progress", setCriterionProgressSchema, input, async (d, ctx) =>
    done(await direction.setCriterionProgress(ctx, d)),
  );
}
export async function switchPathAction(input: unknown) {
  return runAction("direction.path.switch", switchPathSchema, input, async (d, ctx) => done(await direction.switchPath(ctx, d)));
}
export async function updatePathAction(input: unknown) {
  return runAction("direction.path.update", updatePathSchema, input, async (d, ctx) => done(await direction.updatePath(ctx, d)));
}
export async function createProtocolAction(input: unknown) {
  return runAction("direction.protocol.create", createProtocolSchema, input, async (d, ctx) => done(await direction.createProtocol(ctx, d)));
}
export async function updateProtocolAction(input: unknown) {
  return runAction("direction.protocol.update", updateProtocolSchema, input, async (d, ctx) => done(await direction.updateProtocol(ctx, d)));
}
