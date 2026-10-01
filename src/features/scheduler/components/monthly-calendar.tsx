"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import type { EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";
import koLocale from "@fullcalendar/core/locales/ko";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { toast } from "sonner";
import { useNow } from "@/hooks/use-now";
import { moveScheduleBlockAction } from "../actions/schedule.actions";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext } from "../domain/task.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { blockState } from "../utils/block-state";
import type { LocalMonth } from "../utils/month";

/**
 * Month overview of planned blocks. Dragging a block to another day keeps its time of day; a day number opens
 * that week in the week view, where blocks are created and resized.
 */
export function MonthlyCalendar({
  blocks: serverBlocks,
  sessions,
  context,
  month,
  onOpenTask,
}: {
  blocks: CalendarBlock[];
  sessions: SessionWithTask[];
  context: SchedulerContext;
  month: LocalMonth;
  onOpenTask: (taskId: string) => void;
}) {
  const { timezone, settings } = context;
  const router = useRouter();
  const now = useNow(60_000);

  // Optimistic copy; server props replace it after every revalidation (same rule as the week view).
  const [blocks, setBlocks] = useState(serverBlocks);
  const [syncedFrom, setSyncedFrom] = useState(serverBlocks);
  if (syncedFrom !== serverBlocks) {
    setSyncedFrom(serverBlocks);
    setBlocks(serverBlocks);
  }

  const events = useMemo<EventInput[]>(
    () =>
      blocks
        .filter((b) => b.status !== "cancelled")
        .map((b) => {
          const state = blockState(b, sessions, now);
          return {
            id: b.id,
            title: b.task.title,
            start: b.starts_at,
            end: b.ends_at,
            startEditable: b.status === "planned" && state !== "missed",
            classNames: ["sched-block", `sched-block--${b.status}`, state === "missed" ? "sched-block--missed" : ""].filter(Boolean),
            extendedProps: { block: b },
          };
        }),
    [blocks, sessions, now],
  );

  async function handleDrop(info: EventDropArg) {
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
    setBlocks((prev) => prev.map((b) => (b.id === event.id ? { ...b, starts_at: startsAt, ends_at: endsAt } : b)));
  }

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    const block = info.event.extendedProps.block as CalendarBlock | undefined;
    if (block) onOpenTask(block.task_id);
  }

  return (
    <div className="h-full px-1 md:px-2">
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin, luxonPlugin]}
        locale={koLocale}
        timeZone={timezone}
        initialView="dayGridMonth"
        initialDate={`${month.month}-01`}
        firstDay={settings.week_starts_on}
        headerToolbar={false}
        fixedWeekCount={false}
        height="100%"
        dayMaxEvents
        eventDisplay="block"
        navLinks
        navLinkDayClick={(date) => router.push(`/scheduler?week=${date.toISOString().slice(0, 10)}`)}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        editable
        eventDurationEditable={false}
        events={events}
        eventDrop={handleDrop}
        eventClick={handleEventClick}
      />
    </div>
  );
}
