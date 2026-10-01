import type { ProgressDelta } from "@/lib/progress";
import type { NewXpEvent } from "../domain/xp.types";

export type AwardResult = { total_xp: number; level: number; previous_level: number };

export function deltaFrom(
  events: NewXpEvent[],
  awards: AwardResult[],
  extra: { questsCleared?: NonNullable<ProgressDelta["questsCleared"]>; achievements?: NonNullable<ProgressDelta["achievements"]> } = {},
): ProgressDelta | null {
  const questsCleared = extra.questsCleared ?? [];
  const achievements = extra.achievements ?? [];
  if (events.length === 0 && questsCleared.length === 0 && achievements.length === 0) return null;
  const sums = new Map<string, number>();
  for (const e of events) sums.set(e.rule, (sums.get(e.rule) ?? 0) + e.xp);
  const first = awards[0];
  const last = awards[awards.length - 1];
  const levelUp = first && last && last.level > first.previous_level ? { from: first.previous_level, to: last.level } : null;
  const base: ProgressDelta = { xp: [...sums].map(([rule, xp]) => ({ rule, xp })), levelUp };
  return extra.questsCleared || extra.achievements ? { ...base, questsCleared, achievements } : base;
}
