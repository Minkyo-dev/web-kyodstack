"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { noInputSchema } from "../schemas/setup.schema";
import { updateWordSchema, wordIdSchema, wordInputSchema } from "../schemas/word.schema";
import { reconcile } from "../services/sync.service";
import { createWord, deleteWord, updateWord } from "../services/word.service";

const refreshEnglish = () => revalidatePath("/english", "layout");

export async function createWordAction(input: unknown) {
  return runAction("vocab.word.create", wordInputSchema, input, async (data, ctx) => {
    const result = await createWord(ctx, data);
    refreshEnglish();
    return result;
  });
}

export async function updateWordAction(input: unknown) {
  return runAction("vocab.word.update", updateWordSchema, input, async (data, ctx) => {
    await updateWord(ctx, data.id, data.patch);
    refreshEnglish();
  });
}

export async function deleteWordAction(input: unknown) {
  return runAction("vocab.word.delete", wordIdSchema, input, async (data, ctx) => {
    await deleteWord(ctx, data.id);
    refreshEnglish();
  });
}

/** [지금 동기화]: a full reconcile, so deletions in Notion show up too. */
export async function syncNowAction(input: unknown) {
  return runAction("vocab.sync.now", noInputSchema, input, async (_data, ctx) => {
    const result = await reconcile(ctx);
    refreshEnglish();
    return result;
  });
}
