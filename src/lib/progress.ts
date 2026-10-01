/** What a core action earned, forwarded to the client notifier (E1 spec §3). Empty → omitted. */
export type ProgressDelta = {
  xp: { rule: string; xp: number }[];
  levelUp: { from: number; to: number } | null;
  questsCleared?: { type: string; title: string; xp: number }[];
  achievements?: { key: string; name: string }[];
};
