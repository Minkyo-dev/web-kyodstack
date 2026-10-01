"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as projects from "../services/project.service";
import {
  createMilestoneSchema,
  createProjectSchema,
  setProjectArchivedSchema,
  updateMilestoneSchema,
  updateProjectSchema,
} from "../schemas/project.schema";

const done = <T>(value: T) => {
  revalidatePath("/scheduler", "layout");
  return value;
};

export async function createProjectAction(input: unknown) {
  return runAction("project.create", createProjectSchema, input, async (data, ctx) =>
    done(await projects.createProject(ctx, data)),
  );
}

export async function updateProjectAction(input: unknown) {
  return runAction("project.update", updateProjectSchema, input, async (data, ctx) =>
    done(await projects.updateProject(ctx, data)),
  );
}

export async function setProjectArchivedAction(input: unknown) {
  return runAction("project.archive", setProjectArchivedSchema, input, async (data, ctx) =>
    done(await projects.setProjectArchived(ctx, data)),
  );
}

export async function createMilestoneAction(input: unknown) {
  return runAction("milestone.create", createMilestoneSchema, input, async (data, ctx) =>
    done(await projects.createMilestone(ctx, data)),
  );
}

export async function updateMilestoneAction(input: unknown) {
  return runAction("milestone.update", updateMilestoneSchema, input, async (data, ctx) =>
    done(await projects.updateMilestone(ctx, data)),
  );
}
