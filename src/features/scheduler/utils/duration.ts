import { GENERIC_ESTIMATE_MINUTES } from "../domain/scheduler.constants";

export function roundUpToIncrement(minutes: number, increment: number): number {
  if (increment <= 0) throw new RangeError("increment must be positive");
  return Math.max(increment, Math.ceil(minutes / increment) * increment);
}

export type BaseEstimateSource = "user" | "template" | "generic";

/** Spec §26.2: user estimate → template default → generic fallback. */
export function resolveBaseEstimate(input: {
  userEstimatedMinutes: number | null;
  templateDefaultMinutes: number | null;
}): { minutes: number; source: BaseEstimateSource } {
  if (input.userEstimatedMinutes && input.userEstimatedMinutes > 0) {
    return { minutes: input.userEstimatedMinutes, source: "user" };
  }
  if (input.templateDefaultMinutes && input.templateDefaultMinutes > 0) {
    return { minutes: input.templateDefaultMinutes, source: "template" };
  }
  return { minutes: GENERIC_ESTIMATE_MINUTES, source: "generic" };
}

export type BlockDurationSettings = {
  slot_minutes: number;
  min_block_minutes: number;
  max_focus_block_minutes: number;
};

/**
 * Length of the block created when a task is dropped on the calendar (spec §27).
 * `correctionFactor` comes from the learned duration profile (Phase 3); 1 until then.
 * The result is rounded up to the slot increment and clamped to
 * [min_block_minutes, max_focus_block_minutes] (ADR 0006). A longer task is split
 * across several blocks.
 */
export function recommendBlockMinutes(
  baseMinutes: number,
  settings: BlockDurationSettings,
  correctionFactor = 1,
): number {
  const raw = roundUpToIncrement(baseMinutes * correctionFactor, settings.slot_minutes);
  const min = roundUpToIncrement(settings.min_block_minutes, settings.slot_minutes);
  const max = Math.max(
    min,
    Math.floor(settings.max_focus_block_minutes / settings.slot_minutes) * settings.slot_minutes,
  );
  return Math.min(max, Math.max(min, raw));
}

export function minutesBetween(start: Date | string, end: Date | string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
}

/** Human-sized duration like "1h 20m" / "45m" (spec §62: no false precision). */
export function formatMinutes(total: number): string {
  const m = Math.round(total);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}
