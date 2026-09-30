/**
 * Visual state of a calendar block and reschedule targets (calendar-planning design §1). Pure and
 * DST-safe: local days come from the tz utils, never from fixed offsets.
 */
import { addLocalDays, localDateTimeToIso, localDayRange, toLocalDate, toLocalTime } from "./timezone";

export const NOT_STARTED_GRACE_MINUTES = 15;
/** Same rule as the DB mark and D's Reliability matching. */
export const MATCH_LEAD_MINUTES = 30;

export type BlockVisualState =
  | "planned"
  | "not_started"
  | "running"
  | "missed"
  | "completed"
  | "skipped"
  | "cancelled";
export type BlockLike = { id: string; task_id: string; starts_at: string; ends_at: string; status: string };
export type SessionRef = {
  schedule_block_id: string | null;
  task_id: string;
  started_at: string;
  ended_at: string | null;
};

const MIN = 60_000;
const t = (iso: string) => new Date(iso).getTime();

function matches(block: BlockLike, s: SessionRef) {
  if (s.schedule_block_id === block.id) return true;
  const start = t(s.started_at);
  return s.task_id === block.task_id && start >= t(block.starts_at) - MATCH_LEAD_MINUTES * MIN && start < t(block.ends_at);
}

export function blockState(block: BlockLike, sessions: SessionRef[], now: Date): BlockVisualState {
  if (block.status !== "planned") return block.status as BlockVisualState;
  const mine = sessions.filter((s) => matches(block, s));
  if (mine.some((s) => s.ended_at === null)) return "running";
  if (mine.length > 0) return "planned";
  const n = now.getTime();
  if (n >= t(block.ends_at)) return "missed";
  if (n >= t(block.starts_at) + NOT_STARTED_GRACE_MINUTES * MIN) return "not_started";
  return "planned";
}

const ceil15 = (ms: number) => Math.ceil(ms / (15 * MIN)) * 15 * MIN;

/** Earliest 15-minute start today that fits `lengthMinutes` before local midnight without overlapping a planned block. */
export function nextFreeSlot(input: {
  now: Date;
  lengthMinutes: number;
  blocks: BlockLike[];
  excludeBlockId?: string;
  timezone: string;
  workdayStart: string;
}): string | null {
  const today = toLocalDate(input.now, input.timezone);
  const dayEnd = t(localDayRange(today, input.timezone).end);
  const workStart = t(localDateTimeToIso(today, input.workdayStart.slice(0, 5), input.timezone));
  const busy = input.blocks
    .filter((b) => b.status === "planned" && b.id !== input.excludeBlockId)
    .map((b) => [t(b.starts_at), t(b.ends_at)] as const)
    .sort((a, b) => a[0] - b[0]);

  let start = Math.max(ceil15(input.now.getTime()), workStart);
  const len = input.lengthMinutes * MIN;
  for (;;) {
    const hit = busy.find(([s, e]) => s < start + len && e > start);
    if (!hit) break;
    start = ceil15(hit[1]);
  }
  return start + len <= dayEnd ? new Date(start).toISOString() : null;
}

/** Same local wall time on the next local day. */
export function sameTimeTomorrow(startsAt: string, timezone: string): string {
  const date = toLocalDate(startsAt, timezone);
  return localDateTimeToIso(addLocalDays(date, 1, timezone), toLocalTime(startsAt, timezone), timezone);
}
