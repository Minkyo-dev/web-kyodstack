"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { upsertDailyReflectionAction } from "../actions/reflection.actions";
import type { DailyReflection } from "../domain/work-session.types";
import type { Task } from "../domain/task.types";
import { OPEN_TASK_STATUSES } from "../domain/scheduler.constants";
import { BLOCKERS, BLOCKER_LABEL, type Blocker } from "../schemas/reflection.schema";
import { formatMinutes } from "../utils/duration";
import type { DaySummary } from "../utils/metrics";
import { readScore, ScoreInput } from "./score-input";

/**
 * End-of-day (spec §38) and the evening check-in (ADR 0039): the app shows what it already knows; the user adds
 * mood/focus/energy, one win, what blocked most and tomorrow's one thing. Work captured by sessions is never re-entered.
 */
export function DailyReflectionDialog({
  open,
  date,
  summary,
  completed,
  total,
  tasks,
  reflection,
  onClose,
}: {
  open: boolean;
  date: string;
  summary: DaySummary;
  completed: number;
  total: number;
  /** Today's tasks; the open ones can be tomorrow's one thing. */
  tasks: Task[];
  reflection: DailyReflection | null;
  onClose: () => void;
}) {
  const { run, pending } = useActionRunner();
  const openTasks = tasks.filter((t) => (OPEN_TASK_STATUSES as readonly string[]).includes(t.status));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(
              () =>
                upsertDailyReflectionAction({
                  reflectionDate: date,
                  moodScore: readScore(fd, "mood"),
                  focusScore: readScore(fd, "focus"),
                  energyScore: readScore(fd, "energy"),
                  note: String(fd.get("note") ?? "").trim() || null,
                  win: String(fd.get("win") ?? "").trim() || null,
                  blocker: (String(fd.get("blocker") ?? "") || null) as Blocker | null,
                  nextTaskId: String(fd.get("nextTaskId") ?? "") || null,
                }),
              { success: "오늘 회고를 저장했습니다.", onSuccess: onClose },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>하루 마무리</DialogTitle>
            <DialogDescription>{date}</DialogDescription>
          </DialogHeader>

          <dl className="my-4 grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm">
            <Stat label="계획" value={formatMinutes(summary.plannedMinutes)} />
            <Stat label="실제" value={formatMinutes(summary.actualMinutes)} />
            <Stat label="완료" value={`${completed} / ${total}`} />
          </dl>
          {summary.runningMinutes > 0 && (
            <p className="-mt-2 mb-3 text-xs text-warning">
              실행 중인 타이머는 정지해야 실제 시간에 반영됩니다.
            </p>
          )}

          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <ScoreInput name="mood" label="기분" defaultValue={reflection?.mood_score} />
              <ScoreInput name="focus" label="집중" defaultValue={reflection?.focus_score} />
              <ScoreInput name="energy" label="에너지" defaultValue={reflection?.energy_score} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reflection-win" className="text-xs text-muted-foreground">
                오늘 잘한 한 가지 (선택)
              </Label>
              <Input id="reflection-win" name="win" maxLength={280} defaultValue={reflection?.win ?? ""} placeholder="예: 미루던 메일을 먼저 보냈다" />
            </div>
            <fieldset className="space-y-1">
              <legend className="text-xs text-muted-foreground">무엇이 가장 막았나요? (선택)</legend>
              <div className="flex flex-wrap gap-1.5">
                {BLOCKERS.map((b) => (
                  <label
                    key={b}
                    className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
                  >
                    <input type="radio" name="blocker" value={b} defaultChecked={reflection?.blocker === b} className="sr-only" />
                    {BLOCKER_LABEL[b]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1">
              <Label htmlFor="reflection-next" className="text-xs text-muted-foreground">
                내일 가장 먼저 할 한 가지 (선택)
              </Label>
              <select id="reflection-next" name="nextTaskId" defaultValue={reflection?.next_task_id ?? ""} className={`${nativeSelectClass} w-full`}>
                <option value="">정하지 않음</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">내일 아침 브리핑에 ‘오늘의 한 가지’로 나옵니다.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="reflection-note" className="text-xs text-muted-foreground">
                메모 (선택)
              </Label>
              <Textarea
                id="reflection-note"
                name="note"
                rows={3}
                maxLength={5000}
                defaultValue={reflection?.note ?? ""}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              닫기
            </Button>
            <Button type="submit" disabled={pending}>
              {reflection ? "수정" : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
