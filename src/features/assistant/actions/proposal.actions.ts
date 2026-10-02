"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { applyProposal, dismissProposal } from "../services/proposal.service";
import { proposalIdSchema } from "../schemas/proposal.schema";

// Proposals touch the 습관 tab, the review page and the scheduler brief, all under /scheduler.
const done = <T>(value: T) => {
  revalidatePath("/scheduler", "layout");
  return value;
};

/** Apply a coaching proposal (ADR 0040); `review` returns where to go. */
export async function applyProposalAction(input: unknown) {
  return runAction("assistant.proposal.apply", proposalIdSchema, input, async (d, ctx) => done(await applyProposal(ctx, d.proposalId)));
}
export async function dismissProposalAction(input: unknown) {
  return runAction("assistant.proposal.dismiss", proposalIdSchema, input, async (d, ctx) => done(await dismissProposal(ctx, d.proposalId)));
}
