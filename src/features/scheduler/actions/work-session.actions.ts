"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as sessions from "../services/work-session.service";
import {
  manualWorkSessionSchema,
  pauseWorkSessionSchema,
  saveWorkLogNoteSchema,
  sessionIdSchema,
  setPauseReasonSchema,
  startWorkSessionSchema,
  stopWorkSessionSchema,
  switchWorkSessionSchema,
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

export async function pauseWorkSessionAction(input: unknown) {
  return runAction("session.pause", pauseWorkSessionSchema, input, async (data, ctx) =>
    done(await sessions.pauseWorkSession(ctx, data)),
  );
}

export async function resumeWorkSessionAction(input: unknown) {
  return runAction("session.resume", sessionIdSchema, input, async ({ sessionId }, ctx) =>
    done(await sessions.resumeWorkSession(ctx, sessionId)),
  );
}

export async function setPauseReasonAction(input: unknown) {
  return runAction("session.pause_reason", setPauseReasonSchema, input, async (data, ctx) =>
    sessions.setPauseReason(ctx, data),
  );
}

export async function saveWorkLogNoteAction(input: unknown) {
  return runAction("session.note", saveWorkLogNoteSchema, input, async (data, ctx) =>
    sessions.saveWorkLogNote(ctx, data),
  );
}

export async function switchWorkSessionAction(input: unknown) {
  return runAction("session.switch", switchWorkSessionSchema, input, async (data, ctx) =>
    done(await sessions.switchWorkSession(ctx, data)),
  );
}
