import "server-only";
import type { ActionContext } from "@/lib/action";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import {
  buildTemplateProfiles,
  toSample,
  type DurationSample,
  type StoredProfile,
} from "../utils/estimator";

/** Enough history for every complexity bucket to reach its 20 most recent samples. */
const CANDIDATE_LIMIT = 200;

export async function loadDurationProfiles(supabase: SupabaseServerClient): Promise<StoredProfile[]> {
  const { data, error } = await supabase
    .from("task_duration_profiles")
    .select("task_template_id, complexity_bucket, sample_count, recommended_correction_factor, median_plan_actual_ratio");
  if (error) throw fromDbError(error);
  return data.map((p) => ({
    ...p,
    recommended_correction_factor:
      p.recommended_correction_factor === null ? null : Number(p.recommended_correction_factor),
    median_plan_actual_ratio: p.median_plan_actual_ratio === null ? null : Number(p.median_plan_actual_ratio),
  }));
}

async function loadSamples(ctx: ActionContext, templateId: string): Promise<DurationSample[]> {
  const [template, rows] = await Promise.all([
    ctx.supabase
      .from("task_templates")
      .select("default_estimate_minutes")
      .eq("id", templateId)
      .eq("user_id", ctx.user.id)
      .maybeSingle(),
    ctx.supabase
      .from("task_plan_actual")
      .select("actual_minutes, user_estimated_minutes, complexity, completed_at")
      .eq("user_id", ctx.user.id)
      .eq("template_id", templateId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(CANDIDATE_LIMIT),
  ]);
  if (template.error) throw fromDbError(template.error);
  if (rows.error) throw fromDbError(rows.error);
  if (!template.data) return [];

  const samples: DurationSample[] = [];
  for (const r of rows.data) {
    const s = toSample({
      actualMinutes: Number(r.actual_minutes ?? 0),
      userEstimatedMinutes: r.user_estimated_minutes,
      templateDefaultMinutes: template.data.default_estimate_minutes,
      complexity: r.complexity ?? 3,
      completedAt: r.completed_at,
    });
    if (s) samples.push(s);
  }
  return samples;
}

/**
 * Recompute one template's profile rows from history (spec §61). The table is a cache:
 * rows are replaced wholesale, and buckets that lost all samples are deleted.
 */
export async function refreshTemplateProfile(ctx: ActionContext, templateId: string): Promise<void> {
  const samples = await loadSamples(ctx, templateId);
  const computed = buildTemplateProfiles(samples);
  const now = new Date().toISOString();

  const rows = [...computed.entries()].map(([bucket, p]) => ({
    user_id: ctx.user.id,
    task_template_id: templateId,
    complexity_bucket: bucket,
    sample_count: p.sampleCount,
    median_actual_minutes: p.medianActualMinutes,
    p75_actual_minutes: p.p75ActualMinutes,
    median_plan_actual_ratio: p.medianPlanActualRatio,
    ewma_plan_actual_ratio: p.ewmaPlanActualRatio,
    recommended_correction_factor: p.recommendedCorrectionFactor,
    calculated_at: now,
  }));

  if (rows.length > 0) {
    const up = await ctx.supabase
      .from("task_duration_profiles")
      .upsert(rows, { onConflict: "user_id,task_template_id,complexity_bucket" });
    if (up.error) throw fromDbError(up.error);
  }

  let stale = ctx.supabase
    .from("task_duration_profiles")
    .delete()
    .eq("user_id", ctx.user.id)
    .eq("task_template_id", templateId);
  if (rows.length > 0) stale = stale.not("complexity_bucket", "in", `(${[...computed.keys()].join(",")})`);
  const del = await stale;
  if (del.error) throw fromDbError(del.error);
}

/**
 * Best-effort refresh after a mutation that changes history. The primary write has
 * already succeeded and must not fail because of the derived cache (spec §56), so
 * errors are logged and the next refresh or a rebuild fixes the cache.
 */
export async function refreshProfilesQuietly(
  ctx: ActionContext,
  templateIds: (string | null | undefined)[],
): Promise<void> {
  for (const id of new Set(templateIds.filter((x): x is string => Boolean(x)))) {
    try {
      await refreshTemplateProfile(ctx, id);
    } catch (error) {
      log({
        action: "duration_profile.refresh",
        userId: ctx.user.id,
        entityType: "task_template",
        entityId: id,
        success: false,
        errorCode: "DATABASE_ERROR",
        detail: String(error),
      });
    }
  }
}
