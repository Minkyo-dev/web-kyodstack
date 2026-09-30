"use client";

import { AlertTriangle, CalendarCheck, Check, GripVertical, Play, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActionRunner } from "@/hooks/use-action-runner";
import { completeTaskAction, reopenTaskAction } from "../actions/task.actions";
import { TASK_STATUS_LABEL } from "../domain/scheduler.constants";
import type { Task } from "../domain/task.types";
import { formatMinutes } from "../utils/duration";
import type { DurationEstimate } from "../utils/estimator";

export function TaskListItem({
  task,
  today,
  estimate,
  running,
  partial,
  onStart,
  onOpen,
}: {
  task: Task;
  today: string;
  /** What a drop would create; null for tasks that can't be scheduled. */
  estimate: DurationEstimate | null;
  /** This task has the running timer. */
  running: boolean;
  /** Worked on but not finished, with no upcoming block (Continue Later). */
  partial: { actualMinutes: number; remainingMinutes: number | null } | null;
  /** Start, or ask to switch when another timer runs (focus-flow design §2). */
  onStart: () => void;
  onOpen: () => void;
}) {
  const { run, pending } = useActionRunner();
  const done = task.status === "completed";
  const overdue = !done && task.target_date !== null && task.target_date < today;
  const draggable = estimate !== null;
  // A partial task's drop length is its remainder, not a learned recommendation.
  const learned = estimate !== null && estimate.scope !== "none" && !partial;

  const toggle = () =>
    run(() => (done ? reopenTaskAction : completeTaskAction)({ taskId: task.id }));

  return (
    <li
      className={cn(
        "group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
      {...(draggable && {
        "data-draggable-task": "",
        "data-task-id": task.id,
        "data-title": task.title,
        "data-minutes": String(estimate!.minutes),
        "data-partial": partial?.remainingMinutes ? "" : undefined,
      })}
    >
      {draggable ? (
        <GripVertical
          className="mt-1 size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground"
          aria-hidden
        />
      ) : (
        <span className="w-3.5 shrink-0" aria-hidden />
      )}

      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `${task.title} 완료 취소` : `${task.title} 완료로 표시`}
        disabled={pending}
        onClick={toggle}
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border",
          done ? "border-success bg-success text-background" : "border-input hover:border-foreground",
        )}
      >
        {done && <Check className="size-3" aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "block w-full truncate text-left text-sm",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </button>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {task.project && (
            <span className="text-foreground/80">
              {task.project.name}
              {task.milestone && ` › ${task.milestone.name}`}
            </span>
          )}
          {task.template && <span>{task.template.name}</span>}
          {task.user_estimated_minutes && <span>예상 {formatMinutes(task.user_estimated_minutes)}</span>}
          {learned && (
            <span title={`비슷한 완료 작업 ${estimate!.sampleCount}개 기준`}>
              → 추천 {formatMinutes(estimate!.minutes)}
            </span>
          )}
          {partial && (
            <span className="inline-flex items-center gap-0.5">
              <Timer className="size-3" aria-hidden />
              부분 진행 · {formatMinutes(Math.round(partial.actualMinutes))} 작업
              {partial.remainingMinutes ? ` · 남은 약 ${formatMinutes(partial.remainingMinutes)}` : ""}
            </span>
          )}
          {running && (
            <span className="inline-flex items-center gap-0.5 text-planned">
              <Timer className="size-3" aria-hidden />
              진행 중
            </span>
          )}
          {task.status === "planned" && (
            <span className="inline-flex items-center gap-0.5">
              <CalendarCheck className="size-3" aria-hidden />
              {TASK_STATUS_LABEL.planned}
            </span>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-0.5 text-warning">
              <AlertTriangle className="size-3" aria-hidden />
              기한 지남
            </span>
          )}
        </p>
      </div>

      {!done && !running && (
        <button
          type="button"
          onClick={onStart}
          aria-label={`${task.title} 타이머 시작`}
          className="mt-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <Play className="size-3.5" aria-hidden />
        </button>
      )}
    </li>
  );
}
