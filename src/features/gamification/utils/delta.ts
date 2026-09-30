import type { ProgressDelta } from "@/lib/progress";
import type { NewXpEvent } from "../domain/xp.types";

export type AwardResult = { total_xp: number; level: number; previous_level: number };

export function deltaFrom(events: NewXpEvent[], award: AwardResult | null): ProgressDelta | null {
  if (events.length === 0) return null;
  const sums = new Map<string, number>();
  for (const e of events) sums.set(e.rule, (sums.get(e.rule) ?? 0) + e.xp);
  return {
    xp: [...sums].map(([rule, xp]) => ({ rule, xp })),
    levelUp: award && award.level > award.previous_level ? { from: award.previous_level, to: award.level } : null,
  };
}
