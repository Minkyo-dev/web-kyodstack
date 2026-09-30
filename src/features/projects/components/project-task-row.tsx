"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActionRunner } from "@/hooks/use-action-runner";
import { completeTaskAction, reopenTaskAction } from "@/features/scheduler/actions/task.actions";
import { TASK_STATUS_LABEL } from "@/features/scheduler/domain/scheduler.constants";
import type { Task } from "@/features/scheduler/domain/task.types";
import { formatMinutes } from "@/features/scheduler/utils/duration";

export function ProjectTaskRow({
  task,
  estimateMinutes,
  actualMinutes,
}: {
  task: Task;
  estimateMinutes: number;
  actualMinutes: number;
}) {
  const { run, pending } = useActionRunner();
  const done = task.status === "completed";
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-sm">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `${task.title} 완료 취소` : `${task.title} 완료로 표시`}
        disabled={pending}
        onClick={() => run(() => (done ? reopenTaskAction : completeTaskAction)({ taskId: task.id }))}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm border",
          done ? "border-success bg-success text-background" : "border-input hover:border-foreground",
        )}
      >
        {done && <Check className="size-3" aria-hidden />}
      </button>
      <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground line-through")}>
        {task.title}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {TASK_STATUS_LABEL[task.status]} · {done ? "실제" : "예상"}{" "}
        {formatMinutes(done ? actualMinutes : estimateMinutes)}
        {!done && actualMinutes > 0 && ` · 진행 ${formatMinutes(actualMinutes)}`}
      </span>
    </li>
  );
}
