import "server-only";
import type { z } from "zod";
import { serverEnv } from "@/lib/env.server";
import { AppError } from "@/lib/errors";

/**
 * Vendor-neutral AI boundary (spec §30). Domain services depend only on this
 * interface; swapping Anthropic for another vendor touches providers/ only.
 */
export type StructuredRequest<T> = {
  /** Short label for logs, e.g. "weekly_review". Never log prompt content. */
  task: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  effort?: "low" | "medium" | "high";
};

export type StructuredResult<T> = {
  data: T;
  provider: string;
  /** Model that actually served the request (may differ after a fallback). */
  model: string;
};

export interface AiProvider {
  readonly name: string;
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** Tried once when the primary model is overloaded or over quota (ADR 0041). */
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite";

export async function getAiProvider(): Promise<AiProvider> {
  const kind = serverEnv.AI_PROVIDER ?? "gemini";
  if (kind === "fake") {
    if (process.env.NODE_ENV === "production") {
      throw new AppError("AI_PROVIDER_ERROR", "AI 제공자 설정이 올바르지 않습니다.");
    }
    const { FakeProvider } = await import("../providers/fake");
    return new FakeProvider();
  }
  if (kind === "gemini") {
    if (!serverEnv.GEMINI_API_KEY) throw new AppError("AI_PROVIDER_ERROR", "AI API 키가 설정되지 않았습니다.");
    const { GeminiProvider } = await import("../providers/gemini");
    return new GeminiProvider(
      serverEnv.GEMINI_API_KEY,
      serverEnv.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
      serverEnv.GEMINI_FALLBACK_MODEL ?? DEFAULT_GEMINI_FALLBACK_MODEL,
    );
  }
  if (!serverEnv.AI_API_KEY) {
    throw new AppError("AI_PROVIDER_ERROR", "AI API 키가 설정되지 않았습니다.");
  }
  const { AnthropicProvider } = await import("../providers/anthropic");
  return new AnthropicProvider(serverEnv.AI_API_KEY, serverEnv.AI_MODEL ?? "claude-haiku-4-5-20251001");
}
