import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { SchedulerSettings } from "@/features/scheduler/domain/task.types";
import type { Json } from "@/types/database";
import { decideClaim } from "../utils/claim";

export type JobName = "daily_planner" | "weekly_review" | "duration_profile_refresh";

export type JobUser = { id: string; email: string | null; timezone: string; settings: SchedulerSettings };

export type JobOutcome = { status: "succeeded" | "skipped"; detail?: { [key: string]: Json } };

export type JobSummary = {
  job: JobName;
  considered: number;
  notDue: number;
  alreadyDone: number;
  succeeded: number;
  skipped: number;
  failed: number;
};


/** All users with their timezone and scheduler settings, read with the service role. */
export async function loadJobUsers(admin: SupabaseServerClient): Promise<JobUser[]> {
  const [profiles, settings] = await Promise.all([
    admin.from("profiles").select("id, email, timezone"),
    admin
      .from("scheduler_settings")
      .select(
        "user_id, week_starts_on, workday_start, workday_end, slot_minutes, min_block_minutes, max_focus_block_minutes, auto_schedule_mode, show_actual_default, planned_work_days, min_meaningful_minutes, commit_lead_minutes",
      ),
  ]);
  if (profiles.error) throw fromDbError(profiles.error);
  if (settings.error) throw fromDbError(settings.error);
  const byUser = new Map(settings.data.map((s) => [s.user_id, s]));
  return profiles.data.flatMap((p) => {
    const s = byUser.get(p.id);
    if (!s) return [];
    const { user_id: _ignored, ...rest } = s;
    void _ignored;
    return [{ id: p.id, email: p.email, timezone: p.timezone, settings: rest }];
  });
}

type Claim = { id: string; attempts: number } | null;

/**
 * Claim (job, user, runKey) in the ledger. Returns null when it already ran, is running,
 * or has exhausted its retries. Safe under duplicate or concurrent invocations (spec §47).
 */
async function claim(admin: SupabaseServerClient, job: JobName, userId: string, runKey: string, now: Date): Promise<Claim> {
  const existing = await admin
    .from("job_runs")
    .select("id, status, attempts, started_at")
    .eq("job_name", job)
    .eq("user_id", userId)
    .eq("run_key", runKey)
    .maybeSingle();
  if (existing.error) throw fromDbError(existing.error);

  if (!existing.data) {
    const ins = await admin
      .from("job_runs")
      .insert({ job_name: job, user_id: userId, run_key: runKey, status: "running", started_at: now.toISOString() })
      .select("id, attempts")
      .single();
    if (ins.error) {
      if (ins.error.code === "23505") return null; // another invocation claimed it first
      throw fromDbError(ins.error);
    }
    return ins.data;
  }

  const row = existing.data;
  if (decideClaim(row, now) !== "retry") return null;

  // Retry a failed or stale run. The status guard makes concurrent retries claim at most once.
  const upd = await admin
    .from("job_runs")
    .update({ status: "running", attempts: row.attempts + 1, started_at: now.toISOString(), finished_at: null, error_code: null })
    .eq("id", row.id)
    .eq("status", row.status)
    .eq("attempts", row.attempts)
    .select("id, attempts")
    .maybeSingle();
  if (upd.error) throw fromDbError(upd.error);
  return upd.data;
}

/**
 * Run a job for every user whose local time makes it due (spec §45-§48).
 * `due` returns the run key (e.g. the local date), or null when it's not time yet.
 * One user's failure never stops the others.
 */
export async function runJob(
  job: JobName,
  admin: SupabaseServerClient,
  now: Date,
  due: (user: JobUser) => string | null,
  handle: (ctx: ActionContext, user: JobUser, runKey: string) => Promise<JobOutcome>,
): Promise<JobSummary> {
  const summary: JobSummary = { job, considered: 0, notDue: 0, alreadyDone: 0, succeeded: 0, skipped: 0, failed: 0 };
  const users = await loadJobUsers(admin);

  for (const user of users) {
    summary.considered += 1;
    const runKey = due(user);
    if (!runKey) {
      summary.notDue += 1;
      continue;
    }
    const claimed = await claim(admin, job, user.id, runKey, now);
    if (!claimed) {
      summary.alreadyDone += 1;
      continue;
    }

    const startedAt = Date.now();
    const ctx: ActionContext = { user: { id: user.id, email: user.email }, supabase: admin };
    try {
      const outcome = await handle(ctx, user, runKey);
      await admin
        .from("job_runs")
        .update({ status: outcome.status, finished_at: new Date().toISOString(), detail: outcome.detail ?? null })
        .eq("id", claimed.id);
      summary[outcome.status] += 1;
      log({ action: `job.${job}`, userId: user.id, entityId: runKey, success: true, durationMs: Date.now() - startedAt, detail: outcome.status });
    } catch (error) {
      const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
      await admin
        .from("job_runs")
        .update({ status: "failed", finished_at: new Date().toISOString(), error_code: code })
        .eq("id", claimed.id);
      summary.failed += 1;
      log({
        action: `job.${job}`,
        userId: user.id,
        entityId: runKey,
        success: false,
        errorCode: code,
        durationMs: Date.now() - startedAt,
        detail: error instanceof AppError ? undefined : String(error),
      });
    }
  }
  log({ action: `job.${job}.summary`, success: summary.failed === 0, detail: summary });
  return summary;
}
