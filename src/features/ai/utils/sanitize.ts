import { DURATION_ROUNDING_MINUTES, roundUpToIncrement } from "@/features/scheduler/utils/duration";
import type { RecommendationOutput } from "../schemas/recommendation.schema";

export type AllowedProjects = Map<string, Set<string>>; // projectId → milestone ids

export type CleanRecommendation = RecommendationOutput & {
  recommendationType: "daily_task" | "milestone_task";
};

/**
 * Deterministic guardrails applied after schema validation (spec §31, §44, §64):
 * - drop items that reference a project outside the supplied input (no invented links)
 * - clear a milestone that isn't in that project
 * - drop duplicates of existing open tasks
 * - round estimates up to 5 minutes and keep the total within capacity, in model order
 *   (fewer recommendations is fine; the day is never filled just because time is free)
 */
export function sanitizeRecommendations(
  items: RecommendationOutput[],
  ctx: { allowed: AllowedProjects; capacityMinutes: number; existingTitles: string[] },
): CleanRecommendation[] {
  const seen = new Set(ctx.existingTitles.map((t) => t.trim().toLowerCase()));
  const out: CleanRecommendation[] = [];
  let used = 0;
  for (const item of items) {
    const milestones = ctx.allowed.get(item.projectId);
    if (!milestones) continue;
    const key = item.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    const milestoneId = item.milestoneId && milestones.has(item.milestoneId) ? item.milestoneId : null;
    const estimatedMinutes = roundUpToIncrement(item.estimatedMinutes, DURATION_ROUNDING_MINUTES);
    if (used + estimatedMinutes > ctx.capacityMinutes) continue;
    used += estimatedMinutes;
    seen.add(key);
    out.push({
      ...item,
      title: item.title.trim(),
      milestoneId,
      estimatedMinutes,
      recommendationType: milestoneId ? "milestone_task" : "daily_task",
    });
  }
  return out;
}
