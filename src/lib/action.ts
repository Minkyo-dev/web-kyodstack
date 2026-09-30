import "server-only";
import { z } from "zod";
import { requireUser, type AuthUser } from "@/lib/auth";
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server";
import { AppError, fail, ok, type ActionResult } from "@/lib/errors";
import { log } from "@/lib/logger";

export type ActionContext = { user: AuthUser; supabase: SupabaseServerClient };

/**
 * Server Action pipeline (spec §6.3): Zod-validate → authenticate → run service →
 * typed result. Raw errors are logged server-side and never returned.
 */
export async function runAction<S extends z.ZodType, T>(
  action: string,
  schema: S,
  input: unknown,
  handler: (data: z.infer<S>, ctx: ActionContext) => Promise<T>,
): Promise<ActionResult<T>> {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        undefined,
        z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      );
    }
    const user = await requireUser();
    userId = user.id;
    const supabase = await createClient();
    const data = await handler(parsed.data, { user, supabase });
    log({ action, userId, success: true, durationMs: Date.now() - startedAt });
    return ok(data);
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError("INTERNAL_ERROR");
    log({
      action,
      userId,
      success: false,
      errorCode: appError.code,
      durationMs: Date.now() - startedAt,
      detail: error instanceof AppError ? undefined : String(error),
    });
    return fail(appError);
  }
}
