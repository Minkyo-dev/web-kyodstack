"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { proposalTaskSchema } from "../schemas/proposal.schema";
import { classifyTasks } from "../services/classification.service";
import { applyProposals, ignoreProposals, settleEditedProposals } from "../services/proposal.service";

const done = <T>(value: T) => {
  revalidatePath("/scheduler", "layout");
  return value;
};

export async function requestClassificationAction(input: unknown) {
  return runAction("ai.classify", proposalTaskSchema, input, async ({ taskId }, ctx) => done(await classifyTasks(ctx, [taskId])));
}

export async function applyProposalsAction(input: unknown) {
  return runAction("ai.proposals.apply", proposalTaskSchema, input, async ({ taskId }, ctx) => done(await applyProposals(ctx, taskId)));
}

export async function ignoreProposalsAction(input: unknown) {
  return runAction("ai.proposals.ignore", proposalTaskSchema, input, async ({ taskId }, ctx) => done(await ignoreProposals(ctx, taskId)));
}

export async function settleEditedProposalsAction(input: unknown) {
  return runAction("ai.proposals.settle", proposalTaskSchema, input, async ({ taskId }, ctx) =>
    done(await settleEditedProposals(ctx, taskId)),
  );
}
