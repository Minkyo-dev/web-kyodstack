"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import { createTaskAction } from "../actions/task.actions";
import type { SchedulerSettings, Task, TaskTemplate } from "../domain/task.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { estimateDuration, type StoredProfile } from "../utils/estimator";
import { TaskListItem } from "./task-list-item";
import { AiRecommendationList } from "@/features/ai/components/ai-recommendation-list";
import type { PendingRecommendation } from "@/features/ai/queries/ai.queries";

export function TodayTaskPanel({
  tasks,
  templates,
  settings,
  today,
  activeSession,
  durationProfiles,
  recommendations,
  onOpenTask,
}: {
  tasks: Task[];
  templates: TaskTemplate[];
  settings: SchedulerSettings;
  today: string;
  activeSession: SessionWithTask | null;
  durationProfiles: StoredProfile[];
  recommendations: PendingRecommendation[];
  onOpenTask: (taskId: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // Make open tasks draggable onto FullCalendar (external drop → eventReceive).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let draggable: { destroy: () => void } | undefined;
    let cancelled = false;
    import("@fullcalendar/interaction").then(({ Draggable }) => {
      if (cancelled) return;
      draggable = new Draggable(el, {
        itemSelector: "[data-draggable-task]",
        eventData: (itemEl) => ({
          title: itemEl.getAttribute("data-title") ?? "",
          duration: { minutes: Number(itemEl.getAttribute("data-minutes")) },
          create: true,
          extendedProps: { taskId: itemEl.getAttribute("data-task-id") },
        }),
      });
    });
    return () => {
      cancelled = true;
      draggable?.destroy();
    };
  }, []);

  const open = tasks.filter((t) => t.status !== "completed");
  const completed = tasks.filter((t) => t.status === "completed");

  return (
    <aside
      aria-labelledby="today-tasks-heading"
      className="flex max-h-[45dvh] shrink-0 flex-col border-b border-border md:max-h-none md:w-72 md:border-r md:border-b-0 lg:w-80"
    >
      <div className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <h2 id="today-tasks-heading" className="text-sm font-semibold">
          오늘 할 일
        </h2>
        <span className="text-xs text-muted-foreground">
          캘린더로 끌어 일정 추가
        </span>
      </div>

      <TaskQuickCreate templates={templates} today={today} />

      <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="오늘 할 일 목록">
        {open.length === 0 && completed.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            아직 할 일이 없습니다.
          </li>
        )}
        {open.map((task) => (
          <TaskListItem
            key={task.id}
            task={task}
            today={today}
            estimate={estimateDuration(task, settings, durationProfiles)}
            running={activeSession?.task_id === task.id}
            timerBusy={activeSession !== null}
            onOpen={() => onOpenTask(task.id)}
          />
        ))}
        {completed.length > 0 && (
          <li className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground">
            오늘 완료 {completed.length}
          </li>
        )}
        {completed.map((task) => (
          <TaskListItem
            key={task.id}
            task={task}
            today={today}
            estimate={null}
            running={false}
            timerBusy
            onOpen={() => onOpenTask(task.id)}
          />
        ))}
      </ul>

      <div className="border-t border-border px-4 py-3">
        <AiRecommendationList
          items={recommendations}
          emptyText="진행 중인 프로젝트와 오늘 남은 시간을 보고 할 일을 제안합니다."
        />
      </div>
    </aside>
  );
}

function TaskQuickCreate({ templates, today }: { templates: TaskTemplate[]; today: string }) {
  const { run, pending } = useActionRunner();
  const formRef = useRef<HTMLFormElement>(null);
  const [showMore, setShowMore] = useState(false);

  return (
    <form
      ref={formRef}
      className="space-y-2 px-4 pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const estimate = String(fd.get("estimate") ?? "").trim();
        const template = String(fd.get("template") ?? "").trim();
        run(
          () =>
            createTaskAction({
              title: fd.get("title"),
              userEstimatedMinutes: estimate ? Number(estimate) : undefined,
              templateName: template || undefined,
              targetDate: today,
            }),
          { onSuccess: () => formRef.current?.reset() },
        );
      }}
    >
      <div className="flex gap-1.5">
        <label htmlFor="quick-task-title" className="sr-only">
          새 할 일
        </label>
        <Input
          id="quick-task-title"
          name="title"
          placeholder="할 일 추가"
          required
          maxLength={200}
          autoComplete="off"
          onFocus={() => setShowMore(true)}
        />
        <Button type="submit" size="icon" disabled={pending} aria-label="할 일 추가">
          <Plus aria-hidden />
        </Button>
      </div>
      {showMore && (
        <div className="flex gap-1.5">
          <div className="w-24 shrink-0">
            <label htmlFor="quick-task-estimate" className="sr-only">
              예상 시간(분)
            </label>
            <Input
              id="quick-task-estimate"
              name="estimate"
              type="number"
              inputMode="numeric"
              min={5}
              max={720}
              step={5}
              placeholder="분"
            />
          </div>
          <label htmlFor="quick-task-template" className="sr-only">
            작업 유형
          </label>
          <Input
            id="quick-task-template"
            name="template"
            list="task-template-options"
            placeholder="작업 유형 (선택)"
            maxLength={100}
            autoComplete="off"
          />
          <datalist id="task-template-options">
            {templates.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </div>
      )}
    </form>
  );
}
