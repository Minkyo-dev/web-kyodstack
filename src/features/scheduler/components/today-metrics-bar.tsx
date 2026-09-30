"use client";

import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import type { CalendarBlock } from "../domain/schedule.types";
import type { Task } from "../domain/task.types";
import type { DailyReflection, SessionWithTask } from "../domain/work-session.types";
import { formatMinutes } from "../utils/duration";
import { computeDaySummary } from "../utils/metrics";
import { DailyReflectionDialog } from "./daily-reflection-dialog";

export function TodayMetricsBar({
  tasks,
  blocks,
  sessions,
  todayRange,
  today,
  reflection,
}: {
  tasks: Task[];
  blocks: CalendarBlock[];
  sessions: SessionWithTask[];
  todayRange: { start: string; end: string };
  today: string;
  reflection: DailyReflection | null;
}) {
  const hasRunning = sessions.some((s) => s.ended_at === null);
  const now = useNow(30_000, hasRunning);
  const [reflecting, setReflecting] = useState(false);

  const summary = computeDaySummary({ blocks, sessions, range: todayRange, now });
  const completed = tasks.filter((t) => t.status === "completed").length;
  const actualLabel =
    formatMinutes(summary.actualMinutes) +
    (summary.runningMinutes >= 1 ? ` (+${formatMinutes(summary.runningMinutes)} 진행 중)` : "");

  return (
    <footer
      aria-label="오늘 요약"
      className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border px-4 py-2 text-sm"
    >
      <Metric label="계획" value={formatMinutes(summary.plannedMinutes)} />
      <Metric label="실제" value={actualLabel} />
      <Metric label="집중" value={summary.averageFocus?.toFixed(1) ?? "—"} />
      <Metric label="완료" value={`${completed} / ${tasks.length}`} />
      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setReflecting(true)}>
        <NotebookPen aria-hidden />
        {reflection ? "회고 수정" : "하루 마무리"}
      </Button>
      <DailyReflectionDialog
        open={reflecting}
        date={today}
        summary={summary}
        completed={completed}
        total={tasks.length}
        reflection={reflection}
        onClose={() => setReflecting(false)}
      />
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
