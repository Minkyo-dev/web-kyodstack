import type { FsrsState } from "./srs";

export type Direction = "recognition" | "recall";
export type QueueCard = { id: string; wordId: string; direction: Direction; fsrsState: FsrsState; due: string; suspended: boolean; wordCreatedAt: string };
export type QueueSettings = { newPerDay: number; reviewsPerDay: number; directions: readonly Direction[] };

const directionOrder = (d: Direction) => (d === "recognition" ? 0 : 1);

/**
 * Today's queue (spec §7.3): due reviews by due time, then new cards by word age (recognition first), each capped
 * by what is left of today's limits; a word appears once per day (sibling bury); one new card after every three
 * reviews.
 */
export function buildQueue(input: {
  cards: QueueCard[];
  todayEnd: Date;
  doneReviewsToday: number;
  newIntroducedToday: number;
  reviewedTodayWordIds: ReadonlySet<string>;
  settings: QueueSettings;
}): QueueCard[] {
  const { settings } = input;
  const active = input.cards.filter((c) => !c.suspended && settings.directions.includes(c.direction));
  const end = input.todayEnd.getTime();
  const reviews = active
    .filter((c) => c.fsrsState !== "new" && new Date(c.due).getTime() <= end)
    .sort((a, b) => a.due.localeCompare(b.due) || directionOrder(a.direction) - directionOrder(b.direction));
  const fresh = active
    .filter((c) => c.fsrsState === "new")
    .sort((a, b) => a.wordCreatedAt.localeCompare(b.wordCreatedAt) || a.wordId.localeCompare(b.wordId) || directionOrder(a.direction) - directionOrder(b.direction));

  const used = new Set(input.reviewedTodayWordIds);
  const pick = (list: QueueCard[], cap: number) => {
    const out: QueueCard[] = [];
    for (const c of list) {
      if (out.length >= cap) break;
      if (used.has(c.wordId)) continue;
      used.add(c.wordId);
      out.push(c);
    }
    return out;
  };
  const pickedReviews = pick(reviews, Math.max(0, settings.reviewsPerDay - input.doneReviewsToday));
  const pickedNew = pick(fresh, Math.max(0, settings.newPerDay - input.newIntroducedToday));

  const queue: QueueCard[] = [];
  let r = 0;
  let n = 0;
  while (r < pickedReviews.length || n < pickedNew.length) {
    for (let k = 0; k < 3 && r < pickedReviews.length; k++) queue.push(pickedReviews[r++]);
    if (n < pickedNew.length) queue.push(pickedNew[n++]);
  }
  return queue;
}
