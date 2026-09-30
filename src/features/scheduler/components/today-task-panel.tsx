"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import { createTaskAction } from "../actions/task.actions";
import type { SchedulerSettings, Task, TaskTemplate } from "../domain/task.types";
import type { SessionWithTask, TaskPlanActual } from "../domain/work-session.types";
import { partialTask } from "../utils/focus";
import { estimateDuration, type DurationGroup, type GroupLabels } from "../utils/estimator";
import { TaskListItem } from "./task-list-item";
import type { DomainRef, TagRef } from "@/features/classification/domain/classification.types";
import { parseQuickAdd } from "@/features/classification/utils/quick-add";
import { TypeSelect } from "@/features/classification/components/classification-fields";
import { TokenInput } from "@/features/classification/components/token-input";
import { TagFilter } from "@/features/classification/components/tag-filter";
import { TemplateTypeBanner } from "@/features/classification/components/template-type-banner";
import { AiRecommendationList } from "@/features/ai/components/ai-recommendation-list";
import type { PendingRecommendation } from "@/features/ai/queries/ai.queries";

export function TodayTaskPanel({
  tasks,
  templates,
  settings,
  today,
  activeSession,
  durationGroups,
  labels,
  recommendations,
  tags,
  domains,
  tagFilter,
  untypedTemplateCount,
  onManageClassification,
  planActual,
  upcomingTaskIds,
  onStartTask,
  onOpenTask,
}: {
  tasks: Task[];
  templates: TaskTemplate[];
  settings: SchedulerSettings;
  today: string;
  activeSession: SessionWithTask | null;
  durationGroups: DurationGroup[];
  labels: GroupLabels;
  recommendations: PendingRecommendation[];
  tags: TagRef[];
  domains: DomainRef[];
  /** Selected tag ids (?tags=); "any of". */
  tagFilter: string[];
  untypedTemplateCount: number;
  onManageClassification: () => void;
  planActual: Record<string, TaskPlanActual>;
  /** Tasks with a planned block that hasn't ended yet. */
  upcomingTaskIds: Set<string>;
  onStartTask: (task: Task) => void;
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
          extendedProps: {
            taskId: itemEl.getAttribute("data-task-id"),
            // Partial tasks keep the remainder length instead of a fresh server estimate.
            fixedDuration: itemEl.hasAttribute("data-partial"),
            // Shown in the drag mirror and in the post-drop toast (calendar-planning design §2).
            recommendedMinutes: itemEl.hasAttribute("data-recommended")
              ? Number(itemEl.getAttribute("data-recommended"))
              : undefined,
            sampleCount: Number(itemEl.getAttribute("data-samples") ?? 0),
            reason: itemEl.getAttribute("data-reason"),
          },
        }),
      });
    });
    return () => {
      cancelled = true;
      draggable?.destroy();
    };
  }, []);

  const visible = tagFilter.length ? tasks.filter((t) => t.tags.some((g) => tagFilter.includes(g.id))) : tasks;
  const open = visible.filter((t) => t.status !== "completed");
  const completed = visible.filter((t) => t.status === "completed");
  // Only tags that appear on today's tasks (plus any still selected) are offered as filters.
  const usedTags = tags.filter((g) => tagFilter.includes(g.id) || tasks.some((t) => t.tags.some((x) => x.id === g.id)));

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

      <TaskQuickCreate templates={templates} today={today} tags={tags} domains={domains} />
      <TemplateTypeBanner count={untypedTemplateCount} onManage={onManageClassification} />
      <TagFilter tags={usedTags} selected={tagFilter} />

      <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="오늘 할 일 목록">
        {open.length === 0 && completed.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            아직 할 일이 없습니다.
          </li>
        )}
        {open.map((task) => {
          const est = estimateDuration(task, settings, durationGroups, labels);
          const running = activeSession?.task_id === task.id;
          const partial = partialTask({
            status: task.status,
            actualMinutes: planActual[task.id]?.actual_minutes ?? 0,
            hasUpcomingBlock: upcomingTaskIds.has(task.id),
            running,
            estimateMinutes: est.minutes,
            minBlockMinutes: settings.min_block_minutes,
          });
          return (
            <TaskListItem
              key={task.id}
              task={task}
              today={today}
              estimate={partial?.dropMinutes ? { ...est, minutes: partial.dropMinutes } : est}
              running={running}
              partial={partial}
              onStart={() => onStartTask(task)}
              onOpen={() => onOpenTask(task.id)}
            />
          );
        })}
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
            partial={null}
            onStart={() => {}}
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

function TaskQuickCreate({
  templates,
  today,
  tags,
  domains,
}: {
  templates: TaskTemplate[];
  today: string;
  tags: TagRef[];
  domains: DomainRef[];
}) {
  const { run, pending } = useActionRunner();
  const formRef = useRef<HTMLFormElement>(null);
  const [showMore, setShowMore] = useState(false);
  // Remount the token input after a create: it keeps its own text state.
  const [resetKey, setResetKey] = useState(0);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [domainId, setDomainId] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      className="space-y-2 px-4 pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const parsed = parseQuickAdd(String(fd.get("title") ?? ""));
        if (!parsed.title) {
          toast.error("제목을 입력해 주세요.");
          return;
        }
        const estimate = String(fd.get("estimate") ?? "").trim();
        const template = String(fd.get("template") ?? "").trim();
        const taskType = String(fd.get("taskType") ?? "");
        run(
          () =>
            createTaskAction({
              title: parsed.title,
              userEstimatedMinutes: estimate ? Number(estimate) : undefined,
              templateName: template || undefined,
              targetDate: today,
              taskType: taskType || undefined,
              tagIds,
              tagNames: parsed.tags,
              domainId: domainId ?? undefined,
              domainName: domainId ? undefined : (parsed.domain ?? undefined),
            }),
          {
            onSuccess: (r) => {
              formRef.current?.reset();
              setResetKey((k) => k + 1);
              setTagIds([]);
              setDomainId(null);
              if (r.domainCreated) toast.success(`새 영역 ${r.domainCreated}을 만들었어요`);
            },
          },
        );
      }}
    >
      <div className="flex items-start gap-1.5">
        <label htmlFor="quick-task-title" className="sr-only">
          새 할 일
        </label>
        <TokenInput
          key={resetKey}
          id="quick-task-title"
          name="title"
          placeholder="할 일 추가 (#태그 @영역)"
          tags={tags}
          domains={domains}
          selectedTagIds={tagIds}
          onSelectedTagIdsChange={setTagIds}
          selectedDomainId={domainId}
          onSelectedDomainIdChange={setDomainId}
          onFocus={() => setShowMore(true)}
        />
        <Button type="submit" size="icon" disabled={pending} aria-label="할 일 추가">
          <Plus aria-hidden />
        </Button>
      </div>
      {showMore && (
        <div className="grid grid-cols-[6rem_5rem_1fr] gap-1.5">
          <div>
            <label htmlFor="quick-task-type" className="sr-only">
              유형
            </label>
            <TypeSelect id="quick-task-type" name="taskType" />
          </div>
          <div>
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
          <div>
            <label htmlFor="quick-task-template" className="sr-only">
              템플릿
            </label>
            <Input
              id="quick-task-template"
              name="template"
              list="task-template-options"
              placeholder="템플릿 (선택)"
              maxLength={100}
              autoComplete="off"
            />
            <datalist id="task-template-options">
              {templates.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </div>
        </div>
      )}
    </form>
  );
}
