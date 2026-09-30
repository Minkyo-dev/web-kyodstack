"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as sessions from "../services/work-session.service";
import {
  manualWorkSessionSchema,
  sessionIdSchema,
  startWorkSessionSchema,
  stopWorkSessionSchema,
} from "../schemas/work-session.schema";

const done = <T>(value: T) => {
  revalidatePath("/scheduler", "layout");
  return value;
};

export async function startWorkSessionAction(input: unknown) {
  return runAction("session.start", startWorkSessionSchema, input, async (data, ctx) =>
    done(await sessions.startWorkSession(ctx, data)),
  );
}

export async function stopWorkSessionAction(input: unknown) {
  return runAction("session.stop", stopWorkSessionSchema, input, async (data, ctx) =>
    done(await sessions.stopWorkSession(ctx, data)),
  );
}

export async function createManualWorkSessionAction(input: unknown) {
  return runAction("session.manual", manualWorkSessionSchema, input, async (data, ctx) =>
    done(await sessions.createManualWorkSession(ctx, data)),
  );
}

export async function deleteWorkSessionAction(input: unknown) {
  return runAction("session.delete", sessionIdSchema, input, async ({ sessionId }, ctx) =>
    done(await sessions.deleteWorkSession(ctx, sessionId)),
  );
}
