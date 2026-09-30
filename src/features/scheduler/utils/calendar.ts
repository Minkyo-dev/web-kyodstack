type Interval = { starts_at: string; ends_at: string; status: string; id: string };

/** Planned/completed blocks that overlap the given range (overlaps are a UX warning, spec §17.7). */
export function findOverlaps<T extends Interval>(
  blocks: T[],
  target: { id: string; start: Date; end: Date },
): T[] {
  const s = target.start.getTime();
  const e = target.end.getTime();
  return blocks.filter(
    (b) =>
      b.id !== target.id &&
      b.status !== "cancelled" &&
      b.status !== "skipped" &&
      new Date(b.starts_at).getTime() < e &&
      new Date(b.ends_at).getTime() > s,
  );
}
