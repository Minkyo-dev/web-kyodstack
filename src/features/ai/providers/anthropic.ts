import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { AiProvider, StructuredRequest, StructuredResult } from "../services/provider";

/**
 * Haiku 4.5 has no `effort` control and no server-side refusal fallback; sending either
 * would 400. Newer models get both.
 */
function supportsEffortAndFallback(model: string) {
  return !model.startsWith("claude-haiku-4-5");
}

/**
 * Claude via the official SDK with structured outputs. The response is parsed against the
 * Zod schema by the SDK and validated again here (spec §31). A refusal or unparseable
 * output never reaches the database.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const startedAt = Date.now();
    let response;
    try {
      const advanced = supportsEffortAndFallback(this.model);
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        // Server-side refusal fallback: routes a declined request to a suitable model.
        ...(advanced && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
        output_config: {
          ...(advanced && { effort: req.effort ?? "medium" }),
          format: betaZodOutputFormat(req.schema),
        },
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      });
    } catch (error) {
      log({
        action: `ai.${req.task}`,
        success: false,
        errorCode: "AI_PROVIDER_ERROR",
        durationMs: Date.now() - startedAt,
        // API error messages carry no secrets and explain causes such as billing or invalid params.
        detail: error instanceof Anthropic.APIError ? `status ${error.status}: ${error.message}` : String(error),
      });
      throw new AppError("AI_PROVIDER_ERROR");
    }

    if (response.stop_reason === "refusal") {
      log({ action: `ai.${req.task}`, success: false, errorCode: "AI_PROVIDER_ERROR", detail: "refusal" });
      throw new AppError("AI_PROVIDER_ERROR", "AI가 이 요청을 처리하지 않았습니다. 다시 시도해 주세요.");
    }
    if (response.stop_reason === "max_tokens" || response.parsed_output == null) {
      log({ action: `ai.${req.task}`, success: false, errorCode: "AI_OUTPUT_INVALID", detail: response.stop_reason });
      throw new AppError("AI_OUTPUT_INVALID");
    }

    const checked = req.schema.safeParse(response.parsed_output);
    if (!checked.success) {
      log({ action: `ai.${req.task}`, success: false, errorCode: "AI_OUTPUT_INVALID", detail: "schema" });
      throw new AppError("AI_OUTPUT_INVALID");
    }

    log({
      action: `ai.${req.task}`,
      success: true,
      durationMs: Date.now() - startedAt,
      detail: {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });
    return { data: checked.data, provider: this.name, model: response.model };
  }
}
