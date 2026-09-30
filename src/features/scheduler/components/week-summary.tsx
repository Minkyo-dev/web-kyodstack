"use client";

import { useNow } from "@/hooks/use-now";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { formatMinutes } from "../utils/duration";
import { computeDaySummary } from "../utils/metrics";
import { localDayRange } from "../utils/timezone";

/** One quiet line above the calendar (requirements §23, D3 spec §2). */
export function WeekSummary({
  week,
  blocks,
  sessions,
  completed,
  today,
  timezone,
}: {
  week: { startDate: string; endDate: string };
  blocks: CalendarBlock[];
  sessions: SessionWithTask[];
  completed: number;
  today: string;
  timezone: string;
}) {
  const now = useNow(60_000, sessions.some((s) => s.ended_at === null));
  const range = { start: localDayRange(week.startDate, timezone).start, end: localDayRange(week.endDate, timezone).start };
  const s = computeDaySummary({ blocks, sessions, range, now });
  const label = today >= week.startDate && today < week.endDate ? "이번 주" : "이 주";
  return (
    <p aria-label="주간 요약" className="px-3 pt-1.5 text-xs text-muted-foreground tabular-nums">
      {label} · 계획 {formatMinutes(s.plannedMinutes)} · 작업 {formatMinutes(s.actualMinutes + s.runningMinutes)} · 완료{" "}
      {completed}개
    </p>
  );
}
