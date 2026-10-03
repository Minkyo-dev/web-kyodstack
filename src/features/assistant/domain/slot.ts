/** Time slots `slot-v1` (ADR 0044). Pure: the hour a rule's sessions actually happen, and the next day to place it. */
import { z } from "zod";
import { isoWeekday } from "@/features/direction/domain/habits";

export const SLOT_MIN_SESSIONS = 4;
const SLOT_MIN_IN_HOUR = 3;
const SLOT_SHARE = 0.5;
export const SLOT_LOOKAHEAD_DAYS = 7;
const SLOT_LEAD_MS = 5 * 60_000;

export const TimeSlotPayload = z.object({
  protocolId: z.uuid(),
  missionId: z.uuid(),
  hour: z.number().int().min(0).max(23),
  minutes: z.number().int().min(5).max(600),
  weekdays: z.array(z.number().int().min(1).max(7)),
});
export type TimeSlot = z.infer<typeof TimeSlotPayload>;

/** The local start hour holding most sessions, if it is clear enough; ties go to the earlier hour. */
export function dominantHour(hours: number[]): { hour: number; count: number } | null {
  if (hours.length < SLOT_MIN_SESSIONS) return null;
  const counts = new Map<number, number>();
  for (const h of hours) counts.set(h, (counts.get(h) ?? 0) + 1);
  const [hour, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  if (count < SLOT_MIN_IN_HOUR || count / hours.length < SLOT_SHARE) return null;
  return { hour, count };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const hourLabel = (h: number) => `${pad(h)}:00`;

/**
 * `slot-apply-v1`: the first local day from today through 7 days ahead that is on one of the weekdays (any day when
 * empty) and whose HH:00 start is at least 5 minutes away. `startOf` turns a local date + "HH:mm" into an instant.
 */
export function pickSlotDay(i: {
  today: string;
  weekdays: number[];
  hour: number;
  now: Date;
  addDays: (date: string, days: number) => string;
  startOf: (date: string, time: string) => string;
}): { date: string; startsAt: string } | null {
  for (let k = 0; k <= SLOT_LOOKAHEAD_DAYS; k++) {
    const date = i.addDays(i.today, k);
    if (i.weekdays.length > 0 && !i.weekdays.includes(isoWeekday(date))) continue;
    const startsAt = i.startOf(date, hourLabel(i.hour));
    if (Date.parse(startsAt) - i.now.getTime() >= SLOT_LEAD_MS) return { date, startsAt };
  }
  return null;
}
