"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { createTaskAction } from "@/features/scheduler/actions/task.actions";
import {
  createMilestoneAction,
  createProjectAction,
  updateMilestoneAction,
  updateProjectAction,
} from "../actions/project.actions";
import {
  MILESTONE_STATUSES,
  MILESTONE_STATUS_LABEL,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  type Milestone,
  type Project,
} from "../domain/project.types";

const selectClass =
  "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (v: string) => (v === "" ? null : v);

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

export function ProjectCreateForm() {
  const { run, pending } = useActionRunner();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      aria-label="새 프로젝트"
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => createProjectAction({ name: str(fd, "name"), targetDate: orNull(str(fd, "targetDate")) }), {
          success: "프로젝트를 만들었습니다.",
          onSuccess: () => ref.current?.reset(),
        });
      }}
    >
      <Field label="프로젝트 이름" htmlFor="new-project-name">
        <Input id="new-project-name" name="name" required maxLength={120} autoComplete="off" />
      </Field>
      <div className="w-40">
        <Field label="목표일 (선택)" htmlFor="new-project-target">
          <Input id="new-project-target" name="targetDate" type="date" />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        <Plus aria-hidden />
        만들기
      </Button>
    </form>
  );
}

export function ProjectEditForm({ project }: { project: Project }) {
  const { run, pending } = useActionRunner();
  return (
    <form
      aria-label="프로젝트 편집"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          () =>
            updateProjectAction({
              projectId: project.id,
              name: str(fd, "name"),
              description: orNull(str(fd, "description")),
              status: str(fd, "status"),
              priority: Number(fd.get("priority")),
              startDate: orNull(str(fd, "startDate")),
              targetDate: orNull(str(fd, "targetDate")),
            }),
          { success: "저장했습니다." },
        );
      }}
    >
      <Field label="이름" htmlFor="project-name">
        <Input id="project-name" name="name" defaultValue={project.name} required maxLength={120} />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="상태" htmlFor="project-status">
          <select id="project-status" name="status" defaultValue={project.status} className={selectClass}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="우선순위" htmlFor="project-priority">
          <select id="project-priority" name="priority" defaultValue={project.priority} className={selectClass}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="시작일" htmlFor="project-start">
          <Input id="project-start" name="startDate" type="date" defaultValue={project.start_date ?? ""} />
        </Field>
        <Field label="목표일" htmlFor="project-target">
          <Input id="project-target" name="targetDate" type="date" defaultValue={project.target_date ?? ""} />
        </Field>
      </div>
      <Field label="설명" htmlFor="project-description">
        <Textarea
          id="project-description"
          name="description"
          rows={2}
          maxLength={5000}
          defaultValue={project.description ?? ""}
        />
      </Field>
      <Button type="submit" size="sm" disabled={pending}>
        저장
      </Button>
    </form>
  );
}

export function MilestoneCreateForm({ projectId }: { projectId: string }) {
  const { run, pending } = useActionRunner();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      aria-label="새 마일스톤"
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          () =>
            createMilestoneAction({ projectId, name: str(fd, "name"), targetDate: orNull(str(fd, "targetDate")) }),
          { onSuccess: () => ref.current?.reset() },
        );
      }}
    >
      <Field label="마일스톤 이름" htmlFor="new-milestone-name">
        <Input id="new-milestone-name" name="name" required maxLength={120} autoComplete="off" />
      </Field>
      <div className="w-40">
        <Field label="목표일 (선택)" htmlFor="new-milestone-target">
          <Input id="new-milestone-target" name="targetDate" type="date" />
        </Field>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        <Plus aria-hidden />
        마일스톤 추가
      </Button>
    </form>
  );
}

/** Inline status/date/name edit for one milestone. */
export function MilestoneEditor({ milestone }: { milestone: Milestone }) {
  const { run, pending } = useActionRunner();
  const [editing, setEditing] = useState(false);
  const save = (patch: Partial<{ name: string; status: string; targetDate: string | null }>) =>
    run(() =>
      updateMilestoneAction({
        milestoneId: milestone.id,
        name: patch.name ?? milestone.name,
        description: milestone.description,
        status: patch.status ?? milestone.status,
        targetDate: patch.targetDate !== undefined ? patch.targetDate : milestone.target_date,
        sortOrder: milestone.sort_order,
      }),
    );

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`ms-status-${milestone.id}`}>
          {milestone.name} 상태
        </label>
        <select
          id={`ms-status-${milestone.id}`}
          defaultValue={milestone.status}
          disabled={pending}
          onChange={(e) => save({ status: e.target.value })}
          className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs dark:bg-input/30"
        >
          {MILESTONE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MILESTONE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
          편집
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      aria-label={`${milestone.name} 편집`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        save({ name: str(fd, "name"), targetDate: orNull(str(fd, "targetDate")) }).then((r) => {
          if (r.ok) setEditing(false);
        });
      }}
    >
      <Field label="이름" htmlFor={`ms-name-${milestone.id}`}>
        <Input id={`ms-name-${milestone.id}`} name="name" defaultValue={milestone.name} required maxLength={120} />
      </Field>
      <div className="w-40">
        <Field label="목표일" htmlFor={`ms-target-${milestone.id}`}>
          <Input
            id={`ms-target-${milestone.id}`}
            name="targetDate"
            type="date"
            defaultValue={milestone.target_date ?? ""}
          />
        </Field>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        저장
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        취소
      </Button>
    </form>
  );
}

/** Add a task directly under a milestone (or the project when milestoneId is null). */
export function TaskQuickAdd({
  projectId,
  milestoneId,
  label,
}: {
  projectId: string;
  milestoneId: string | null;
  label: string;
}) {
  const { run, pending } = useActionRunner();
  const ref = useRef<HTMLFormElement>(null);
  const id = milestoneId ?? `project-${projectId}`;
  return (
    <form
      ref={ref}
      aria-label={`${label}에 할 일 추가`}
      className="flex gap-1.5 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const est = str(fd, "estimate");
        run(
          () =>
            createTaskAction({
              title: str(fd, "title"),
              userEstimatedMinutes: est ? Number(est) : undefined,
              projectId,
              milestoneId,
            }),
          { onSuccess: () => ref.current?.reset() },
        );
      }}
    >
      <label htmlFor={`qa-title-${id}`} className="sr-only">
        {label} 할 일
      </label>
      <Input id={`qa-title-${id}`} name="title" placeholder="할 일 추가" required maxLength={200} autoComplete="off" />
      <label htmlFor={`qa-est-${id}`} className="sr-only">
        예상 시간(분)
      </label>
      <Input
        id={`qa-est-${id}`}
        name="estimate"
        type="number"
        min={5}
        max={720}
        step={5}
        placeholder="분"
        className="w-20"
      />
      <Button type="submit" size="icon" variant="outline" disabled={pending} aria-label={`${label}에 할 일 추가`}>
        <Plus aria-hidden />
      </Button>
    </form>
  );
}
