import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { AiProvider, StructuredRequest, StructuredResult } from "../services/provider";

const EFFORT: Record<NonNullable<StructuredRequest<unknown>["effort"]>, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** Zod → JSON Schema for `responseJsonSchema`; the `$schema` key is not part of what Gemini accepts. */
function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Overload / rate limit: worth one more try on another model (quotas are per model). */
const RETRY_ON_OTHER_MODEL = new Set([429, 503]);

/**
 * Gemini (Google AI Studio) via the official SDK with JSON-schema structured output (ADR 0041). The SDK retries
 * transient errors; if the primary model is still overloaded or over quota, the fallback model is tried once. The
 * text is parsed and validated against the Zod schema here (spec §31): a block, truncation or invalid output never
 * reaches the DB.
 */
export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly fallbackModel: string | null = null,
  ) {
    this.client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 120_000, retryOptions: { attempts: 3, initialDelay: 2, maxDelay: 10 } } });
  }

  private call(model: string, req: StructuredRequest<unknown>) {
    return this.client.models.generateContent({
      model,
      contents: req.prompt,
      config: {
        systemInstruction: req.system,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchemaOf(req.schema),
        maxOutputTokens: 16000,
        thinkingConfig: { thinkingLevel: EFFORT[req.effort ?? "medium"] },
      },
    });
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const startedAt = Date.now();
    let response;
    try {
      try {
        response = await this.call(this.model, req);
      } catch (error) {
        if (!(this.fallbackModel && error instanceof ApiError && RETRY_ON_OTHER_MODEL.has(error.status))) throw error;
        log({ action: `ai.${req.task}`, success: false, errorCode: "AI_PROVIDER_ERROR", detail: `status ${error.status} on ${this.model}; trying ${this.fallbackModel}` });
        response = await this.call(this.fallbackModel, req);
      }
    } catch (error) {
      log({
        action: `ai.${req.task}`,
        success: false,
        errorCode: "AI_PROVIDER_ERROR",
        durationMs: Date.now() - startedAt,
        // API error messages carry no secrets and explain causes such as quota or invalid params.
        detail: error instanceof ApiError ? `status ${error.status}: ${error.message}` : String(error),
      });
      throw new AppError("AI_PROVIDER_ERROR");
    }

    const candidate = response.candidates?.[0];
    if (response.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
      log({ action: `ai.${req.task}`, success: false, errorCode: "AI_PROVIDER_ERROR", detail: response.promptFeedback?.blockReason ?? candidate?.finishReason });
      throw new AppError("AI_PROVIDER_ERROR", "AI가 이 요청을 처리하지 않았습니다. 다시 시도해 주세요.");
    }
    const text = response.text;
    if (candidate?.finishReason === "MAX_TOKENS" || !text) {
      log({ action: `ai.${req.task}`, success: false, errorCode: "AI_OUTPUT_INVALID", detail: candidate?.finishReason ?? "empty" });
      throw new AppError("AI_OUTPUT_INVALID");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      log({ action: `ai.${req.task}`, success: false, errorCode: "AI_OUTPUT_INVALID", detail: "json" });
      throw new AppError("AI_OUTPUT_INVALID");
    }
    const checked = req.schema.safeParse(parsed);
    if (!checked.success) {
      log({ action: `ai.${req.task}`, success: false, errorCode: "AI_OUTPUT_INVALID", detail: "schema" });
      throw new AppError("AI_OUTPUT_INVALID");
    }

    const model = response.modelVersion ?? this.model;
    log({
      action: `ai.${req.task}`,
      success: true,
      durationMs: Date.now() - startedAt,
      detail: {
        model,
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      },
    });
    return { data: checked.data, provider: this.name, model };
  }
}
