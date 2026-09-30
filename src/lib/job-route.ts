import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { safeEqual } from "@/features/jobs/utils/job-window";

/**
 * Internal job endpoint (spec §43.6): requires `Authorization: Bearer <secret>` where the
 * secret is CRON_SECRET (Vercel Cron) or INTERNAL_JOB_SECRET. With no secret configured,
 * jobs refuse to run at all.
 */
export async function runJobRoute(
  request: Request,
  name: string,
  job: (admin: SupabaseServerClient) => Promise<unknown>,
): Promise<NextResponse> {
  const secrets = [serverEnv.CRON_SECRET, serverEnv.INTERNAL_JOB_SECRET].filter((s): s is string => Boolean(s));
  if (secrets.length === 0) {
    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR", message: "Job secret not configured." }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secrets.some((s) => safeEqual(s, token))) {
    log({ action: `job.${name}.auth`, success: false, errorCode: "AUTH_REQUIRED" });
    return NextResponse.json({ ok: false, code: "AUTH_REQUIRED", message: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await job(createAdminClient());
    return NextResponse.json({ ok: true, data: summary });
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    log({ action: `job.${name}`, success: false, errorCode: code, detail: error instanceof AppError ? error.message : String(error) });
    return NextResponse.json({ ok: false, code, message: "Job failed." }, { status: 500 });
  }
}
