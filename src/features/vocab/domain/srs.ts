import { fsrs, generatorParameters, type Card, type Grade, type State } from "ts-fsrs";

/** The only module that knows ts-fsrs (spec §7.2). Rows ⇄ ts-fsrs cards, one rating, button previews. */
export const ALGO_VERSION = "fsrs-6@ts-fsrs-5.4.2";
export const FSRS_STATES = ["new", "learning", "review", "relearning"] as const; // ts-fsrs State 0..3
export type FsrsState = (typeof FSRS_STATES)[number];
export type ReviewRating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export type CardState = {
  fsrsState: FsrsState;
  due: string;
  stability: number | null;
  difficulty: number | null;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReview: string | null;
};

export type SrsOptions = { retention: number; fuzz?: boolean };

function scheduler({ retention, fuzz = true }: SrsOptions) {
  return fsrs(generatorParameters({ request_retention: retention, maximum_interval: 3650, enable_fuzz: fuzz, enable_short_term: true }));
}

export function toFsrsCard(s: CardState): Card {
  return {
    due: new Date(s.due),
    stability: s.stability ?? 0,
    difficulty: s.difficulty ?? 0,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: FSRS_STATES.indexOf(s.fsrsState) as State,
    last_review: s.lastReview ? new Date(s.lastReview) : undefined,
  };
}

export function fromFsrsCard(c: Card): CardState {
  return {
    fsrsState: FSRS_STATES[c.state],
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    lastReview: c.last_review ? c.last_review.toISOString() : null,
  };
}

export function applyRating(state: CardState, rating: ReviewRating, now: Date, opts: SrsOptions): CardState {
  return fromFsrsCard(scheduler(opts).next(toFsrsCard(state), now, rating as Grade).card);
}

/** The interval each button would give, e.g. { 1: "1분", 2: "6분", 3: "10분", 4: "3일" } (no fuzz, so it's stable). */
export function previewIntervals(state: CardState, now: Date, opts: SrsOptions): Record<ReviewRating, string> {
  const preview = scheduler({ ...opts, fuzz: false }).repeat(toFsrsCard(state), now);
  const label = (r: ReviewRating) => formatInterval(preview[r as Grade].card.due.getTime() - now.getTime());
  return { 1: label(1), 2: label(2), 3: label(3), 4: label(4) };
}

const MINUTE = 60_000;
const DAY = 86_400_000;

export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes}분`;
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))}시간`;
  const days = Math.round(ms / DAY);
  if (days < 14) return `${days}일`;
  if (days < 60) return `${Math.round(days / 7)}주`;
  if (days < 365) return `${Math.round(days / 30)}개월`;
  return `${Number((days / 365).toFixed(1))}년`;
}
