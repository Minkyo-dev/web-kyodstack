import { z } from "zod";

export const proposalIdSchema = z.object({ proposalId: z.uuid() });
export type ProposalIdInput = z.infer<typeof proposalIdSchema>;
