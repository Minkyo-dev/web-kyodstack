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
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { stopWorkSessionAction } from "../actions/work-session.actions";
import type { SessionWithTask } from "../domain/work-session.types";
import { localDateTimeToIso, toLocalDate, toLocalTime, todayLocalDate } from "../utils/timezone";
import { readScoreFields, SessionScoreFields } from "./session-score-fields";

/**
 * Stop = one write: end time + optional focus/mood/note (spec §24: don't force
 * too many inputs). The end time is editable for a timer that was left running.
 */
export function StopSessionDialog({
  session,
  timezone,
  onClose,
}: {
  session: SessionWithTask | null;
  timezone: string;
  onClose: () => void;
}) {
  const { run, pending } = useActionRunner();

  const stop = (fd: FormData | null) => {
    if (!session) return;
    let endedAt: string | undefined;
    const scores = fd ? readScoreFields(fd) : {};
    if (fd) {
      const time = String(fd.get("endTime") ?? "");
      const date = String(fd.get("endDate") ?? "");
      const custom = time && date ? localDateTimeToIso(date, time, timezone) : undefined;
      // Only send an explicit end if the user changed it; otherwise the server uses now().
      if (custom && fd.get("endEdited") === "1") endedAt = custom;
    }
    run(() => stopWorkSessionAction({ sessionId: session.id, endedAt, ...scores }), {
      success: "작업 시간을 기록했습니다.",
      onSuccess: onClose,
    });
  };

  const today = todayLocalDate(timezone);

  return (
    <Dialog open={session !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {session && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              stop(new FormData(e.currentTarget));
            }}
            onChange={(e) => {
              const t = e.target as unknown as HTMLInputElement;
              if (t.name === "endTime" || t.name === "endDate") {
                const flag = e.currentTarget.elements.namedItem("endEdited") as HTMLInputElement;
                flag.value = "1";
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>작업 종료</DialogTitle>
              <DialogDescription>
                {session.task.title} · {toLocalTime(session.started_at, timezone)} 시작
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-4">
              <SessionScoreFields />
              <input type="hidden" name="endEdited" defaultValue="0" />
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="stop-end-date" className="text-xs text-muted-foreground">
                    종료 날짜
                  </Label>
                  <Input id="stop-end-date" name="endDate" type="date" defaultValue={today} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="stop-end-time" className="text-xs text-muted-foreground">
                    종료 시각 (기본: 지금)
                  </Label>
                  <Input
                    id="stop-end-time"
                    name="endTime"
                    type="time"
                    defaultValue={toLocalTime(new Date(), timezone)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="stop-note" className="text-xs text-muted-foreground">
                  메모 (선택)
                </Label>
                <Textarea id="stop-note" name="note" rows={2} maxLength={2000} />
              </div>
              {toLocalDate(session.started_at, timezone) !== today && (
                <p className="text-xs text-warning">어제 시작한 타이머입니다. 종료 시각을 확인하세요.</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => stop(null)}>
                평가 없이 종료
              </Button>
              <Button type="submit" disabled={pending}>
                기록
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

