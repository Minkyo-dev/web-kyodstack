import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { daysUntil } from "@/features/projects/utils/progress";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { loadDurationProfiles } from "@/features/scheduler/services/duration-profile.service";
import { addLocalDays, localDayRange, todayLocalDate } from "@/features/scheduler/utils/timezone";
import {
  PROJECT_PLANNER_PROMPT_VERSION,
  PROJECT_PLANNER_SYSTEM,
  projectPlannerPrompt,
} from "../prompts/project-planner.prompt";
import { RecommendationListSchema } from "../schemas/recommendation.schema";
import { remainingCapacityMinutes } from "../utils/capacity";
import { sanitizeRecommendations, type AllowedProjects } from "../utils/sanitize";
import { getAiProvider } from "./provider";

const MIN_CAPACITY_MINUTES = 15;
const RECENT_DAYS = 14;

export type RecommendationRun =
  | { status: "created"; count: number; capacityMinutes: number }
  | { status: "skipped"; reason: string; capacityMinutes: number };

/**
 * Daily / milestone task recommendations (spec §33, §63, §64). The LLM only proposes.
 * Rows land in ai_recommendations as pending, and a task exists only after acceptance (§3.4, §34).
 */
export async function generateDailyRecommendations(ctx: ActionContext, now = new Date()): Promise<RecommendationRun> {
  const { timezone, settings } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const today = todayLocalDate(timezone, now);
  const todayRange = localDayRange(today, timezone);

  const [blocks, projects, milestones, tasks, profiles, templates] = await Promise.all([
    ctx.supabase
      .from("schedule_blocks")
      .select("starts_at, ends_at, status")
      .lt("starts_at", todayRange.end)
      .gt("ends_at", todayRange.start),
    ctx.supabase.from("projects").select("id, name, description, target_date, priority").eq("status", "active"),
    ctx.supabase
      .from("milestones")
      .select("id, project_id, name, target_date, status, sort_order")
      .in("status", ["planned", "in_progress"])
      .order("sort_order"),
    ctx.supabase
      .from("tasks")
      .select("title, status, project_id, milestone_id, user_estimated_minutes, completed_at")
      .or(
        `status.in.(inbox,planned,in_progress),completed_at.gte.${localDayRange(addLocalDays(today, -RECENT_DAYS, timezone), timezone).start}`,
      )
      .limit(500),
    loadDurationProfiles(ctx.supabase),
    ctx.supabase.from("task_templates").select("id, name"),
  ]);
  for (const r of [blocks, projects, milestones, tasks, templates]) if (r.error) throw fromDbError(r.error);

  const capacityMinutes = remainingCapacityMinutes({
    now,
    today,
    timezone,
    workdayStart: settings.workday_start,
    workdayEnd: settings.workday_end,
    blocks: blocks.data!,
  });
  if (capacityMinutes < MIN_CAPACITY_MINUTES) {
    return { status: "skipped", reason: "오늘 남은 작업 시간이 없습니다.", capacityMinutes };
  }
  if (projects.data!.length === 0) {
    return { status: "skipped", reason: "진행 중인 프로젝트가 없습니다.", capacityMinutes };
  }

  const openTitles = tasks.data!.filter((t) => t.status !== "completed").map((t) => t.title);
  const templateName = new Map(templates.data!.map((t) => [t.id, t.name]));

  // Aggregated, minimal input (spec §32.1: no unrelated personal data).
  const input = {
    today,
    remainingAvailableMinutes: capacityMinutes,
    projects: projects.data!.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priority: p.priority,
      targetDate: p.target_date,
      daysRemaining: p.target_date ? daysUntil(today, p.target_date) : null,
      milestones: milestones
        .data!.filter((m) => m.project_id === p.id)
        .map((m) => ({
          id: m.id,
          name: m.name,
          status: m.status,
          targetDate: m.target_date,
          daysRemaining: m.target_date ? daysUntil(today, m.target_date) : null,
          openTasks: tasks
            .data!.filter((t) => t.milestone_id === m.id && t.status !== "completed")
            .map((t) => ({ title: t.title, status: t.status, estimateMinutes: t.user_estimated_minutes })),
          recentlyCompleted: tasks
            .data!.filter((t) => t.milestone_id === m.id && t.status === "completed")
            .map((t) => t.title),
        })),
      openTasksWithoutMilestone: tasks
        .data!.filter((t) => t.project_id === p.id && !t.milestone_id && t.status !== "completed")
        .map((t) => t.title),
    })),
    durationTendencies: profiles
      .filter((p) => p.complexity_bucket === 0 && p.recommended_correction_factor !== null)
      .map((p) => ({
        taskType: templateName.get(p.task_template_id) ?? "unknown",
        actualVsEstimate: p.recommended_correction_factor,
        samples: p.sample_count,
      })),
    alreadyOpenTaskTitles: openTitles.slice(0, 100),
  };

  const provider = await getAiProvider();
  const result = await provider.generateStructured({
    task: "task_recommendations",
    system: PROJECT_PLANNER_SYSTEM,
    prompt: projectPlannerPrompt(input),
    schema: RecommendationListSchema,
    effort: "medium",
  });

  const allowed: AllowedProjects = new Map(
    input.projects.map((p) => [p.id, new Set(p.milestones.map((m) => m.id))]),
  );
  const clean = sanitizeRecommendations(result.data.recommendations, {
    allowed,
    capacityMinutes,
    existingTitles: openTitles,
  });

  // Idempotency (spec §47): a new run for today replaces today's still-pending suggestions.
  const expire = await ctx.supabase
    .from("ai_recommendations")
    .update({ status: "expired", decided_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id)
    .eq("recommendation_date", today)
    .in("recommendation_type", ["daily_task", "milestone_task"])
    .eq("status", "pending");
  if (expire.error) throw fromDbError(expire.error);

  if (clean.length > 0) {
    const ins = await ctx.supabase.from("ai_recommendations").insert(
      clean.map((r) => ({
        user_id: ctx.user.id,
        project_id: r.projectId,
        milestone_id: r.milestoneId,
        recommendation_date: today,
        recommendation_type: r.recommendationType,
        title: r.title,
        description: r.description,
        estimated_minutes: r.estimatedMinutes,
        priority: r.priority,
        rationale: r.rationale,
        provider: result.provider,
        model: result.model,
        prompt_version: PROJECT_PLANNER_PROMPT_VERSION,
        input_snapshot: input,
        output_snapshot: result.data,
      })),
    );
    if (ins.error) throw fromDbError(ins.error);
  }
  if (clean.length === 0 && result.data.recommendations.length > 0) {
    // Everything was filtered out: log it, but it isn't an error for the user.
    return { status: "skipped", reason: "지금 추천할 만한 작업이 없습니다.", capacityMinutes };
  }
  return { status: "created", count: clean.length, capacityMinutes };
}

export async function acceptRecommendation(
  ctx: ActionContext,
  input: { recommendationId: string; title?: string; estimatedMinutes?: number },
) {
  // Returns a single row (the function returns public.tasks, not setof).
  const { data, error } = await ctx.supabase.rpc("accept_ai_recommendation", {
    p_recommendation_id: input.recommendationId,
    p_title: input.title,
    p_estimated_minutes: input.estimatedMinutes,
  });
  if (error) {
    if (error.code === "23514") throw new AppError("CONFLICT", "이미 처리된 추천입니다.");
    throw fromDbError(error);
  }
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

export async function rejectRecommendation(ctx: ActionContext, recommendationId: string) {
  const { data, error } = await ctx.supabase
    .from("ai_recommendations")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", recommendationId)
    .eq("user_id", ctx.user.id)
    .eq("status", "pending")
    .select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new AppError("CONFLICT", "이미 처리된 추천입니다.");
}
