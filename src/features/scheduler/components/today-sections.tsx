"use client";

import { Timer } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext, Task } from "../domain/task.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { blockState } from "../utils/block-state";
import { formatMinutes, minutesBetween } from "../utils/duration";
import { focusStats } from "../utils/focus";
import { formatElapsed } from "../utils/metrics";
import { toLocalTime } from "../utils/timezone";
import type { TodaySections as Sections } from "../utils/today";
import { BlockActions } from "./block-actions";

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-0.5">
      <h3 id={id} className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function BlockRow({
  block,
  context,
  blocks,
  sessions,
  now,
  onStartBlock,
  onOpenTask,
}: {
  block: CalendarBlock;
  context: SchedulerContext;
  blocks: CalendarBlock[];
  sessions: SessionWithTask[];
  now: Date;
  onStartBlock: (block: CalendarBlock) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const state = blockState(block, sessions, now);
  const tz = context.timezone;
  return (
    <div className="group/block flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
      <button type="button" onClick={() => onOpenTask(block.task_id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm">{block.task.title}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {toLocalTime(block.starts_at, tz)}–{toLocalTime(block.ends_at, tz)} ·{" "}
          {formatMinutes(minutesBetween(block.starts_at, block.ends_at))}
          {state === "not_started" && " · ⚠ 시작 안 함"}
          {state === "missed" && " · 놓침"}
        </span>
      </button>
      <BlockActions
        block={block}
        state={state}
        blocks={blocks}
        context={context}
        now={now}
        inline={false}
        onStart={() => onStartBlock(block)}
      />
    </div>
  );
}

/** 지금 / 다음 / 이후 / 미배정 / 오늘 완료 (D3 spec §1). */
export function TodaySections({
  sections,
  context,
  blocks,
  sessions,
  now,
  renderTask,
  onStartBlock,
  onOpenTask,
}: {
  sections: Sections;
  context: SchedulerContext;
  blocks: CalendarBlock[];
  sessions: SessionWithTask[];
  now: Date;
  renderTask: (task: Task) => React.ReactNode;
  onStartBlock: (block: CalendarBlock) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const tick = useNow(1000, sections.running !== null);
  const rowProps = { context, blocks, sessions, now, onStartBlock, onOpenTask };
  const hasNow = sections.running || sections.current.length > 0 || sections.missed.length > 0;
  return (
    <div className="space-y-1">
      {hasNow && (
        <Group id="today-now" title="지금">
          {sections.running && (
            <button
              type="button"
              onClick={() => onOpenTask(sections.running!.task_id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <Timer className="size-3.5 shrink-0 text-planned" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">진행 중 · {sections.running.task.title}</span>
              <span className="font-mono text-xs tabular-nums">
                {formatElapsed(focusStats(sections.running, sections.running.pauses, tick).focusedMs)}
              </span>
            </button>
          )}
          {sections.current.map((b) => (
            <BlockRow key={b.id} block={b} {...rowProps} />
          ))}
          {sections.missed.map((b) => (
            <BlockRow key={b.id} block={b} {...rowProps} />
          ))}
        </Group>
      )}
      {sections.next && (
        <Group id="today-next" title="다음">
          <BlockRow block={sections.next} {...rowProps} />
        </Group>
      )}
      {sections.later.length > 0 && (
        <Group id="today-later" title="이후">
          {sections.later.map((b) => (
            <BlockRow key={b.id} block={b} {...rowProps} />
          ))}
        </Group>
      )}
      <Group id="today-unscheduled" title="미배정">
        {sections.unscheduled.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">미배정 할 일이 없습니다.</p>
        ) : (
          <ul aria-label="미배정 할 일">{sections.unscheduled.map((t) => renderTask(t))}</ul>
        )}
      </Group>
      {sections.completed.length > 0 && (
        <details className="px-2 pt-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            오늘 완료 {sections.completed.length}
          </summary>
          <ul className="-mx-2">{sections.completed.map((t) => renderTask(t))}</ul>
        </details>
      )}
    </div>
  );
}
