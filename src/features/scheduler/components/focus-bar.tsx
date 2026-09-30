"use client";

import { useState } from "react";
import { Pause, Play, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import {
  pauseWorkSessionAction,
  resumeWorkSessionAction,
  saveWorkLogNoteAction,
  setPauseReasonAction,
} from "../actions/work-session.actions";
import { PAUSE_REASON_LABEL, PAUSE_REASONS } from "../domain/scheduler.constants";
import type { SessionWithTask } from "../domain/work-session.types";
import { formatMinutes } from "../utils/duration";
import { describeRemaining, focusStats } from "../utils/focus";
import { formatElapsed } from "../utils/metrics";

/** Bottom focus bar (requirements §10). The clock shows focused time; paused freezes it. */
export function FocusBar({
  session,
  plannedMinutes,
  onFinish,
}: {
  session: SessionWithTask | null;
  plannedMinutes: number | null;
  onFinish: () => void;
}) {
  const { run, pending } = useActionRunner();
  const [expanded, setExpanded] = useState(false);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const openPause = session?.pauses.find((p) => p.resumed_at === null) ?? null;
  const now = useNow(1000, session !== null && openPause === null);
  if (!session) return null;

  const stats = focusStats(session, session.pauses, now);
  const focusedMin = stats.focusedMs / 60_000;

  const pause = () =>
    run(() => pauseWorkSessionAction({ sessionId: session.id }), { onSuccess: (p) => setReasonFor(p.id) });
  const resume = () =>
    run(() => resumeWorkSessionAction({ sessionId: session.id }), { onSuccess: () => setReasonFor(null) });

  return (
    <>
      <div
        role="status"
        aria-label="집중 중인 작업"
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 py-2 text-sm",
          stats.paused ? "border-border bg-muted" : "border-planned/40 bg-planned/10",
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-label="집중 상세 열기"
        >
          {stats.paused ? (
            <Pause className="size-4 shrink-0" aria-hidden />
          ) : (
            <Timer className="size-4 shrink-0 text-planned" aria-hidden />
          )}
          <span className="truncate font-medium">{session.task.title}</span>
          <span className="font-mono tabular-nums">{formatElapsed(stats.focusedMs)}</span>
          {stats.paused && <span className="text-xs text-muted-foreground">일시정지됨</span>}
        </button>

        {reasonFor && stats.paused && (
          <div role="group" aria-label="일시정지 이유" className="flex flex-wrap gap-1">
            {PAUSE_REASONS.map((r) => (
              <Button
                key={r}
                size="xs"
                variant="outline"
                onClick={() =>
                  run(() => setPauseReasonAction({ pauseId: reasonFor, reason: r }), {
                    onSuccess: () => setReasonFor(null),
                  })
                }
              >
                {PAUSE_REASON_LABEL[r]}
              </Button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5">
          {stats.paused ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={resume}>
              <Play aria-hidden />
              재개
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={pause}>
              <Pause aria-hidden />
              일시정지
            </Button>
          )}
          <Button size="sm" disabled={pending} onClick={onFinish}>
            <Square aria-hidden className="fill-current" />
            종료
          </Button>
        </div>
      </div>

      <Sheet open={expanded} onOpenChange={setExpanded}>
        <SheetContent side="bottom" className="mx-auto max-w-lg p-4">
          <SheetHeader className="p-0">
            <SheetTitle>{session.task.title}</SheetTitle>
            <SheetDescription className="font-mono text-2xl tabular-nums text-foreground">
              {formatElapsed(stats.focusedMs)}
            </SheetDescription>
          </SheetHeader>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">계획</dt>
            <dd className="tabular-nums">{plannedMinutes !== null ? formatMinutes(Math.round(plannedMinutes)) : "—"}</dd>
            <dt className="text-muted-foreground">경과</dt>
            <dd className="tabular-nums">{formatMinutes(Math.round(stats.elapsedMs / 60_000))}</dd>
            <dt className="text-muted-foreground">작업</dt>
            <dd className="tabular-nums">{formatMinutes(Math.round(focusedMin))}</dd>
            <dt className="text-muted-foreground">쉼</dt>
            <dd className="tabular-nums">{formatMinutes(Math.round(stats.pausedMs / 60_000))}</dd>
            {plannedMinutes !== null && (
              <>
                <dt className="text-muted-foreground">남은 시간</dt>
                <dd className="tabular-nums">{describeRemaining(plannedMinutes, focusedMin)}</dd>
              </>
            )}
          </dl>
          <div className="space-y-1">
            <Label htmlFor="focus-note" className="text-xs text-muted-foreground">
              작업 메모
            </Label>
            <Textarea
              id="focus-note"
              rows={3}
              maxLength={5000}
              defaultValue={session.work_log?.note ?? ""}
              onBlur={(e) => {
                const note = e.currentTarget.value.trim();
                if (note !== (session.work_log?.note ?? "")) {
                  run(() => saveWorkLogNoteAction({ sessionId: session.id, note }));
                }
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            {stats.paused ? (
              <Button variant="outline" disabled={pending} onClick={resume}>
                재개
              </Button>
            ) : (
              <Button variant="outline" disabled={pending} onClick={pause}>
                일시정지
              </Button>
            )}
            <Button
              disabled={pending}
              onClick={() => {
                setExpanded(false);
                onFinish();
              }}
            >
              종료
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
