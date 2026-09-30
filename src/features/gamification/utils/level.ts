/** Level curve: L → L+1 costs 100 + 50·L; level 1 at 0 XP. Mirrored by SQL `xp_level`. */
export function levelFor(total: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(total));
  while (rest >= 100 + 50 * level) {
    rest -= 100 + 50 * level;
    level += 1;
  }
  return { level, into: rest, need: 100 + 50 * level };
}

/** Practice level over lifetime focused minutes (requirements §35): activity, not skill. */
export function practiceLevel(minutes: number): number {
  return Math.floor(Math.sqrt(Math.max(0, minutes) / 60)) + 1;
}

type LevelUp = { from: number; to: number } | null;
/** Several level-ups before the event shows → one event from the first level to the latest. */
export function mergeLevelUp(current: LevelUp, next: LevelUp): LevelUp {
  if (!next) return current;
  if (!current) return next;
  return { from: current.from, to: Math.max(current.to, next.to) };
}
