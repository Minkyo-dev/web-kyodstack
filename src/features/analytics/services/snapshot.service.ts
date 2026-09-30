import "server-only";
import type { ActionContext } from "@/lib/action";
import { fromDbError } from "@/lib/errors";
import { addLocalDays, toLocalDate } from "@/features/scheduler/utils/timezone";
import type { StatType, StatValue } from "../domain/stats.types";
import { loadStatInput } from "../queries/stat-input.queries";
import { computeStats } from "../utils/stats";

/**
 * Nightly snapshot for trends (D2 spec §1). Job-only: stat_snapshots is written by the service role,
 * and upserting on (user, day, stat, scope) makes re-runs harmless.
 */
export async function writeDailySnapshot(ctx: ActionContext, now: Date): Promise<number> {
  const input = await loadStatInput(ctx.supabase, ctx.user.id, now);
  const s = computeStats(input);
  const day = toLocalDate(input.now, input.timezone);
  const w28 = addLocalDays(day, -28, input.timezone);
  const w42 = addLocalDays(day, -42, input.timezone);
  const row = (
    stat_type: StatType,
    v: StatValue,
    window_start: string,
    extra: { bias?: number | null; typical_error?: number | null; scope?: string } = {},
  ) => ({
    user_id: ctx.user.id,
    computed_on: day,
    stat_type,
    scope: extra.scope ?? "overall",
    value: v.value,
    bias: extra.bias ?? null,
    typical_error: extra.typical_error ?? null,
    sample_count: v.sampleCount,
    window_start,
    window_end: day,
    formula_version: s.version,
  });
  const rows = [
    row("calibration", s.calibration, w28, { bias: s.calibration.bias, typical_error: s.calibration.typicalError }),
    row("reliability", s.reliability, w28),
    row("consistency", s.consistency, w42),
    row("recovery", s.recovery, w42),
    ...Object.entries(s.calibration.byType)
      .filter(([, v]) => v && v.value !== null)
      .map(([type, v]) => row("calibration", v!, w28, { scope: type, bias: v!.bias })),
  ];
  const { error } = await ctx.supabase
    .from("stat_snapshots")
    .upsert(rows, { onConflict: "user_id,computed_on,stat_type,scope" });
  if (error) throw fromDbError(error);
  return rows.length;
}
