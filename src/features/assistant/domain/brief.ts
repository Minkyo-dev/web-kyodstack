/**
 * Morning brief / evening check-in (ADR 0039, assistant P1 spec §2). Pure: every row is chosen by fixed rules here;
 * the LLM only phrases the optional coach line from the result.
 */
import { OPEN_TASK_STATUSES } from "@/features/scheduler/domain/scheduler.constants";
import { BLOCKER_LABEL, type Blocker } from "@/features/scheduler/schemas/reflection.schema";
import { DENY_LIST } from "@/features/direction/domain/status-text";

export type BriefPhase = "morning" | "day" | "evening";
export type OneThingReason = "chosen" | "change" | "earliest" | "due" | "priority";

export type BriefTask = {
  id: string;
  title: string;
  status: string;
  /** 1 = most important (the scheduler's convention; see overflowSelection). */
  priority: number;
  /** Local date the task is due or targeted (due_at's local date, else target_date). */
  dueDate: string | null;
  /** Effective active 변화 (task's own, else its project's). */
  changeTitle: string | null;
  /** Earliest start of a live block today (ISO), if any. */
  firstBlockAt: string | null;
};

export type BriefInput = {
  today: string;
  /** Local hour 0–23. */
  hour: number;
  eveningHour: number;
  tasks: BriefTask[];
  habits: { due: number; done: number; missedYesterday: string[] };
  capacity: { plannedMinutes: number; capacityMinutes: number | null };
  /** First active 변화 whose blueprint is not complete. */
  nextStep: { missionId: string; title: string; step: string } | null;
  yesterday: { nextTaskId: string | null; blocker: Blocker | null; win: string | null } | null;
  checkIn: { done: boolean; nextTaskTitle: string | null };
  line: string | null;
  /** This week's open "1% 변화" (ADR 0040). */
  weeklyFocus?: string | null;
};

export type Brief = {
  phase: BriefPhase;
  title: string;
  line: string | null;
  oneThing: { taskId: string; title: string; reason: OneThingReason; reasonText: string } | null;
  habits: { due: number; done: number; missedYesterday: string[] } | null;
  overCapacity: { plannedMinutes: number; capacityMinutes: number } | null;
  nextStep: BriefInput["nextStep"];
  yesterday: { blocker: string | null; win: string | null } | null;
  checkIn: { show: boolean; done: boolean; nextTaskTitle: string | null };
  weeklyFocus: string | null;
};

export const PHASE_TITLE: Record<BriefPhase, string> = { morning: "아침 브리핑", day: "오늘의 흐름", evening: "저녁 체크인" };

export function phaseFor(hour: number, eveningHour: number): BriefPhase {
  if (hour >= eveningHour) return "evening";
  return hour < 12 ? "morning" : "day";
}

const isOpen = (t: BriefTask) => (OPEN_TASK_STATUSES as readonly string[]).includes(t.status);
const byBlock = (a: BriefTask, b: BriefTask) => (a.firstBlockAt ?? "").localeCompare(b.firstBlockAt ?? "");

/** The one thing for today: the first rule that matches wins (spec §2.2). */
export function pickOneThing(tasks: BriefTask[], today: string, chosenId: string | null): Brief["oneThing"] {
  const open = tasks.filter(isOpen);
  const pick = (t: BriefTask | undefined, reason: OneThingReason, reasonText: string) =>
    t ? { taskId: t.id, title: t.title, reason, reasonText } : undefined;
  const scheduled = open.filter((t) => t.firstBlockAt !== null).sort(byBlock);
  const change = scheduled.find((t) => t.changeTitle !== null);
  const due = open
    .filter((t) => t.dueDate !== null && t.dueDate <= today)
    .sort((a, b) => a.priority - b.priority || a.dueDate!.localeCompare(b.dueDate!));
  const top = [...open].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  return (
    pick(open.find((t) => t.id === chosenId), "chosen", "어제 정한 일") ??
    pick(change, "change", `변화 '${change?.changeTitle}'로 가는 일`) ??
    pick(scheduled[0], "earliest", "가장 먼저 잡힌 일") ??
    pick(due[0], "due", "기한이 오늘") ??
    pick(top[0], "priority", "우선순위가 가장 높은 일") ??
    null
  );
}

export function buildBrief(input: BriefInput): Brief {
  const phase = phaseFor(input.hour, input.eveningHour);
  const { plannedMinutes, capacityMinutes } = input.capacity;
  return {
    phase,
    title: PHASE_TITLE[phase],
    line: input.line,
    oneThing: pickOneThing(input.tasks, input.today, input.yesterday?.nextTaskId ?? null),
    habits: input.habits.due > 0 || input.habits.missedYesterday.length > 0 ? input.habits : null,
    overCapacity: capacityMinutes !== null && plannedMinutes > capacityMinutes ? { plannedMinutes, capacityMinutes } : null,
    nextStep: input.nextStep,
    yesterday:
      input.yesterday && (input.yesterday.blocker || input.yesterday.win)
        ? { blocker: input.yesterday.blocker ? BLOCKER_LABEL[input.yesterday.blocker] : null, win: input.yesterday.win }
        : null,
    checkIn: { show: phase === "evening" || input.checkIn.done, done: input.checkIn.done, nextTaskTitle: input.checkIn.nextTaskTitle },
    weeklyFocus: input.weeklyFocus ?? null,
  };
}

/** Plain facts for the coach line prompt; titles are sanitised by the caller. */
export function briefFacts(b: Brief) {
  return {
    phase: b.phase,
    oneThing: b.oneThing ? { title: b.oneThing.title, why: b.oneThing.reasonText } : null,
    habits: b.habits ? { done: b.habits.done, due: b.habits.due, missedYesterday: b.habits.missedYesterday } : null,
    overCapacity: b.overCapacity !== null,
    nextChangeStep: b.nextStep ? `${b.nextStep.title}: ${b.nextStep.step}` : null,
    yesterdayBlocker: b.yesterday?.blocker ?? null,
    yesterdayWin: b.yesterday?.win ?? null,
  };
}

type TaskLike = {
  id: string;
  title: string;
  status: string;
  priority: number;
  due_at: string | null;
  target_date: string | null;
  mission?: { title: string; status: string } | null;
  project: { mission?: { title: string; status: string } | null } | null;
};
type BlockLike = { task_id: string; starts_at: string; status: string };

/** Scheduler tasks + blocks → brief tasks. Only live ("planned") blocks starting today count as scheduled. */
export function toBriefTasks(
  tasks: TaskLike[],
  blocks: BlockLike[],
  range: { start: string; end: string },
  localDateOf: (iso: string) => string,
): BriefTask[] {
  const first = new Map<string, string>();
  for (const b of blocks) {
    if (b.status !== "planned" || b.starts_at < range.start || b.starts_at >= range.end) continue;
    const prev = first.get(b.task_id);
    if (!prev || b.starts_at < prev) first.set(b.task_id, b.starts_at);
  }
  return tasks.map((t) => {
    const change = [t.mission, t.project?.mission].find((m) => m && m.status === "active") ?? null;
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_at ? localDateOf(t.due_at) : t.target_date,
      changeTitle: change?.title ?? null,
      firstBlockAt: first.get(t.id) ?? null,
    };
  });
}

/** A coach line is shown only if it is free of judgmental words (umbrella §2.4). */
export function acceptableLine(line: string): boolean {
  const lower = line.toLowerCase();
  return !DENY_LIST.some((w) => lower.includes(w.toLowerCase()));
}
