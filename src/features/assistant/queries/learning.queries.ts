import "server-only";
import { fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { localDayRange, toLocalDate, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { HabitDaysPayload, RuleMinutesPayload } from "../domain/coach";
import { LEARN_MAX, LEARN_WINDOW_DAYS, learningOutcome, shiftDate, type LearnData, type Outcome } from "../domain/learning";
import { TimeSlotPayload } from "../domain/slot";
import { listApplied } from "./coach.queries";

export type LearningEntry = { id: string; kind: string; title: string; decidedDate: string; outcome: Outcome };

/** The learning log (`learn-v1`, ADR 0044): applied coaching proposals with their before/after result. */
export async function loadLearningLog(supabase: SupabaseServerClient, userId: string, now: Date): Promise<LearningEntry[]> {
  const { timezone } = await getSchedulerContext(supabase, userId);
  const today = todayLocalDate(timezone, now);
  const rows = (await listApplied(supabase, userId, now)).slice(0, LEARN_MAX);
  if (rows.length === 0) return [];
  const entries = rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, decidedDate: toLocalDate(r.decided_at, timezone), payload: r.payload }));

  const habitIds = new Set<string>();
  const protocolIds = new Set<string>();
  for (const e of entries) {
    if (e.kind === "habit_days") {
      const p = HabitDaysPayload.safeParse(e.payload);
      if (p.success) habitIds.add(p.data.habitId);
    } else {
      const p = e.kind === "rule_minutes" ? RuleMinutesPayload.safeParse(e.payload) : TimeSlotPayload.safeParse(e.payload);
      if (p.success) protocolIds.add(p.data.protocolId);
    }
  }
  const earliest = shiftDate(entries.map((e) => e.decidedDate).sort()[0], -LEARN_WINDOW_DAYS);
  const since = localDayRange(earliest, timezone).start;
  const [habits, checks, sessions] = await Promise.all([
    habitIds.size
      ? supabase.from("habits").select("id, created_at").eq("user_id", userId).in("id", [...habitIds])
      : Promise.resolve({ data: [], error: null }),
    habitIds.size
      ? supabase.from("habit_checks").select("habit_id, local_date").eq("user_id", userId).in("habit_id", [...habitIds]).gte("local_date", earliest).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    protocolIds.size
      ? supabase
          .from("work_sessions")
          .select("started_at, task:tasks!work_sessions_task_id_user_id_fkey!inner(protocol_id)")
          .eq("user_id", userId)
          .eq("source", "timer")
          .not("ended_at", "is", null)
          .gte("started_at", since)
          .in("task.protocol_id", [...protocolIds])
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [habits, checks, sessions]) if (r.error) throw fromDbError(r.error);

  const data: LearnData = { habits: new Map(), sessionDates: new Map() };
  for (const h of habits.data!) {
    const checked = new Set(checks.data!.filter((c) => c.habit_id === h.id).map((c) => c.local_date));
    data.habits.set(h.id, { createdDate: toLocalDate(h.created_at, timezone), checkedDates: checked });
  }
  for (const s of sessions.data!) {
    const pid = s.task?.protocol_id;
    if (!pid) continue;
    data.sessionDates.set(pid, [...(data.sessionDates.get(pid) ?? []), toLocalDate(s.started_at, timezone)]);
  }
  return entries.map((e) => ({ id: e.id, kind: e.kind, title: e.title, decidedDate: e.decidedDate, outcome: learningOutcome(e, data, today) }));
}
