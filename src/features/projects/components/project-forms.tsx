"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { createTaskAction } from "@/features/scheduler/actions/task.actions";
import {
  createMilestoneAction,
  createProjectAction,
  setProjectArchivedAction,
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
import { useTerms } from "@/hooks/use-terms";
import type { DirectionRef, MissionOption } from "@/features/direction/domain/direction.types";
import { josa } from "@/lib/terms";
import { nativeSelectClass, nativeSelectSmClass } from "@/components/ui/native-select";

const selectClass = `${nativeSelectClass} w-full`;

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
  const terms = useTerms();
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const ref = useRef<HTMLFormElement>(null);
  // Remounts the date picker after a successful create (form.reset() can't clear it).
  const [resetKey, setResetKey] = useState(0);
  return (
    <form
      ref={ref}
      aria-label={`새 ${terms.project}`}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => createProjectAction({ name: str(fd, "name"), targetDate: orNull(str(fd, "targetDate")) }), {
          success: `${josa(terms.project, "을/를")} 만들었습니다.`,
          onSuccess: (project) => {
            ref.current?.reset();
            setResetKey((k) => k + 1);
            // Select the new project so milestones and tasks can be added right away.
            router.push(`/scheduler/projects?project=${project.id}`);
          },
        });
      }}
    >
      <Field label={`${terms.project} 이름`} htmlFor="new-project-name">
        <Input id="new-project-name" name="name" required maxLength={120} autoComplete="off" />
      </Field>
      {/* Name gets its own row: the form lives in a narrow side pane. */}
      <div className="flex items-end gap-2">
        <Field label="목표일 (선택)" htmlFor="new-project-target">
          <DatePicker key={resetKey} id="new-project-target" name="targetDate" clearable />
        </Field>
        <Button type="submit" disabled={pending}>
          <Plus aria-hidden />
          만들기
        </Button>
      </div>
    </form>
  );
}

export function ProjectEditForm({
  project,
  missionOptions,
  mission,
}: {
  project: Project;
  missionOptions: MissionOption[];
  mission: DirectionRef | null;
}) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  return (
    <form
      aria-label={`${terms.project} 편집`}
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
              missionId: orNull(str(fd, "missionId")),
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
          <DatePicker id="project-start" name="startDate" clearable defaultValue={project.start_date} />
        </Field>
        <Field label="목표일" htmlFor="project-target">
          <DatePicker id="project-target" name="targetDate" clearable defaultValue={project.target_date} />
        </Field>
      </div>
      <Field label={terms.mission} htmlFor="project-mission">
        <select id="project-mission" name="missionId" defaultValue={project.mission_id ?? ""} className={selectClass}>
          <option value="">없음</option>
          {mission && !missionOptions.some((m) => m.id === mission.id) && <option value={mission.id}>{mission.title}</option>}
          {missionOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </Field>
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
  const [resetKey, setResetKey] = useState(0);
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
          {
            onSuccess: () => {
              ref.current?.reset();
              setResetKey((k) => k + 1);
            },
          },
        );
      }}
    >
      <Field label="마일스톤 이름" htmlFor="new-milestone-name">
        <Input id="new-milestone-name" name="name" required maxLength={120} autoComplete="off" />
      </Field>
      <div className="w-40">
        <Field label="목표일 (선택)" htmlFor="new-milestone-target">
          <DatePicker key={resetKey} id="new-milestone-target" name="targetDate" clearable />
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
          className={nativeSelectSmClass}
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
          <DatePicker
            id={`ms-target-${milestone.id}`}
            name="targetDate"
            clearable
            defaultValue={milestone.target_date}
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
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  const ref = useRef<HTMLFormElement>(null);
  const id = milestoneId ?? `project-${projectId}`;
  return (
    <form
      ref={ref}
      aria-label={`${label}에 ${terms.task} 추가`}
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
        {label} {terms.task}
      </label>
      <Input id={`qa-title-${id}`} name="title" placeholder={`${terms.task} 추가`} required maxLength={200} autoComplete="off" />
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
      <Button type="submit" size="icon" variant="outline" disabled={pending} aria-label={`${label}에 ${terms.task} 추가`}>
        <Plus aria-hidden />
      </Button>
    </form>
  );
}

/** Move the project into the archive folder or back (ADR 0024). Tasks and their links stay as they are. */
export function ProjectArchiveButton({ projectId, archived }: { projectId: string; archived: boolean }) {
  const { run, pending } = useActionRunner();
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(() => setProjectArchivedAction({ projectId, archived: !archived }), {
          success: archived ? "아카이브에서 꺼냈습니다." : "아카이브로 옮겼습니다.",
        })
      }
    >
      {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
      {archived ? "아카이브에서 꺼내기" : "아카이브로 이동"}
    </Button>
  );
}
