import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ActionContext } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { AppError, fail, ok, type ErrorCode } from "@/lib/errors";
import { log } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const STATUS: Partial<Record<ErrorCode, number>> = {
  AUTH_REQUIRED: 401,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  AI_PROVIDER_ERROR: 502,
  AI_OUTPUT_INVALID: 502,
};

/** Route Handler counterpart of runAction: same pipeline, JSON over HTTP. */
export async function runRoute<S extends z.ZodType, T>(
  action: string,
  request: Request,
  schema: S,
  handler: (data: z.infer<S>, ctx: ActionContext) => Promise<T>,
): Promise<NextResponse> {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const user = await requireUser();
    userId = user.id;
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR");
    const supabase = await createClient();
    const data = await handler(parsed.data, { user, supabase });
    log({ action, userId, success: true, durationMs: Date.now() - startedAt });
    return NextResponse.json(ok(data));
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
    return NextResponse.json(fail(appError), { status: STATUS[appError.code] ?? 500 });
  }
}
