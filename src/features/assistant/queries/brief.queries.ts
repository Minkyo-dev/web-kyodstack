import "server-only";
import { fromDbError } from "@/lib/errors";
import { TERMS } from "@/lib/terms";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { isDueOn } from "@/features/direction/domain/habits";
import { planSteps, PLAN_STEPS, type PlanStep } from "@/features/direction/domain/plan";
import { loadDirective } from "@/features/direction/queries/direction.queries";
import type { ArchivableStatus } from "@/features/direction/domain/direction.types";
import { BLOCKERS, type Blocker } from "@/features/scheduler/schemas/reflection.schema";
import { addLocalDays, toLocalDate } from "@/features/scheduler/utils/timezone";

const STEP_LABEL: Record<PlanStep, string> = {
  change: TERMS.mission,
  criteria: TERMS.criteria,
  path: TERMS.path,
  rules: TERMS.protocol,
  habits: TERMS.habit,
};

/** What the brief needs beyond what the scheduler page already loads (assistant P1 spec §6). */
export async function loadBriefExtras(supabase: SupabaseServerClient, userId: string, today: string, timezone: string) {
  const yesterday = addLocalDays(today, -1, timezone);
  const [reflection, habits, checks, line, directive] = await Promise.all([
    supabase.from("daily_reflections").select("next_task_id, blocker, win").eq("user_id", userId).eq("reflection_date", yesterday).maybeSingle(),
    supabase.from("habits").select("id, title, status, weekdays, rule, created_at, mission_id").eq("user_id", userId),
    supabase.from("habit_checks").select("habit_id").eq("user_id", userId).eq("local_date", yesterday),
    supabase.from("assistant_briefs").select("line").eq("user_id", userId).eq("local_date", today).maybeSingle(),
    loadDirective(supabase, userId),
  ]);
  for (const r of [reflection, habits, checks, line]) if (r.error) throw fromDbError(r.error);

  const checked = new Set(checks.data!.map((c) => c.habit_id));
  const missedYesterday = habits
    .data!.filter((h) => toLocalDate(h.created_at, timezone) <= yesterday) // a habit made today wasn't due yesterday
    .filter((h) => isDueOn({ rule: h.rule as "check" | "focus", status: h.status as ArchivableStatus, weekdays: h.weekdays }, yesterday) && !checked.has(h.id))
    .map((h) => h.title);

  const activeHabits = (missionId: string) => habits.data!.filter((h) => h.mission_id === missionId && h.status === "active").length;
  let nextStep: { missionId: string; title: string; step: string } | null = null;
  for (const m of directive.missions.filter((x) => x.status === "active")) {
    const steps = planSteps({ criteria: m.criteriaTotal, hasPath: m.hasPath, rules: m.ruleCount, habits: activeHabits(m.id) });
    const next = PLAN_STEPS.find((s) => steps[s] === "next");
    if (next) {
      nextStep = { missionId: m.id, title: m.title, step: STEP_LABEL[next] };
      break;
    }
  }

  const r = reflection.data;
  return {
    yesterday: r
      ? { nextTaskId: r.next_task_id, blocker: (BLOCKERS as readonly string[]).includes(r.blocker ?? "") ? (r.blocker as Blocker) : null, win: r.win }
      : null,
    missedYesterday,
    nextStep,
    line: line.data?.line ?? null,
  };
}
