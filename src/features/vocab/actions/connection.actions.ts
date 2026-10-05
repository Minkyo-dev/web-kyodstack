"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { createDatabaseSchema, noInputSchema } from "../schemas/setup.schema";
import { disconnectNotion, forgetDatabase } from "../services/connection.service";
import { createVocabDatabase, repairSchema } from "../services/setup.service";

const refreshEnglish = () => revalidatePath("/english", "layout");

export async function createVocabDatabaseAction(input: unknown) {
  return runAction("vocab.setup.create_db", createDatabaseSchema, input, async (data, ctx) => {
    const result = await createVocabDatabase(ctx, data.parentPageId);
    refreshEnglish();
    return result;
  });
}

export async function repairSchemaAction(input: unknown) {
  return runAction("vocab.setup.repair_schema", noInputSchema, input, async (_data, ctx) => {
    const result = await repairSchema(ctx);
    refreshEnglish();
    return result;
  });
}

export async function forgetDatabaseAction(input: unknown) {
  return runAction("vocab.setup.forget_db", noInputSchema, input, async (_data, ctx) => {
    await forgetDatabase(ctx);
    refreshEnglish();
  });
}

export async function disconnectNotionAction(input: unknown) {
  return runAction("vocab.connection.disconnect", noInputSchema, input, async (_data, ctx) => {
    await disconnectNotion(ctx);
    refreshEnglish();
  });
}
