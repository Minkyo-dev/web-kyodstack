import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysUntil, dueState } from "../utils/progress";

/** Target date with icon + text (spec §14.4: never color alone). */
export function DueBadge({
  today,
  target,
  closed,
}: {
  today: string;
  target: string | null;
  closed: boolean;
}) {
  const state = dueState(today, target, closed);
  if (state === "none") return <span className="text-xs text-muted-foreground">목표일 없음</span>;
  const d = target ? daysUntil(today, target) : 0;
  const text =
    state === "done"
      ? `목표 ${target}`
      : state === "overdue"
        ? `${-d}일 지남 (${target})`
        : d === 0
          ? `오늘 마감`
          : `D-${d} (${target})`;
  const Icon = state === "overdue" ? AlertTriangle : state === "done" ? CheckCircle2 : CalendarClock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs tabular-nums",
        state === "overdue" && "text-destructive",
        state === "due_soon" && "text-warning",
        (state === "on_track" || state === "done") && "text-muted-foreground",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {text}
    </span>
  );
}
