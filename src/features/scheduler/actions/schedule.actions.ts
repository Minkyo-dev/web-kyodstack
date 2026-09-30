"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as scheduling from "../services/scheduling.service";
import {
  blockIdSchema,
  createTaskInRangeSchema,
  moveBlockSchema,
  rescheduleBlockSchema,
  scheduleTaskSchema,
  setBlockStatusSchema,
  updateSchedulerSettingsSchema,
} from "../schemas/schedule.schema";

const done = <T>(value: T) => {
  revalidatePath("/scheduler", "layout");
  return value;
};

export async function scheduleTaskAction(input: unknown) {
  return runAction("schedule.create", scheduleTaskSchema, input, async (data, ctx) =>
    done(await scheduling.scheduleTask(ctx, data)),
  );
}

export async function moveScheduleBlockAction(input: unknown) {
  return runAction("schedule.move", moveBlockSchema, input, async (data, ctx) =>
    done(await scheduling.moveBlock(ctx, data)),
  );
}

export async function setScheduleBlockStatusAction(input: unknown) {
  return runAction("schedule.status", setBlockStatusSchema, input, async (data, ctx) =>
    done(await scheduling.setBlockStatus(ctx, data)),
  );
}

export async function createTaskInRangeAction(input: unknown) {
  return runAction("schedule.createInRange", createTaskInRangeSchema, input, async (data, ctx) =>
    done(await scheduling.createTaskInRange(ctx, data)),
  );
}

export async function rescheduleBlockAction(input: unknown) {
  return runAction("schedule.reschedule", rescheduleBlockSchema, input, async (data, ctx) =>
    done(await scheduling.rescheduleBlock(ctx, data)),
  );
}

export async function unscheduleBlockAction(input: unknown) {
  return runAction("schedule.unschedule", blockIdSchema, input, async ({ blockId }, ctx) =>
    done(await scheduling.unscheduleBlock(ctx, blockId)),
  );
}

export async function updateSchedulerSettingsAction(input: unknown) {
  return runAction("scheduler.settings", updateSchedulerSettingsSchema, input, async (data, ctx) =>
    done(await scheduling.updateSchedulerSettings(ctx, data)),
  );
}
