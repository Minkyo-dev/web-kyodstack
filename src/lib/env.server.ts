import "server-only";
import { z } from "zod";

// Server-only secrets. All optional until the phase that needs them (see docs/progress.md).
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  /** "gemini" (default, ADR 0041), "anthropic", or "fake" (tests; refused in production). */
  AI_PROVIDER: z.enum(["gemini", "anthropic", "fake"]).optional(),
  /** Google AI Studio key for Gemini. */
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** Gemini model id; default `gemini-3.8-flash`. */
  GEMINI_MODEL: z.string().min(1).optional(),
  /** Tried once on 429/503 from the primary model; default `gemini-3.5-flash-lite`. */
  GEMINI_FALLBACK_MODEL: z.string().min(1).optional(),
  /** Anthropic key and model, used only with AI_PROVIDER=anthropic. */
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  INTERNAL_JOB_SECRET: z.string().min(16).optional(),
  /** Web push keys and contact (ADR 0043). The public key reaches the browser through the settings action. */
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(),
  /** Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; either secret authorizes jobs. */
  CRON_SECRET: z.string().min(16).optional(),
});

export const serverEnv = serverSchema.parse(process.env);
