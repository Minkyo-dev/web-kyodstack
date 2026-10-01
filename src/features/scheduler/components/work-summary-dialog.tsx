"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { stopWorkSessionAction } from "../actions/work-session.actions";
import type { SessionWithTask } from "../domain/work-session.types";
import { formatMinutes } from "../utils/duration";
import { describeDifference, focusStats, remainingMinutes } from "../utils/focus";
import { localDateTimeToIso, toLocalDate, toLocalTime, todayLocalDate } from "../utils/timezone";
import { readScore, ScoreInput } from "./score-input";
import { useTerms } from "@/hooks/use-terms";
import { josa } from "@/lib/terms";

/**
 * Finish a focus session (requirements §14): facts first, optional ratings, then the user
 * decides whether the task is done. Closing the dialog saves nothing; the timer keeps running.
 */
export function WorkSummaryDialog({
  session,
  plannedMinutes,
  estimateMinutes,
  priorActualMinutes,
  timezone,
  onClose,
  onDone,
}: {
  session: SessionWithTask | null;
  plannedMinutes: number | null;
  estimateMinutes: number | null;
  priorActualMinutes: number;
  timezone: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { run, pending } = useActionRunner();
  const terms = useTerms();
  const formRef = useRef<HTMLFormElement>(null);
  if (!session) return null;

  const stats = focusStats(session, session.pauses);
  const focusedMin = stats.focusedMs / 60_000;
  const today = todayLocalDate(timezone);

  const submit = (form: HTMLFormElement, completeTask: boolean) => {
    const fd = new FormData(form);
    let endedAt: string | undefined;
    if (fd.get("endEdited") === "1") {
      endedAt = localDateTimeToIso(String(fd.get("endDate")), String(fd.get("endTime")), timezone);
    }
    run(
      () =>
        stopWorkSessionAction({
          sessionId: session.id,
          endedAt,
          focusScore: readScore(fd, "focusScore"),
          moodScore: readScore(fd, "moodScore"),
          energyScore: readScore(fd, "energyScore"),
          note: String(fd.get("note") ?? "").trim() || null,
          completeTask,
        }),
      {
        success: completeTask ? `${josa(terms.task, "을/를")} 완료했습니다.` : undefined,
        onSuccess: () => {
          if (!completeTask) {
            const left = remainingMinutes(estimateMinutes, priorActualMinutes + focusedMin);
            toast.success(
              left ? `남은 예상 ${formatMinutes(left)} — 캘린더로 끌어다 놓으세요.` : "작업 시간을 기록했습니다.",
            );
          }
          onDone();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            submit(e.currentTarget, submitter?.value === "complete");
          }}
          onChange={(e) => {
            const t = e.target as unknown as HTMLInputElement;
            if (t.name === "endTime" || t.name === "endDate") {
              (e.currentTarget.elements.namedItem("endEdited") as HTMLInputElement).value = "1";
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>작업 마치기</DialogTitle>
            <DialogDescription>{session.task.title}</DialogDescription>
          </DialogHeader>

          <dl className="my-4 grid grid-cols-3 gap-2 text-sm" aria-label="계획과 실제">
            <div>
              <dt className="text-xs text-muted-foreground">계획</dt>
              <dd className="font-medium tabular-nums">
                {plannedMinutes !== null ? formatMinutes(Math.round(plannedMinutes)) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">실제 작업</dt>
              <dd className="font-medium tabular-nums">{formatMinutes(Math.round(focusedMin))}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">차이</dt>
              <dd className="font-medium">
                {plannedMinutes !== null ? describeDifference(plannedMinutes, focusedMin) : "—"}
              </dd>
            </div>
          </dl>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <ScoreInput name="focusScore" label="집중" defaultValue={session.work_log?.focus_score} />
              <ScoreInput name="moodScore" label="기분" hint="선택" defaultValue={session.work_log?.mood_score} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="summary-note" className="text-xs text-muted-foreground">
                무엇을 했나요?
              </Label>
              <Textarea
                id="summary-note"
                name="note"
                rows={2}
                maxLength={5000}
                defaultValue={session.work_log?.note ?? ""}
              />
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">더보기</summary>
              <div className="mt-3 space-y-3">
                <ScoreInput name="energyScore" label="에너지" hint="선택" defaultValue={session.work_log?.energy_score} />
                <input type="hidden" name="endEdited" defaultValue="0" />
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="summary-end-date" className="text-xs text-muted-foreground">
                      종료 날짜
                    </Label>
                    <DatePicker
                      id="summary-end-date"
                      name="endDate"
                      defaultValue={today}
                      max={today}
                      // The picker fires no native change event on the form; flag the edit ourselves.
                      onChange={() => {
                        const flag = formRef.current?.elements.namedItem("endEdited") as HTMLInputElement | null;
                        if (flag) flag.value = "1";
                      }}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="summary-end-time" className="text-xs text-muted-foreground">
                      종료 시각 (기본: 지금)
                    </Label>
                    <Input
                      id="summary-end-time"
                      name="endTime"
                      type="time"
                      defaultValue={toLocalTime(new Date(), timezone)}
                    />
                  </div>
                </div>
              </div>
            </details>
            {toLocalDate(session.started_at, timezone) !== today && (
              <p className="text-xs text-warning">어제 시작한 타이머입니다. 더보기에서 종료 시각을 확인하세요.</p>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button type="submit" value="later" variant="outline" disabled={pending}>
              나중에 계속
            </Button>
            <Button type="submit" value="complete" disabled={pending}>
              {terms.task} 완료
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
