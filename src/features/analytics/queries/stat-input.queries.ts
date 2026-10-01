import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { addLocalDays, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import type { StatInput } from "../domain/stats.types";

const LIMIT = 5000;
const CHUNK = 200;

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

type Log = { focus_score: number | null } | { focus_score: number | null }[] | null;
const logScore = (l: Log) => (Array.isArray(l) ? (l[0]?.focus_score ?? null) : (l?.focus_score ?? null));

/**
 * Raw rows for computeStats (D2 spec §1). Every query filters user_id explicitly, so this is
 * also correct under the service role in the nightly job.
 */
export async function loadStatInput(supabase: SupabaseServerClient, userId: string, now: Date): Promise<StatInput> {
  const { timezone, settings } = await getSchedulerContext(supabase, userId);
  const today = toLocalDate(now, timezone);
  // 42-day window plus 14 days so Recovery events at the window start can still resolve/expire.
  const windowStart = localDayRange(addLocalDays(today, -56, timezone), timezone).start;
  const since28 = localDayRange(addLocalDays(today, -28, timezone), timezone).start;

  const [blocks, sessions, tasks, domains, firstTask, completed] = await Promise.all([
    supabase
      .from("schedule_blocks")
      .select("id, task_id, starts_at, ends_at, status, created_at, updated_at")
      .eq("user_id", userId)
      .gte("ends_at", windowStart)
      .limit(LIMIT),
    supabase
      .from("work_sessions")
      .select(
        "id, task_id, schedule_block_id, started_at, ended_at, pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at), work_log:work_logs!work_logs_session_id_user_id_fkey(focus_score)",
      )
      .eq("user_id", userId)
      .or(`ended_at.gte.${windowStart},ended_at.is.null`)
      .limit(LIMIT),
    supabase.from("tasks").select("id, status, task_type, practice_domain_id").eq("user_id", userId).limit(LIMIT),
    supabase.from("practice_domains").select("id, name, parent_id").eq("user_id", userId),
    supabase.from("tasks").select("created_at").eq("user_id", userId).order("created_at").limit(1).maybeSingle(),
    supabase
      .from("tasks")
      .select("id, task_type, user_estimated_minutes, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", since28)
      .limit(LIMIT),
  ]);
  for (const r of [blocks, sessions, tasks, domains, firstTask, completed]) if (r.error) throw fromDbError(r.error);

  // Revisions of the loaded blocks.
  const blockIds = blocks.data!.map((b) => b.id);
  const revisions: StatInput["revisions"] = [];
  for (const ids of chunks(blockIds)) {
    const r = await supabase
      .from("schedule_block_revisions")
      .select("schedule_block_id, change_type, previous_starts_at, new_starts_at, created_at")
      .eq("user_id", userId)
      .in("schedule_block_id", ids);
    if (r.error) throw fromDbError(r.error);
    for (const x of r.data) revisions.push({ ...x, block_id: x.schedule_block_id });
  }

  // Calibration inputs for recently completed tasks: actual (view), first session start, all their blocks.
  const doneIds = completed.data!.map((t) => t.id);
  const actual = new Map<string, number>();
  const firstStart = new Map<string, string>();
  const planBlocks = new Map<string, StatInput["calibration"][number]["planBlocks"]>();
  const blocked = new Set<string>();
  for (const ids of chunks(doneIds)) {
    const [pa, ss, bs, wl] = await Promise.all([
      supabase.from("task_plan_actual").select("task_id, actual_minutes").eq("user_id", userId).in("task_id", ids),
      supabase.from("work_sessions").select("task_id, started_at").eq("user_id", userId).in("task_id", ids).order("started_at"),
      supabase
        .from("schedule_blocks")
        .select("task_id, starts_at, ends_at, status, created_at")
        .eq("user_id", userId)
        .in("task_id", ids),
      // User-confirmed external blockers weight Calibration (F1, stats-v2).
      supabase.from("work_logs").select("task_id").eq("user_id", userId).eq("confirmed_blocker", true).in("task_id", ids),
    ]);
    for (const r of [pa, ss, bs, wl]) if (r.error) throw fromDbError(r.error);
    for (const r of wl.data!) blocked.add(r.task_id);
    for (const r of pa.data!) if (r.task_id) actual.set(r.task_id, Number(r.actual_minutes ?? 0));
    for (const r of ss.data!) if (!firstStart.has(r.task_id)) firstStart.set(r.task_id, r.started_at);
    for (const r of bs.data!) planBlocks.set(r.task_id, [...(planBlocks.get(r.task_id) ?? []), r]);
  }

  // All-time focused minutes per domain (own, before roll-up).
  const domainTotals: Record<string, number> = {};
  const withDomain = tasks.data!.filter((t) => t.practice_domain_id);
  const domainOf = new Map(withDomain.map((t) => [t.id, t.practice_domain_id!]));
  for (const ids of chunks(withDomain.map((t) => t.id))) {
    const pa = await supabase.from("task_plan_actual").select("task_id, actual_minutes").eq("user_id", userId).in("task_id", ids);
    if (pa.error) throw fromDbError(pa.error);
    for (const r of pa.data) {
      const d = r.task_id ? domainOf.get(r.task_id) : undefined;
      if (d) domainTotals[d] = (domainTotals[d] ?? 0) + Number(r.actual_minutes ?? 0);
    }
  }

  return {
    now: now.toISOString(),
    timezone,
    settings: {
      planned_work_days: settings.planned_work_days,
      min_meaningful_minutes: settings.min_meaningful_minutes,
      commit_lead_minutes: settings.commit_lead_minutes,
    },
    firstActivityDate: firstTask.data ? toLocalDate(firstTask.data.created_at, timezone) : null,
    blocks: blocks.data!,
    revisions,
    sessions: sessions.data!.map((s) => ({
      id: s.id,
      task_id: s.task_id,
      schedule_block_id: s.schedule_block_id,
      started_at: s.started_at,
      ended_at: s.ended_at,
      pauses: s.pauses ?? [],
      focus_score: logScore(s.work_log as Log),
    })),
    tasks: tasks.data!,
    calibration: completed.data!
      .filter((t) => t.completed_at)
      .map((t) => ({
        task_id: t.id,
        task_type: t.task_type,
        completed_at: t.completed_at!,
        estimate: t.user_estimated_minutes,
        firstSessionStart: firstStart.get(t.id) ?? null,
        actualMinutes: actual.get(t.id) ?? 0,
        planBlocks: planBlocks.get(t.id) ?? [],
        blocker: blocked.has(t.id),
      })),
    domains: domains.data!,
    domainTotals,
  };
}
