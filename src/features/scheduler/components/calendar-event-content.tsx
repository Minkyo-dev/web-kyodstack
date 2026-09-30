"use client";

import type { EventContentArg } from "@fullcalendar/core";
import { Check, Lock, SkipForward, Timer } from "lucide-react";
import { BLOCK_STATUS_LABEL } from "../domain/scheduler.constants";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { toLocalTime } from "../utils/timezone";

/** Status is shown with icon + text, never color alone (spec §14.4). */
export function CalendarEventContent({ arg, timezone }: { arg: EventContentArg; timezone: string }) {
  const session = arg.event.extendedProps.session as SessionWithTask | undefined;
  if (session) return <SessionContent arg={arg} session={session} timezone={timezone} />;

  const block = arg.event.extendedProps.block as CalendarBlock | undefined;
  const start = arg.event.start;
  const end = arg.event.end;
  const time =
    start && end ? `${toLocalTime(start, timezone)}–${toLocalTime(end, timezone)}` : arg.timeText;
  const status = block?.status ?? "planned";

  return (
    <div className="flex h-full flex-col overflow-hidden px-1 py-0.5 leading-tight">
      <p className="flex items-center gap-1 truncate text-xs font-medium">
        {status === "completed" && <Check className="size-3 shrink-0" aria-hidden />}
        {status === "skipped" && <SkipForward className="size-3 shrink-0" aria-hidden />}
        {block?.is_locked && <Lock className="size-3 shrink-0" aria-hidden />}
        <span className="truncate">{arg.event.title}</span>
      </p>
      <p className="truncate text-[11px] tabular-nums opacity-80">
        {time}
        {status !== "planned" && ` · ${BLOCK_STATUS_LABEL[status]}`}
      </p>
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
        {session.focus_score !== null && ` · 집중 ${session.focus_score}`}
      </p>
    </div>
  );
}
