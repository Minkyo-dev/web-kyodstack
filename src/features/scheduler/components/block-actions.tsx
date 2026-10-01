"use client";

import { useState } from "react";
import { MoreHorizontal, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionRunner } from "@/hooks/use-action-runner";
import {
  rescheduleBlockAction,
  setScheduleBlockStatusAction,
  unscheduleBlockAction,
} from "../actions/schedule.actions";
import { completeTaskAction } from "../actions/task.actions";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext } from "../domain/task.types";
import { nextFreeSlot, sameTimeTomorrow, type BlockVisualState } from "../utils/block-state";
import { localDateTimeToIso, toLocalDate, toLocalTime } from "../utils/timezone";
import { useTerms } from "@/hooks/use-terms";

/** Stop FullCalendar from starting a drag or firing eventClick for our controls (Review Focus 5). */
const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onClick: (e: React.MouseEvent) => e.stopPropagation() };

export function BlockActions({
  block,
  state,
  blocks,
  context,
  now,
  inline,
  onStart,
}: {
  block: CalendarBlock;
  state: BlockVisualState;
  blocks: CalendarBlock[];
  context: SchedulerContext;
  now: Date;
  /** Tall not-started blocks show text buttons instead of icons. */
  inline: boolean;
  onStart: () => void;
}) {
  const { run, pending } = useActionRunner();
  const [picking, setPicking] = useState(false);
  const terms = useTerms();
  const { timezone, settings } = context;
  const taskOpen = block.task.status !== "completed" && block.task.status !== "cancelled";
  const actionable = state === "planned" || state === "not_started" || state === "missed";
  if (!taskOpen || !actionable) return null;

  const length = (new Date(block.ends_at).getTime() - new Date(block.starts_at).getTime()) / 60_000;
  const today = nextFreeSlot({
    now,
    lengthMinutes: length,
    blocks,
    excludeBlockId: block.id,
    timezone,
    workdayStart: settings.workday_start,
  });
  const tomorrow = sameTimeTomorrow(block.starts_at, timezone);
  const reschedule = (startsAt: string) =>
    run(() => rescheduleBlockAction({ blockId: block.id, startsAt }), { success: "일정을 다시 잡았습니다." });
  const canStart = state !== "missed";

  return (
    <span className="flex items-center gap-0.5" {...stop}>
      {canStart &&
        (inline ? (
          <Button size="xs" variant="secondary" disabled={pending} onClick={onStart}>
            지금 시작
          </Button>
        ) : (
          <button
            type="button"
            aria-label={`${block.task.title} 시작`}
            onClick={onStart}
            className="rounded-sm p-0.5 hover:bg-background/60"
          >
            <Play className="size-3" aria-hidden />
          </button>
        ))}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${block.task.title} 일정 메뉴`}
          className="rounded-sm p-0.5 hover:bg-background/60"
        >
          <MoreHorizontal className="size-3" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onClick={() => run(() => completeTaskAction({ taskId: block.task_id }))}>
            {terms.task} 완료
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>다시 잡기</DropdownMenuLabel>
            {today && (
              <DropdownMenuItem onClick={() => reschedule(today)}>오늘 {toLocalTime(today, timezone)}</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => reschedule(tomorrow)}>
              내일 {toLocalTime(tomorrow, timezone)}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPicking(true)}>시간 선택…</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {state !== "missed" && (
            <DropdownMenuItem
              onClick={() => run(() => setScheduleBlockStatusAction({ blockId: block.id, status: "skipped" }))}
            >
              건너뛰기
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => run(() => unscheduleBlockAction({ blockId: block.id }))}>
            미배정으로
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const startsAt = localDateTimeToIso(String(fd.get("date")), String(fd.get("time")), timezone);
              run(() => rescheduleBlockAction({ blockId: block.id, startsAt }), {
                success: "일정을 다시 잡았습니다.",
                onSuccess: () => setPicking(false),
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>시간 선택</DialogTitle>
            </DialogHeader>
            <div className="my-4 flex gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`pick-date-${block.id}`} className="text-xs text-muted-foreground">
                  날짜
                </Label>
                <DatePicker
                  id={`pick-date-${block.id}`}
                  name="date"
                  required
                  weekStartsOn={settings.week_starts_on}
                  defaultValue={toLocalDate(tomorrow, timezone)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor={`pick-time-${block.id}`} className="text-xs text-muted-foreground">
                  시작 시각
                </Label>
                <Input id={`pick-time-${block.id}`} name="time" type="time" required defaultValue={toLocalTime(block.starts_at, timezone)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                다시 잡기
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </span>
  );
}
