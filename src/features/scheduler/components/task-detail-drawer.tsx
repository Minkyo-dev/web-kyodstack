"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import {
  scheduleTaskAction,
  setScheduleBlockStatusAction,
} from "../actions/schedule.actions";
import {
  cancelTaskAction,
  completeTaskAction,
  deleteTaskAction,
  reopenTaskAction,
  updateTaskAction,
} from "../actions/task.actions";
import { BLOCK_STATUS_LABEL, TASK_STATUS_LABEL } from "../domain/scheduler.constants";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext, Task, TaskTemplate } from "../domain/task.types";
import { formatMinutes, recommendBlockMinutes, resolveBaseEstimate } from "../utils/duration";
import { localDateTimeToIso, toLocalDate, toLocalTime } from "../utils/timezone";

export function TaskDetailDrawer({
  task,
  blocks,
  templates,
  context,
  today,
  onClose,
}: {
  task: Task | null;
  blocks: CalendarBlock[];
  templates: TaskTemplate[];
  context: SchedulerContext;
  today: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {task && (
          <TaskDetail
            key={task.id}
            task={task}
            blocks={blocks}
            templates={templates}
            context={context}
            today={today}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetail({
  task,
  blocks,
  templates,
  context,
  today,
  onClose,
}: {
  task: Task;
  blocks: CalendarBlock[];
  templates: TaskTemplate[];
  context: SchedulerContext;
  today: string;
  onClose: () => void;
}) {
  const { run, pending } = useActionRunner();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { timezone, settings } = context;
  const isOpen = task.status !== "completed" && task.status !== "cancelled";

  const base = resolveBaseEstimate({
    userEstimatedMinutes: task.user_estimated_minutes,
    templateDefaultMinutes: task.template?.default_estimate_minutes ?? null,
  });
  const blockMinutes = recommendBlockMinutes(base.minutes, settings);

  return (
    <>
      <SheetHeader className="border-b border-border">
        <SheetTitle className="pr-8 text-base">{task.title}</SheetTitle>
        <SheetDescription>
          상태: {TASK_STATUS_LABEL[task.status]}
          {task.template && ` · ${task.template.name}`}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-6">
        {/* ── Edit ─────────────────────────────────────────── */}
        <form
          className="space-y-3"
          aria-label="작업 편집"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const est = String(fd.get("estimate") ?? "").trim();
            const date = String(fd.get("targetDate") ?? "").trim();
            run(
              () =>
                updateTaskAction({
                  taskId: task.id,
                  title: fd.get("title"),
                  description: String(fd.get("description") ?? ""),
                  userEstimatedMinutes: est ? Number(est) : null,
                  targetDate: date || null,
                  priority: Number(fd.get("priority")),
                  complexity: Number(fd.get("complexity")),
                  templateName: String(fd.get("template") ?? "").trim() || null,
                }),
              { success: "저장했습니다." },
            );
          }}
        >
          <Field label="제목" htmlFor="task-title">
            <Input id="task-title" name="title" defaultValue={task.title} required maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="작업 유형" htmlFor="task-template">
              <Input
                id="task-template"
                name="template"
                list="drawer-template-options"
                defaultValue={task.template?.name ?? ""}
                maxLength={100}
                autoComplete="off"
              />
              <datalist id="drawer-template-options">
                {templates.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            </Field>
            <Field label="예상 시간(분)" htmlFor="task-estimate">
              <Input
                id="task-estimate"
                name="estimate"
                type="number"
                inputMode="numeric"
                min={5}
                max={720}
                step={5}
                defaultValue={task.user_estimated_minutes ?? ""}
              />
            </Field>
            <Field label="목표 날짜" htmlFor="task-target-date">
              <Input id="task-target-date" name="targetDate" type="date" defaultValue={task.target_date ?? ""} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="우선순위" htmlFor="task-priority">
                <ScoreSelect id="task-priority" name="priority" defaultValue={task.priority} />
              </Field>
              <Field label="난이도" htmlFor="task-complexity">
                <ScoreSelect id="task-complexity" name="complexity" defaultValue={task.complexity} />
              </Field>
            </div>
          </div>
          <Field label="메모" htmlFor="task-description">
            <Textarea
              id="task-description"
              name="description"
              rows={3}
              maxLength={5000}
              defaultValue={task.description ?? ""}
            />
          </Field>
          <Button type="submit" size="sm" disabled={pending}>
            저장
          </Button>
        </form>

        {/* ── Schedule (keyboard / mobile alternative to drag, spec §13) ── */}
        {isOpen && (
          <section aria-labelledby="schedule-heading" className="space-y-2">
            <h3 id="schedule-heading" className="text-sm font-semibold">
              일정에 추가
            </h3>
            <p className="text-xs text-muted-foreground">
              {formatMinutes(blockMinutes)} 블록이 만들어집니다
              {base.source === "user" && ` (예상 ${formatMinutes(base.minutes)})`}
              {base.source === "template" && ` (유형 기본값 ${formatMinutes(base.minutes)})`}
              {base.source === "generic" && " (예상 시간 미입력, 기본값)"}.
            </p>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const startsAt = localDateTimeToIso(
                  String(fd.get("date")),
                  String(fd.get("time")),
                  timezone,
                );
                run(() => scheduleTaskAction({ taskId: task.id, startsAt }), {
                  success: "일정에 추가했습니다.",
                });
              }}
            >
              <Field label="날짜" htmlFor="schedule-date">
                <Input id="schedule-date" name="date" type="date" required defaultValue={task.target_date ?? today} />
              </Field>
              <Field label="시작" htmlFor="schedule-time">
                <Input
                  id="schedule-time"
                  name="time"
                  type="time"
                  required
                  step={settings.slot_minutes * 60}
                  defaultValue={settings.workday_start.slice(0, 5)}
                />
              </Field>
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                추가
              </Button>
            </form>
          </section>
        )}

        {/* ── Blocks in view ─────────────────────────────────── */}
        {blocks.length > 0 && (
          <section aria-labelledby="blocks-heading" className="space-y-2">
            <h3 id="blocks-heading" className="text-sm font-semibold">
              이번 주 일정
            </h3>
            <ul className="divide-y divide-border rounded-md border border-border">
              {blocks
                .slice()
                .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                .map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="tabular-nums">
                      {toLocalDate(b.starts_at, timezone).slice(5)} {toLocalTime(b.starts_at, timezone)}–
                      {toLocalTime(b.ends_at, timezone)}
                      <span className="ml-2 text-xs text-muted-foreground">{BLOCK_STATUS_LABEL[b.status]}</span>
                    </span>
                    <span className="flex gap-1">
                      {b.status === "planned" ? (
                        <>
                          <BlockButton blockId={b.id} status="completed" label="완료" />
                          <BlockButton blockId={b.id} status="skipped" label="건너뜀" />
                          <BlockButton blockId={b.id} status="cancelled" label="삭제" />
                        </>
                      ) : (
                        <BlockButton blockId={b.id} status="planned" label="되돌리기" />
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        )}

        {/* ── Task lifecycle ─────────────────────────────────── */}
        <section aria-label="작업 상태" className="flex flex-wrap gap-2 border-t border-border pt-4">
          {isOpen && (
            <Button size="sm" disabled={pending} onClick={() => run(() => completeTaskAction({ taskId: task.id }))}>
              완료
            </Button>
          )}
          {task.status === "completed" && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reopenTaskAction({ taskId: task.id }))}>
              다시 열기
            </Button>
          )}
          {isOpen && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => cancelTaskAction({ taskId: task.id }), { onSuccess: onClose })}>
              작업 취소
            </Button>
          )}
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => deleteTaskAction({ taskId: task.id }), { onSuccess: onClose })}
              >
                영구 삭제 확인
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                아니오
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              삭제
            </Button>
          )}
        </section>
      </div>
    </>
  );
}

function BlockButton({
  blockId,
  status,
  label,
}: {
  blockId: string;
  status: "planned" | "completed" | "skipped" | "cancelled";
  label: string;
}) {
  const { run, pending } = useActionRunner();
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={() => run(() => setScheduleBlockStatusAction({ blockId, status }))}
    >
      {label}
    </Button>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ScoreSelect({ id, name, defaultValue }: { id: string; name: string; defaultValue: number }) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
