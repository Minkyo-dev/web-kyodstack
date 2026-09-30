"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type {
  DateSelectArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import koLocale from "@fullcalendar/core/locales/ko";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, {
  type EventReceiveArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import {
  moveScheduleBlockAction,
  scheduleTaskAction,
} from "../actions/schedule.actions";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext, Task } from "../domain/task.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { blockState } from "../utils/block-state";
import { findOverlaps } from "../utils/calendar";
import { CalendarEventContent } from "./calendar-event-content";
import { CreateInRangeDialog } from "./create-in-range-dialog";

function minutesToDuration(minutes: number) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}:00`;
}

export function WeeklyCalendar({
  blocks: serverBlocks,
  sessions,
  tasksById,
  context,
  week,
  today,
  showActual,
  onStartBlock,
  onOpenTask,
}: {
  blocks: CalendarBlock[];
  sessions: SessionWithTask[];
  tasksById: Map<string, Task>;
  context: SchedulerContext;
  week: { startDate: string; endDate: string; days: string[] };
  today: string;
  /** Overlay finished sessions; a running session is always shown. */
  showActual: boolean;
  onStartBlock: (block: CalendarBlock) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { timezone, settings } = context;
  const isMobile = useIsMobile();
  const calendarRef = useRef<FullCalendar>(null);

  // Local copy for optimistic updates; server props stay authoritative and
  // replace it after every revalidation (spec §40).
  const [blocks, setBlocks] = useState(serverBlocks);
  const [syncedFrom, setSyncedFrom] = useState(serverBlocks);
  if (syncedFrom !== serverBlocks) {
    setSyncedFrom(serverBlocks);
    setBlocks(serverBlocks);
  }

  const [pendingRange, setPendingRange] = useState<{ start: string; end: string } | null>(null);
  const [mobileDay, setMobileDay] = useState(
    today >= week.startDate && today < week.endDate ? today : week.startDate,
  );

  // Ticks every minute: running sessions grow and blocks turn "not started" / "missed" live.
  const now = useNow(60_000);

  // Plan (blocks) and actual (sessions) render side by side; they are never merged (spec §3.2).
  const events = useMemo<EventInput[]>(
    () => [
      ...blocks.map((b) => ({
        id: b.id,
        title: b.task.title,
        start: b.starts_at,
        end: b.ends_at,
        editable: b.status === "planned" && blockState(b, sessions, now) !== "missed",
        classNames: [
          "sched-block",
          `sched-block--${b.status}`,
          blockState(b, sessions, now) === "missed" ? "sched-block--missed" : "",
          blockState(b, sessions, now) === "not_started" ? "sched-block--not-started" : "",
        ].filter(Boolean),
        extendedProps: { block: b },
      })),
      ...sessions.filter((x) => showActual || x.ended_at === null).map((x) => ({
        id: `session-${x.id}`,
        title: x.task.title,
        start: x.started_at,
        // A just-started timer must not be zero-length: FullCalendar would draw it as 1 hour.
        end:
          x.ended_at ??
          new Date(Math.max(now.getTime(), new Date(x.started_at).getTime() + 60_000)).toISOString(),
        editable: false,
        classNames: x.ended_at ? ["sched-session"] : ["sched-session", "sched-session--running"],
        extendedProps: { session: x },
      })),
    ],
    [blocks, sessions, now, showActual],
  );

  function warnOverlap(blockId: string, start: Date, end: Date) {
    const overlaps = findOverlaps(blocks, { id: blockId, start, end });
    if (overlaps.length > 0) {
      toast.warning(`다른 일정과 겹칩니다: ${overlaps.map((o) => o.task.title).join(", ")}`);
    }
  }

  async function handleReceive(info: EventReceiveArg) {
    const taskId = info.event.extendedProps.taskId as string | undefined;
    const start = info.event.start;
    if (!taskId || !start) {
      info.revert();
      return;
    }
    // Keep the temporary event while the server sizes and saves the block.
    const fixedEnd = info.event.extendedProps.fixedDuration === true ? info.event.end : null;
    const result = await scheduleTaskAction({
      taskId,
      startsAt: start.toISOString(),
      ...(fixedEnd ? { endsAt: fixedEnd.toISOString() } : {}),
    });
    info.event.remove();
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const task = tasksById.get(taskId);
    if (task) {
      const block: CalendarBlock = { ...result.data, task: { ...task, status: task.status === "inbox" ? "planned" : task.status } };
      setBlocks((prev) => [...prev, block]);
      warnOverlap(block.id, new Date(block.starts_at), new Date(block.ends_at));
    }
  }

  async function handleChange(info: EventDropArg | EventResizeDoneArg) {
    const { event } = info;
    if (!event.start || !event.end) {
      info.revert();
      return;
    }
    const startsAt = event.start.toISOString();
    const endsAt = event.end.toISOString();
    const result = await moveScheduleBlockAction({ blockId: event.id, startsAt, endsAt });
    if (!result.ok) {
      info.revert();
      toast.error(result.message);
      return;
    }
    setBlocks((prev) =>
      prev.map((b) => (b.id === event.id ? { ...b, starts_at: startsAt, ends_at: endsAt } : b)),
    );
    warnOverlap(event.id, event.start, event.end);
  }

  function handleSelect(info: DateSelectArg) {
    setPendingRange({ start: info.start.toISOString(), end: info.end.toISOString() });
    info.view.calendar.unselect();
  }

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    const block = info.event.extendedProps.block as CalendarBlock | undefined;
    const session = info.event.extendedProps.session as SessionWithTask | undefined;
    const taskId = block?.task_id ?? session?.task_id;
    if (taskId) onOpenTask(taskId);
  }

  useEffect(() => {
    calendarRef.current?.getApi().gotoDate(isMobile ? mobileDay : week.startDate);
  }, [isMobile, mobileDay, week.startDate]);

  return (
    <div className="flex h-full flex-col">
      {isMobile && (
        <div role="tablist" aria-label="요일 선택" className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
          {week.days.map((day) => (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={day === mobileDay}
              onClick={() => setMobileDay(day)}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs tabular-nums",
                day === mobileDay ? "bg-accent font-medium text-foreground" : "text-muted-foreground",
                day === today && "underline underline-offset-4",
              )}
            >
              {day.slice(5).replace("-", "/")}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 px-1 md:px-2">
        <FullCalendar
          ref={calendarRef}
          key={isMobile ? "day" : "week"}
          plugins={[timeGridPlugin, interactionPlugin, luxonPlugin]}
          locale={koLocale}
          timeZone={timezone}
          initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
          initialDate={isMobile ? mobileDay : week.startDate}
          firstDay={settings.week_starts_on}
          headerToolbar={false}
          allDaySlot={false}
          height="100%"
          expandRows
          nowIndicator
          slotDuration={minutesToDuration(settings.slot_minutes)}
          snapDuration={minutesToDuration(settings.slot_minutes)}
          slotLabelInterval="01:00"
          scrollTime={settings.workday_start}
          businessHours={{
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            startTime: settings.workday_start,
            endTime: settings.workday_end,
          }}
          editable
          droppable
          selectable={!isMobile}
          selectMirror
          eventDurationEditable
          eventStartEditable
          events={events}
          eventContent={(arg: EventContentArg) => (
            <CalendarEventContent
              arg={arg}
              timezone={timezone}
              context={context}
              blocks={blocks}
              sessions={sessions}
              now={now}
              onStartBlock={onStartBlock}
            />
          )}
          eventReceive={handleReceive}
          eventDrop={handleChange}
          eventResize={handleChange}
          select={handleSelect}
          eventClick={handleEventClick}
        />
      </div>

      <CreateInRangeDialog range={pendingRange} timezone={timezone} onClose={() => setPendingRange(null)} />
    </div>
  );
}
