"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { nativeSelectClass } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { TERMS } from "@/lib/terms";
import { updateMissionAction } from "../actions/direction.actions";
import { MISSION_STATUSES, MISSION_STATUS_LABEL, type Identity, type MissionDetail } from "../domain/direction.types";
import { Field, RolePicker, StepShell, str } from "./blueprint-ui";

/** Blueprint step 1: what changes, why, for which roles, by when, and its status. */
export function ChangeStep({ detail, identities, n }: { detail: MissionDetail; identities: Identity[]; n: number }) {
  const { run, pending } = useActionRunner();
  const [editing, setEditing] = useState(false);
  const { mission } = detail;
  const roles = identities.filter((i) => i.status === "active" || mission.identityIds.includes(i.id));
  const names = identities.filter((i) => mission.identityIds.includes(i.id)).map((i) => i.name);

  return (
    <StepShell
      n={n}
      title={TERMS.mission}
      question="무엇이 달라지길 원하나요? 결과물이 아니라 반복해서 하게 될 나를 적습니다."
      state="done"
      action={
        !editing && (
          <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {`${TERMS.mission} 설정`}
          </Button>
        )
      }
    >
      {editing ? (
        <form
          aria-label={`${TERMS.mission} 설정`}
          className="space-y-3 rounded-md border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(
              () =>
                updateMissionAction({
                  missionId: mission.id,
                  title: str(fd, "title"),
                  outcome: str(fd, "outcome") || null,
                  deadline: str(fd, "deadline") || null,
                  identityIds: fd.getAll("identityIds").map(String),
                  status: str(fd, "status"),
                }),
              { success: "저장했습니다.", onSuccess: () => setEditing(false) },
            );
          }}
        >
          <Field id="mission-edit-title" label="이름">
            <Input id="mission-edit-title" name="title" required maxLength={120} defaultValue={mission.title} />
          </Field>
          <Field id="mission-edit-outcome" label="왜 이 변화를 원하나요?">
            <Textarea id="mission-edit-outcome" name="outcome" rows={2} maxLength={500} defaultValue={mission.outcome ?? ""} />
          </Field>
          <RolePicker roles={roles} selected={mission.identityIds} idPrefix="mission-edit" />
          <div className="grid grid-cols-2 gap-3">
            <Field id="mission-edit-deadline" label="기한">
              <DatePicker id="mission-edit-deadline" name="deadline" clearable defaultValue={mission.deadline} />
            </Field>
            <Field id="mission-edit-status" label="상태">
              <select id="mission-edit-status" name="status" defaultValue={mission.status} className={`${nativeSelectClass} w-full`}>
                {MISSION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MISSION_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              저장
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {mission.outcome && (
            <>
              <dt className="text-xs text-muted-foreground">이유</dt>
              <dd className="whitespace-pre-line">{mission.outcome}</dd>
            </>
          )}
          <dt className="text-xs text-muted-foreground">{TERMS.identity}</dt>
          <dd>{names.length > 0 ? names.join(" · ") : <span className="text-muted-foreground">연결 안 됨</span>}</dd>
        </dl>
      )}
    </StepShell>
  );
}
