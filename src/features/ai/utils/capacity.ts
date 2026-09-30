/**
 * Remaining schedulable minutes for today (spec §63). Deterministic: the LLM gets the
 * number and never derives capacity from raw timestamps.
 * Window = [max(now, workday start), workday end] minus the union of planned blocks.
 */
import { localDateTimeToIso } from "@/features/scheduler/utils/timezone";

export function remainingCapacityMinutes(input: {
  now: Date;
  today: string;
  timezone: string;
  workdayStart: string; // "HH:mm[:ss]"
  workdayEnd: string;
  blocks: { starts_at: string; ends_at: string; status: string }[];
}): number {
  const dayStart = new Date(localDateTimeToIso(input.today, input.workdayStart.slice(0, 5), input.timezone)).getTime();
  const dayEnd = new Date(localDateTimeToIso(input.today, input.workdayEnd.slice(0, 5), input.timezone)).getTime();
  const from = Math.max(input.now.getTime(), dayStart);
  if (from >= dayEnd) return 0;

  const busy = input.blocks
    .filter((b) => b.status === "planned")
    .map((b) => [Math.max(new Date(b.starts_at).getTime(), from), Math.min(new Date(b.ends_at).getTime(), dayEnd)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  let busyMs = 0;
  let curS = -1;
  let curE = -1;
  for (const [s, e] of busy) {
    if (s > curE) {
      if (curE > curS) busyMs += curE - curS;
      curS = s;
      curE = e;
    } else {
      curE = Math.max(curE, e);
    }
  }
  if (curE > curS) busyMs += curE - curS;

  return Math.max(0, Math.floor((dayEnd - from - busyMs) / 60_000));
}
