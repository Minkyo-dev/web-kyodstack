import type { PauseLike } from "@/features/analytics/domain/stats.types";
import { focusStats } from "@/features/scheduler/utils/focus";
import type { ArchivableStatus, HabitRule } from "./direction.types";

type DueInput = { rule: HabitRule; status: ArchivableStatus; weekdays: number[] };

/** ISO weekday (1 = Monday … 7 = Sunday) of a local date string; calendar math only, no zone. */
export function isoWeekday(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function isDueOn(h: DueInput, localDate: string): boolean {
  return h.status === "active" && h.weekdays.includes(isoWeekday(localDate));
}

/** Only `check` habits are ticked by hand, and only on a day they are due. */
export function canCheckToday(h: DueInput, localDate: string): boolean {
  return h.rule === "check" && isDueOn(h, localDate);
}

type SessionInput = {
  source: string;
  started_at: string;
  ended_at: string | null;
  pauses: PauseLike[];
  task: { protocol_id: string | null } | null;
};

/** Focused minutes of finished timer sessions on tasks linked to the protocol (path status is irrelevant). */
export function focusMinutesFor(protocolId: string, sessions: SessionInput[]): number {
  let ms = 0;
  for (const s of sessions) {
    if (s.source !== "timer" || !s.ended_at || s.task?.protocol_id !== protocolId) continue;
    ms += focusStats(s, s.pauses).focusedMs;
  }
  return Math.round(ms / 60_000);
}

const DAY = ["", "월", "화", "수", "목", "금", "토", "일"];
export const WEEKDAY_LABEL = DAY;

export function formatWeekdays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "매일";
  if (sorted.join() === "1,2,3,4,5") return "평일";
  return sorted.map((d) => DAY[d]).join(" ");
}
