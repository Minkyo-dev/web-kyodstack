"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { evaluateProgress } from "@/features/gamification/services/progress.service";
import * as tasks from "../services/task.service";
import { createTaskSchema, taskIdSchema, updateTaskSchema } from "../schemas/task.schema";

const done = <T>(value: T) => {
  revalidatePath("/scheduler", "layout");
  return value;
};

export async function createTaskAction(input: unknown) {
  return runAction("task.create", createTaskSchema, input, async (data, ctx) =>
    done(await tasks.createTask(ctx, data)),
  );
}

export async function updateTaskAction(input: unknown) {
  return runAction("task.update", updateTaskSchema, input, async (data, ctx) =>
    done(await tasks.updateTask(ctx, data)),
  );
}

export async function deleteTaskAction(input: unknown) {
  return runAction("task.delete", taskIdSchema, input, async ({ taskId }, ctx) =>
    done(await tasks.deleteTask(ctx, taskId)),
  );
}

export async function completeTaskAction(input: unknown) {
  return runAction("task.complete", taskIdSchema, input, async ({ taskId }, ctx) =>
    done(await tasks.transitionTask(ctx, taskId, "complete")),
    { progress: (ctx) => evaluateProgress(ctx) },
  );
}

export async function reopenTaskAction(input: unknown) {
  return runAction("task.reopen", taskIdSchema, input, async ({ taskId }, ctx) =>
    done(await tasks.transitionTask(ctx, taskId, "reopen")),
  );
}

export async function cancelTaskAction(input: unknown) {
  return runAction("task.cancel", taskIdSchema, input, async ({ taskId }, ctx) =>
    done(await tasks.transitionTask(ctx, taskId, "cancel")),
  );
}
