"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import {
  createManualWorkSessionAction,
  deleteWorkSessionAction,
  startWorkSessionAction,
} from "../actions/work-session.actions";
import { BLOCK_STATUS_LABEL, TASK_STATUS_LABEL } from "../domain/scheduler.constants";
import type { SessionWithTask, TaskPlanActual } from "../domain/work-session.types";
import { readScore, ScoreInput } from "./score-input";
import { estimateDuration, type DurationGroup, type GroupLabels } from "../utils/estimator";
import { DurationInsight } from "./duration-insight";
import type { ProjectOption } from "@/features/projects/domain/project.types";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext, Task, TaskTemplate } from "../domain/task.types";
import { formatMinutes } from "../utils/duration";
import { focusStats } from "../utils/focus";
import { localDateTimeToIso, toLocalDate, toLocalTime } from "../utils/timezone";
import { Play } from "lucide-react";

type SessionProps = {
  sessions: SessionWithTask[];
  planActual: TaskPlanActual | null;
  activeSession: SessionWithTask | null;
  durationGroups: DurationGroup[];
  labels: GroupLabels;
  projectOptions: ProjectOption[];
  /** Start this task; with another timer running this opens the switch dialog. */
  onStartTask: (task: Task) => void;
};

export function TaskDetailDrawer({
  task,
  blocks,
  sessions,
  planActual,
  activeSession,
  durationGroups,
  labels,
  projectOptions,
  onStartTask,
  templates,
  context,
  today,
  onClose,
}: SessionProps & {
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
            sessions={sessions}
            planActual={planActual}
            activeSession={activeSession}
            durationGroups={durationGroups}
            labels={labels}
            projectOptions={projectOptions}
            onStartTask={onStartTask}
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
  sessions,
  planActual,
  activeSession,
  durationGroups,
  labels,
  projectOptions,
  onStartTask,
  templates,
  context,
  today,
  onClose,
}: SessionProps & {
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
  const timerHere = activeSession?.task_id === task.id;
  const canStart = isOpen && !timerHere;
  // Starting from a block while another timer runs belongs to sub-project B.
  const canStartBlock = isOpen && activeSession === null;

  const estimate = estimateDuration(task, settings, durationGroups, labels);

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
        {/* ── Timer + plan vs actual (spec §4.1 #9, #12) ─────── */}
        <section aria-label="계획 대비 실제" className="space-y-3">
          <div className="flex items-center gap-2">
            {canStart && (
              <Button size="sm" disabled={pending} onClick={() => onStartTask(task)}>
                <Play aria-hidden />
                타이머 시작
              </Button>
            )}
            {timerHere && <p className="text-sm text-planned">이 작업의 타이머가 실행 중입니다.</p>}
            {isOpen && activeSession !== null && !timerHere && (
              <p className="text-xs text-muted-foreground">다른 작업의 타이머가 실행 중입니다.</p>
            )}
          </div>
          <PlanActualSummary planActual={planActual} estimate={task.user_estimated_minutes} />
        </section>

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
                  projectId: String(fd.get("projectId") ?? "") || null,
                  milestoneId: String(fd.get("milestoneId") ?? "") || null,
                  taskType: task.task_type,
                  domainId: task.practice_domain_id,
                  tagIds: task.tags.map((t) => t.id),
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
              <DatePicker
                id="task-target-date"
                name="targetDate"
                clearable
                weekStartsOn={settings.week_starts_on}
                defaultValue={task.target_date}
              />
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
          <ProjectPicker task={task} options={projectOptions} />
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
            <DurationInsight estimate={estimate} />
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
                <DatePicker
                  id="schedule-date"
                  name="date"
                  required
                  weekStartsOn={settings.week_starts_on}
                  defaultValue={task.target_date ?? today}
                />
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
                          {canStartBlock && (
                            <Button
                              size="xs"
                              disabled={pending}
                              onClick={() => run(() => startWorkSessionAction({ blockId: b.id }))}
                              aria-label="이 일정으로 타이머 시작"
                            >
                              <Play aria-hidden />
                              시작
                            </Button>
                          )}
                          <BlockButton blockId={b.id} status="completed" label="완료" />
                          <BlockButton blockId={b.id} status="skipped" label="건너뜀" />
                          <BlockButton blockId={b.id} status="cancelled" label="삭제" />
                        </>
                      ) : b.status === "missed" ? (
                        // Missed blocks are history; they can only be removed (ADR 0012).
                        <BlockButton blockId={b.id} status="cancelled" label="삭제" />
                      ) : (
                        <BlockButton blockId={b.id} status="planned" label="되돌리기" />
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        )}

        {/* ── Actual sessions (spec §4.1 #8, #10) ───────────── */}
        <section aria-labelledby="sessions-heading" className="space-y-2">
          <h3 id="sessions-heading" className="text-sm font-semibold">
            실제 작업 기록
          </h3>
          {sessions.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {sessions.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="tabular-nums">
                    {toLocalDate(x.started_at, timezone).slice(5)} {toLocalTime(x.started_at, timezone)}–
                    {x.ended_at ? toLocalTime(x.ended_at, timezone) : "진행 중"}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {x.source === "manual" ? "수동" : "타이머"}
                      {x.ended_at && ` · ${formatMinutes(Math.round(focusStats(x, x.pauses).focusedMs / 60_000))}`}
                      {x.work_log?.focus_score != null && ` · 집중 ${x.work_log.focus_score}`}
                    </span>
                  </span>
                  {x.ended_at && (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={pending}
                      aria-label="작업 기록 삭제"
                      onClick={() => run(() => deleteWorkSessionAction({ sessionId: x.id }))}
                    >
                      삭제
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <ManualSessionForm taskId={task.id} timezone={timezone} today={today} />
        </section>

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

function PlanActualSummary({
  planActual,
  estimate,
}: {
  planActual: TaskPlanActual | null;
  estimate: number | null;
}) {
  const planned = planActual?.planned_minutes ?? 0;
  const actual = planActual?.actual_minutes ?? 0;
  const ratio = planned > 0 && actual > 0 ? actual / planned : null;
  return (
    <dl className="grid grid-cols-4 gap-2 rounded-md border border-border p-3 text-sm">
      <SummaryItem label="예상" value={estimate ? formatMinutes(estimate) : "—"} />
      <SummaryItem label="계획" value={formatMinutes(planned)} />
      <SummaryItem
        label="실제"
        value={formatMinutes(actual)}
        note={ratio !== null ? `계획의 ${Math.round(ratio * 100)}%` : undefined}
      />
      <SummaryItem
        label="집중"
        value={planActual?.average_focus != null ? planActual.average_focus.toFixed(1) : "—"}
        note={planActual?.reschedule_count ? `이동 ${planActual.reschedule_count}회` : undefined}
      />
    </dl>
  );
}

function SummaryItem({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
      {note && <dd className="text-[11px] text-muted-foreground">{note}</dd>}
    </div>
  );
}

/** Manual actual-work entry (spec §4.1 #10). Overlaps with other sessions are rejected server-side. */
function ManualSessionForm({ taskId, timezone, today }: { taskId: string; timezone: string; today: string }) {
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        수동으로 기록 추가
      </Button>
    );
  }
  return (
    <form
      aria-label="수동 작업 기록"
      className="space-y-3 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const date = String(fd.get("date"));
        run(
          () =>
            createManualWorkSessionAction({
              taskId,
              startedAt: localDateTimeToIso(date, String(fd.get("start")), timezone),
              endedAt: localDateTimeToIso(date, String(fd.get("end")), timezone),
              focusScore: readScore(fd, "manualFocus"),
              note: String(fd.get("note") ?? "").trim() || null,
            }),
          {
            success: "작업 기록을 추가했습니다.",
            onSuccess: () => {
              form.reset();
              setOpen(false);
            },
          },
        );
      }}
    >
      <div className="flex gap-2">
        <Field label="날짜" htmlFor="manual-date">
          <DatePicker id="manual-date" name="date" required defaultValue={today} max={today} />
        </Field>
        <Field label="시작" htmlFor="manual-start">
          <Input id="manual-start" name="start" type="time" required />
        </Field>
        <Field label="종료" htmlFor="manual-end">
          <Input id="manual-end" name="end" type="time" required />
        </Field>
      </div>
      <ScoreInput name="manualFocus" label="집중" hint="선택" />
      <Field label="메모 (선택)" htmlFor="manual-note">
        <Input id="manual-note" name="note" maxLength={2000} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          기록
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </form>
  );
}

/** Project + milestone selects. Milestones are filtered to the chosen project (spec §44). */
function ProjectPicker({ task, options }: { task: Task; options: ProjectOption[] }) {
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  // Keep the current link selectable even if that project/milestone is closed now.
  const all = [...options];
  if (task.project && !all.some((p) => p.id === task.project!.id)) {
    all.push({ id: task.project.id, name: task.project.name, milestones: [] });
  }
  const current = all.find((p) => p.id === projectId);
  const milestones = [...(current?.milestones ?? [])];
  if (task.milestone && task.project_id === projectId && !milestones.some((m) => m.id === task.milestone!.id)) {
    milestones.push(task.milestone);
  }
  const selectClass = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="프로젝트" htmlFor="task-project">
        <select
          id="task-project"
          name="projectId"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={selectClass}
        >
          <option value="">없음</option>
          {all.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="마일스톤" htmlFor="task-milestone">
        <select
          id="task-milestone"
          name="milestoneId"
          key={projectId}
          defaultValue={task.project_id === projectId ? (task.milestone_id ?? "") : ""}
          disabled={!projectId}
          className={selectClass}
        >
          <option value="">없음</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
