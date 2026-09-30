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
  min_block_minutes: number;
  max_focus_block_minutes: number;
};

/** Learned/recommended durations round up to 5 minutes (spec §12, §27; ADR 0008). */
export const DURATION_ROUNDING_MINUTES = 5;

/**
 * Length of the block created when a task is dropped on the calendar (spec §27).
 * `correctionFactor` comes from the learned duration profile (1 when there is none).
 * The result is rounded up to 5 minutes and clamped to
 * [min_block_minutes, max_focus_block_minutes] (ADR 0006, 0008). A longer task is
 * split across several blocks.
 */
export function recommendBlockMinutes(
  baseMinutes: number,
  settings: BlockDurationSettings,
  correctionFactor = 1,
): number {
  const step = DURATION_ROUNDING_MINUTES;
  // Round to 2 decimals first so float noise (79.99999 / 80.0000001) can't jump a step.
  const scaled = Math.round(baseMinutes * correctionFactor * 100) / 100;
  const raw = roundUpToIncrement(scaled, step);
  const min = roundUpToIncrement(settings.min_block_minutes, step);
  const max = Math.max(min, Math.floor(settings.max_focus_block_minutes / step) * step);
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
