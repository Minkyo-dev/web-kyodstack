import type { CalendarBlock } from "../domain/schedule.types";
import type { Task } from "../domain/task.types";
import { formatMinutes, minutesBetween } from "../utils/duration";

/**
 * Planned = today's non-cancelled blocks, clipped to the local day. Skipped blocks
 * are included (spec §59). Actual time and focus come in Phase 2.
 */
export function TodayMetricsBar({
  tasks,
  blocks,
  todayRange,
}: {
  tasks: Task[];
  blocks: CalendarBlock[];
  todayRange: { start: string; end: string };
}) {
  const dayStart = new Date(todayRange.start).getTime();
  const dayEnd = new Date(todayRange.end).getTime();

  let plannedMinutes = 0;
  for (const b of blocks) {
    if (b.status === "cancelled") continue;
    const start = Math.max(dayStart, new Date(b.starts_at).getTime());
    const end = Math.min(dayEnd, new Date(b.ends_at).getTime());
    if (end > start) plannedMinutes += minutesBetween(new Date(start), new Date(end));
  }

  const completed = tasks.filter((t) => t.status === "completed").length;

  return (
    <footer
      aria-label="오늘 요약"
      className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border px-4 py-2 text-sm"
    >
      <Metric label="계획" value={formatMinutes(plannedMinutes)} />
      <Metric label="완료" value={`${completed} / ${tasks.length}`} />
    </footer>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </p>
  );
}
