"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { clearChat, sendChatMessage } from "../services/chat.service";
import { chatMessageSchema, emptySchema } from "../schemas/proposal.schema";

const done = <T>(value: T) => {
  revalidatePath("/scheduler", "layout");
  return value;
};

/** One chat turn (ADR 0042). The owner's message is kept even when the AI call fails. */
export async function sendChatMessageAction(input: unknown) {
  return runAction("assistant.chat.send", chatMessageSchema, input, async (d, ctx) => {
    try {
      await sendChatMessage(ctx, d.message);
    } finally {
      revalidatePath("/scheduler", "layout");
    }
  });
}
export async function clearChatAction(input: unknown = {}) {
  return runAction("assistant.chat.clear", emptySchema, input, async (_d, ctx) => done(await clearChat(ctx)));
}
