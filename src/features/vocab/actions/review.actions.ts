"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runAction } from "@/lib/action";
import { log } from "@/lib/logger";
import { noInputSchema } from "../schemas/setup.schema";
import { cardIdSchema, reviewSchema, setLearnedSchema, studySettingsSchema } from "../schemas/review.schema";
import { flushOutbox, retryStuckWritebacks } from "../services/outbox.service";
import { reviewCard, setLearned, tomorrowDueCount, undoReview } from "../services/review.service";
import { updateStudySettings } from "../services/settings.service";

// Ratings don't revalidate: the session keeps its own queue, and a re-render per card would be wasted work.
export async function reviewCardAction(input: unknown) {
  return runAction("vocab.review.rate", reviewSchema, input, (data, ctx) => reviewCard(ctx, data));
}

export async function undoReviewAction(input: unknown) {
  return runAction("vocab.review.undo", cardIdSchema, input, (data, ctx) => undoReview(ctx, data.cardId));
}

export async function setLearnedAction(input: unknown) {
  return runAction("vocab.word.learned", setLearnedSchema, input, async (data, ctx) => {
    await setLearned(ctx, data.wordId, data.learned);
    revalidatePath("/english", "layout");
  });
}

/** End of a session: tomorrow's count for the summary; the Notion write-backs go out after the response. */
export async function finishSessionAction(input: unknown) {
  return runAction("vocab.review.finish", noInputSchema, input, async (_data, ctx) => {
    after(() =>
      flushOutbox(ctx, 60).catch((error) => log({ action: "vocab.outbox.flush", userId: ctx.user.id, success: false, detail: String(error) })),
    );
    revalidatePath("/english", "layout");
    return { tomorrowDue: await tomorrowDueCount(ctx) };
  });
}

export async function updateStudySettingsAction(input: unknown) {
  return runAction("vocab.settings.study", studySettingsSchema, input, async (data, ctx) => {
    await updateStudySettings(ctx, data);
    revalidatePath("/english", "layout");
  });
}

export async function retryWritebacksAction(input: unknown) {
  return runAction("vocab.outbox.retry", noInputSchema, input, async (_data, ctx) => {
    await retryStuckWritebacks(ctx);
    after(() => flushOutbox(ctx, 60).catch(() => undefined));
    revalidatePath("/english", "layout");
  });
}
