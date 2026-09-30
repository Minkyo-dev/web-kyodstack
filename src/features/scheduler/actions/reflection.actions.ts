"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { upsertDailyReflection } from "../services/reflection.service";
import { upsertReflectionSchema } from "../schemas/reflection.schema";

export async function upsertDailyReflectionAction(input: unknown) {
  return runAction("reflection.upsert", upsertReflectionSchema, input, async (data, ctx) => {
    const result = await upsertDailyReflection(ctx, data);
    revalidatePath("/scheduler", "layout");
    return result;
  });
}
