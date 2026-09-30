"use client";

import type { EventContentArg } from "@fullcalendar/core";
import { AlertTriangle, Check, Lock, SkipForward, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { BLOCK_STATUS_LABEL } from "../domain/scheduler.constants";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext } from "../domain/task.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { blockState } from "../utils/block-state";
import { formatMinutes } from "../utils/duration";
import { toLocalTime } from "../utils/timezone";
import { BlockActions } from "./block-actions";

/** Status is shown with icon + text, never color alone (spec §14.4). */
export function CalendarEventContent({
  arg,
  timezone,
  context,
  blocks,
  sessions,
  now,
  onStartBlock,
}: {
  arg: EventContentArg;
  timezone: string;
  context: SchedulerContext;
  blocks: CalendarBlock[];
  sessions: SessionWithTask[];
  now: Date;
  onStartBlock: (block: CalendarBlock) => void;
}) {
  const session = arg.event.extendedProps.session as SessionWithTask | undefined;
  if (session) return <SessionContent arg={arg} session={session} timezone={timezone} />;

  const block = arg.event.extendedProps.block as CalendarBlock | undefined;
  if (!block) {
    // Drag mirror of an external task: show the recommendation (Task 7 fills `recommendedMinutes`).
    const rec = arg.event.extendedProps.recommendedMinutes as number | undefined;
    return (
      <div className="flex h-full flex-col overflow-hidden px-1 py-0.5 leading-tight">
        <p className="truncate text-xs font-medium">{arg.event.title}</p>
        {rec && <p className="truncate text-[11px] opacity-80">추천 {formatMinutes(rec)}</p>}
      </div>
    );
  }
  const state = blockState(block, sessions, now);
  const start = arg.event.start;
  const end = arg.event.end;
  const time = start && end ? `${toLocalTime(start, timezone)}–${toLocalTime(end, timezone)}` : arg.timeText;
  const tall = start && end ? end.getTime() - start.getTime() >= 45 * 60_000 : false;

  return (
    <div className="group/block flex h-full flex-col overflow-hidden px-1 py-0.5 leading-tight">
      <div className="flex items-start gap-1">
        <p className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs font-medium">
          {state === "completed" && <Check className="size-3 shrink-0" aria-hidden />}
          {state === "skipped" && <SkipForward className="size-3 shrink-0" aria-hidden />}
          {(state === "not_started" || state === "missed") && <AlertTriangle className="size-3 shrink-0" aria-hidden />}
          {block.is_locked && <Lock className="size-3 shrink-0" aria-hidden />}
          <span className="truncate">{arg.event.title}</span>
        </p>
        {!arg.isMirror && (
          <span
            className={cn(
              "shrink-0",
              state === "not_started" || state === "missed" ? "" : "md:opacity-0 md:group-hover/block:opacity-100 md:focus-within:opacity-100",
            )}
          >
            <BlockActions
              block={block}
              state={state}
              blocks={blocks}
              context={context}
              now={now}
              inline={false}
              onStart={() => onStartBlock(block)}
            />
          </span>
        )}
      </div>
      <p className="truncate text-[11px] tabular-nums opacity-80">
        {time}
        {state === "not_started" && " · 시작 안 함"}
        {state === "missed" && " · 놓침"}
        {state === "running" && " · 진행 중"}
        {(state === "completed" || state === "skipped") && ` · ${BLOCK_STATUS_LABEL[state]}`}
      </p>
      {state === "not_started" && tall && !arg.isMirror && (
        <div className="mt-1">
          <BlockActions
            block={block}
            state={state}
            blocks={blocks}
            context={context}
            now={now}
            inline
            onStart={() => onStartBlock(block)}
          />
        </div>
      )}
    </div>
  );
}

/** Actual work: labelled "실제" so plan and actual never look alike (spec §3.2). */
function SessionContent({
  arg,
  session,
  timezone,
}: {
  arg: EventContentArg;
  session: SessionWithTask;
  timezone: string;
}) {
  const running = session.ended_at === null;
  const start = toLocalTime(session.started_at, timezone);
  const end = running ? "진행 중" : toLocalTime(session.ended_at!, timezone);
  return (
    <div className="flex h-full flex-col overflow-hidden px-1 py-0.5 leading-tight">
      <p className="flex items-center gap-1 truncate text-[11px] font-medium">
        <Timer className="size-3 shrink-0" aria-hidden />
        <span className="truncate">실제 · {arg.event.title}</span>
      </p>
      <p className="truncate text-[11px] tabular-nums opacity-80">
        {start}–{end}
        {session.work_log?.focus_score != null && ` · 집중 ${session.work_log.focus_score}`}
      </p>
    </div>
  );
}
