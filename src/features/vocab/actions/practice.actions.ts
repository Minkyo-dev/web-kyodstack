"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { createPracticeSchema, submitAnswerSchema } from "../schemas/practice.schema";
import { createPracticeSession, submitAttempt } from "../services/practice.service";

export async function createPracticeAction(input: unknown) {
  return runAction("vocab.practice.create", createPracticeSchema, input, async (data, ctx) => {
    const result = await createPracticeSession(ctx, data);
    revalidatePath("/english/practice");
    return result;
  });
}

// No revalidate: the session page keeps its attempts in client state.
export async function submitAnswerAction(input: unknown) {
  return runAction("vocab.practice.answer", submitAnswerSchema, input, (data, ctx) => submitAttempt(ctx, data.itemId, data.answer));
}
