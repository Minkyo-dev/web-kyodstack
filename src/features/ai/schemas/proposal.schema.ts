import { z } from "zod";

export const proposalTaskSchema = z.object({ taskId: z.uuid() });
