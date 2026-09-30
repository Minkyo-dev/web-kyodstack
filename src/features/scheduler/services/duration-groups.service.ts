import "server-only";
import type { ActionContext } from "@/lib/action";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { buildGroupSamples, groupKeysFor, toGroupSample, type DurationGroup, type GroupSample } from "../utils/estimator";

/** Bounded rebuild input: the most recent completed tasks. */
const CANDIDATE_LIMIT = 500;

export async function loadDurationGroups(supabase: SupabaseServerClient, userId: string): Promise<DurationGroup[]> {
  const { data, error } = await supabase
    .from("duration_groups")
    .select("group_key, samples, sample_count")
    .eq("user_id", userId);
  if (error) throw fromDbError(error);
  return data.map((g) => ({ ...g, samples: (g.samples ?? []) as GroupSample[] }));
}

/** Rebuild all groups of one user from source data (derived, rebuildable). */
export async function rebuildDurationGroups(ctx: ActionContext): Promise<number> {
  const uid = ctx.user.id;
  const [tasks, pa] = await Promise.all([
    ctx.supabase
      .from("tasks")
      .select(
        "id, task_type, practice_domain_id, user_estimated_minutes, completed_at, template:task_templates!tasks_template_id_user_id_fkey(default_estimate_minutes), tags:task_tags!task_tags_task_id_user_id_fkey(tag_id)",
      )
      .eq("user_id", uid)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(CANDIDATE_LIMIT),
    ctx.supabase
      .from("task_plan_actual")
      .select("task_id, actual_minutes")
      .eq("user_id", uid)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(CANDIDATE_LIMIT),
  ]);
  if (tasks.error) throw fromDbError(tasks.error);
  if (pa.error) throw fromDbError(pa.error);
  const actual = new Map(pa.data.map((r) => [r.task_id, Number(r.actual_minutes ?? 0)]));

  const buckets = new Map<string, GroupSample[]>();
  for (const t of tasks.data) {
    const sample = toGroupSample({
      actualMinutes: actual.get(t.id) ?? 0,
      userEstimatedMinutes: t.user_estimated_minutes,
      templateDefaultMinutes: t.template?.default_estimate_minutes ?? null,
      completedAt: t.completed_at,
    });
    if (!sample) continue;
    const keys = groupKeysFor({
      task_type: t.task_type,
      practice_domain_id: t.practice_domain_id,
      tags: (t.tags ?? []).map((x) => ({ id: x.tag_id, name: "" })),
    });
    for (const k of keys) buckets.set(k, [...(buckets.get(k) ?? []), sample]);
  }

  const now = new Date().toISOString();
  const rows = [...buckets.entries()].map(([group_key, samples]) => {
    const kept = buildGroupSamples(samples);
    return { user_id: uid, group_key, samples: kept, sample_count: kept.length, updated_at: now };
  });
  if (rows.length > 0) {
    const up = await ctx.supabase.from("duration_groups").upsert(rows, { onConflict: "user_id,group_key" });
    if (up.error) throw fromDbError(up.error);
  }
  let stale = ctx.supabase.from("duration_groups").delete().eq("user_id", uid);
  if (rows.length > 0) stale = stale.lt("updated_at", now);
  const del = await stale;
  if (del.error) throw fromDbError(del.error);
  return rows.length;
}

/** Best-effort: the primary write already succeeded (spec §56). */
export async function rebuildDurationGroupsQuietly(ctx: ActionContext): Promise<void> {
  try {
    await rebuildDurationGroups(ctx);
  } catch (error) {
    log({ action: "duration_groups.rebuild", userId: ctx.user.id, success: false, errorCode: "DATABASE_ERROR", detail: String(error) });
  }
}
