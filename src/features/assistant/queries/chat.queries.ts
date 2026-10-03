import "server-only";
import { fromDbError } from "@/lib/errors";
import { TERMS } from "@/lib/terms";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { getSchedulerContext, listBlocksInRange } from "@/features/scheduler/queries/schedule.queries";
import { listTodayTasks } from "@/features/scheduler/queries/task.queries";
import { loadWeekInput } from "@/features/scheduler/queries/week.queries";
import { computeWeeklyMetrics } from "@/features/scheduler/utils/weekly-metrics";
import { addLocalDays, localDayRange, localWeek, toLocalDate, toLocalTime, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { BLOCKER_LABEL, BLOCKERS, type Blocker } from "@/features/scheduler/schemas/reflection.schema";
import { listTodayHabits } from "@/features/direction/queries/habit.queries";
import { loadDirective } from "@/features/direction/queries/direction.queries";
import { loadDirectionStatus } from "@/features/direction/queries/status.queries";
import { planSteps, PLAN_STEPS, type PlanStep } from "@/features/direction/domain/plan";
import { WEEKDAY_LABEL, isoWeekday } from "@/features/direction/domain/habits";
import { loadProjectContext } from "@/features/projects/queries/context";
import { listProjectOverviews } from "@/features/projects/queries/project.queries";
import { sanitizeForPrompt } from "@/features/ai/utils/prompt-input";
import { phaseFor, PHASE_TITLE, toBriefTasks } from "../domain/brief";
import type { ChatSnapshot } from "../domain/chat";
import { getOpenFocus } from "./coach.queries";
import { loadLearningLog } from "./learning.queries";
import { outcomeText } from "../domain/learning";
import { forecastText } from "@/features/direction/domain/forecast";

const STEP_LABEL: Record<PlanStep, string> = {
  change: TERMS.mission,
  criteria: TERMS.criteria,
  path: TERMS.path,
  rules: TERMS.protocol,
  habits: TERMS.habit,
};
const s = (text: string | null, max: number) => sanitizeForPrompt(text, max);

/** `chat-context-v2` (ADR 0042, 0044): everything the model may read, computed by code. */
export async function loadChatSnapshot(supabase: SupabaseServerClient, userId: string, now: Date): Promise<ChatSnapshot> {
  const { timezone, settings } = await getSchedulerContext(supabase, userId);
  const today = todayLocalDate(timezone, now);
  const range = localDayRange(today, timezone);
  const week = localWeek(today, timezone, settings.week_starts_on);
  const [tasks, blocks, habits, reflection, directive, status, projectCtx, weekInput, focus, allHabits, learning] = await Promise.all([
    listTodayTasks(supabase, today, range.start),
    listBlocksInRange(supabase, range.start, range.end),
    listTodayHabits(supabase, userId, today, timezone),
    supabase.from("daily_reflections").select("win, blocker").eq("user_id", userId).eq("reflection_date", addLocalDays(today, -1, timezone)).maybeSingle(),
    loadDirective(supabase, userId),
    loadDirectionStatus(supabase, userId, now),
    loadProjectContext(supabase, userId),
    loadWeekInput(supabase, userId, week.startDate, timezone),
    getOpenFocus(supabase, userId, week.startDate),
    supabase.from("habits").select("mission_id").eq("user_id", userId).eq("status", "active"),
    loadLearningLog(supabase, userId, now),
  ]);
  if (reflection.error) throw fromDbError(reflection.error);
  if (allHabits.error) throw fromDbError(allHabits.error);
  const projects = await listProjectOverviews(supabase, projectCtx);
  const metrics = computeWeeklyMetrics(weekInput);

  const briefTasks = toBriefTasks(tasks, blocks, range, (iso) => toLocalDate(iso, timezone)).filter((t) => t.status !== "completed" && t.status !== "cancelled");
  briefTasks.sort((a, b) => (a.firstBlockAt ?? "~").localeCompare(b.firstBlockAt ?? "~") || a.priority - b.priority);
  const signals = new Map(status.missions.map((m) => [m.id, m.diagnosis.signals.map((x) => x.layer)]));
  const forecasts = new Map(status.missions.map((m) => [m.id, forecastText(m.forecast)]));
  const r = reflection.data;

  return {
    now: {
      date: today,
      time: toLocalTime(now, timezone),
      weekday: WEEKDAY_LABEL[isoWeekday(today)],
      phase: PHASE_TITLE[phaseFor(Number(toLocalTime(now, timezone).slice(0, 2)), settings.evening_hour)],
    },
    tasks: briefTasks.map((t) => ({
      id: t.id,
      title: s(t.title, 120),
      priority: t.priority,
      due: t.dueDate,
      scheduledAt: t.firstBlockAt ? toLocalTime(t.firstBlockAt, timezone) : null,
      change: t.changeTitle ? s(t.changeTitle, 80) : null,
    })),
    habits: habits.map((h) => ({ title: s(h.title, 60), done: h.done })),
    yesterday: r && (r.win || r.blocker) ? { win: r.win ? s(r.win, 200) : null, blocker: (BLOCKERS as readonly string[]).includes(r.blocker ?? "") ? BLOCKER_LABEL[r.blocker as Blocker] : null } : null,
    changes: directive.missions
      .filter((m) => m.status === "active")
      .map((m) => {
        const steps = planSteps({
          criteria: m.criteriaTotal,
          hasPath: m.hasPath,
          rules: m.ruleCount,
          habits: allHabits.data!.filter((h) => h.mission_id === m.id).length,
        });
        const next = PLAN_STEPS.find((x) => steps[x] === "next");
        return {
          id: m.id,
          title: s(m.title, 80),
          criteria: `${m.criteriaMet}/${m.criteriaTotal}`,
          nextStep: next ? STEP_LABEL[next] : null,
          deadline: m.deadline,
          signals: signals.get(m.id) ?? [],
          forecast: forecasts.get(m.id) ?? null,
        };
      }),
    projects: projects
      .filter((p) => !p.archived_at && (p.status === "active" || p.status === "planned"))
      .map((p) => ({ name: s(p.name, 60), progress: Math.round(p.progress.ratio * 100), targetDate: p.target_date })),
    week: {
      plannedMinutes: Math.round(metrics.plannedMinutes),
      actualMinutes: Math.round(metrics.actualMinutes),
      completed: metrics.completedTaskCount,
      focus: focus?.title ? s(focus.title, 80) : null,
    },
    learned: learning.slice(0, 5).map((l) => ({ title: s(l.title, 80), applied: l.decidedDate, result: outcomeText(l.outcome) })),
  };
}

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; proposal_ids: string[]; created_at: string };

/** The latest messages, oldest first. */
export async function listMessages(supabase: SupabaseServerClient, userId: string, limit = 40): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("id, role, content, proposal_ids, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw fromDbError(error);
  return (data as ChatMessage[]).reverse();
}


export type ChatProposal = { id: string; kind: string; title: string; reason: string; status: string; week_start: string };

/** The chat panel: recent messages and the proposals they carry (with their current status). */
export async function loadChatPanel(supabase: SupabaseServerClient, userId: string) {
  const messages = await listMessages(supabase, userId);
  const ids = [...new Set(messages.flatMap((m) => m.proposal_ids))];
  let proposals: ChatProposal[] = [];
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("assistant_proposals")
      .select("id, kind, title, reason, status, week_start")
      .eq("user_id", userId)
      .in("id", ids);
    if (error) throw fromDbError(error);
    proposals = data;
  }
  return { messages, proposals };
}
