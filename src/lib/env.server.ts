import "server-only";
import { z } from "zod";

// Server-only secrets. All optional until the phase that needs them (see docs/progress.md).
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  /** "anthropic" (default when a key is set) or "fake" (tests; refused in production). */
  AI_PROVIDER: z.enum(["anthropic", "fake"]).optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  INTERNAL_JOB_SECRET: z.string().min(16).optional(),
  /** Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; either secret authorizes jobs. */
  CRON_SECRET: z.string().min(16).optional(),
});

export const serverEnv = serverSchema.parse(process.env);
