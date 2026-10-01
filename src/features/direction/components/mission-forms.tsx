"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import { createMissionAction, updateMissionAction } from "../actions/direction.actions";
import { MISSION_STATUSES, MISSION_STATUS_LABEL, type Identity, type MissionDetail } from "../domain/direction.types";

const selectClass = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export function MissionCreateForm() {
  const terms = useTerms();
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const ref = useRef<HTMLFormElement>(null);
  const [resetKey, setResetKey] = useState(0);
  return (
    <form
      ref={ref}
      aria-label={`새 ${terms.mission}`}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => createMissionAction({ title: str(fd, "title"), deadline: str(fd, "deadline") || null }), {
          onSuccess: (m) => {
            ref.current?.reset();
            setResetKey((k) => k + 1);
            router.push(`/scheduler/directive?mission=${m.id}#mission-detail`);
          },
        });
      }}
    >
      <Label htmlFor="mission-title" className="text-xs text-muted-foreground">
        {`${terms.mission} 이름`}
      </Label>
      <Input id="mission-title" name="title" required maxLength={120} />
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="mission-deadline" className="text-xs text-muted-foreground">
            기한 (선택)
          </Label>
          <DatePicker key={resetKey} id="mission-deadline" name="deadline" clearable />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          만들기
        </Button>
      </div>
    </form>
  );
}

export function MissionSettingsForm({ detail, identities }: { detail: MissionDetail; identities: Identity[] }) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  const { mission } = detail;
  const choosable = identities.filter((i) => i.status === "active" || mission.identityIds.includes(i.id));
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">{`${terms.mission} 설정`}</summary>
      <form
        aria-label={`${terms.mission} 설정`}
        className="mt-3 space-y-3"
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
            { success: "저장했습니다." },
          );
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="mission-edit-title" className="text-xs text-muted-foreground">이름</Label>
          <Input id="mission-edit-title" name="title" required maxLength={120} defaultValue={mission.title} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mission-edit-outcome" className="text-xs text-muted-foreground">기대 결과</Label>
          <Textarea id="mission-edit-outcome" name="outcome" rows={2} maxLength={500} defaultValue={mission.outcome ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="mission-edit-deadline" className="text-xs text-muted-foreground">기한</Label>
            <DatePicker id="mission-edit-deadline" name="deadline" clearable defaultValue={mission.deadline} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mission-edit-status" className="text-xs text-muted-foreground">상태</Label>
            <select id="mission-edit-status" name="status" defaultValue={mission.status} className={selectClass}>
              {MISSION_STATUSES.map((s) => (
                <option key={s} value={s}>{MISSION_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
        {choosable.length > 0 && (
          <fieldset className="space-y-1">
            <legend className="text-xs text-muted-foreground">{terms.identity} (최대 6개)</legend>
            <div className="flex flex-wrap gap-3">
              {choosable.map((i) => (
                <label key={i.id} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="identityIds" value={i.id} defaultChecked={mission.identityIds.includes(i.id)} />
                  {i.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Button type="submit" size="sm" disabled={pending}>저장</Button>
      </form>
    </details>
  );
}
