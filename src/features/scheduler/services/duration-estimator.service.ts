import "server-only";
import type { Task, SchedulerSettings } from "../domain/task.types";
import { recommendBlockMinutes, resolveBaseEstimate } from "../utils/duration";

export type DurationRecommendation = {
  minutes: number;
  baseMinutes: number;
  baseSource: "user" | "template" | "generic";
  correctionFactor: number;
  sampleCount: number;
};

/**
 * Spec §26/§27. Step 8 of §71: base estimate only, with no historical learning yet.
 * Phase 3 plugs the task_duration_profiles lookup into `correctionFactor`.
 */
export async function recommendDuration(
  task: Pick<Task, "user_estimated_minutes" | "template">,
  settings: SchedulerSettings,
): Promise<DurationRecommendation> {
  const base = resolveBaseEstimate({
    userEstimatedMinutes: task.user_estimated_minutes,
    templateDefaultMinutes: task.template?.default_estimate_minutes ?? null,
  });
  const correctionFactor = 1;
  return {
    minutes: recommendBlockMinutes(base.minutes, settings, correctionFactor),
    baseMinutes: base.minutes,
    baseSource: base.source,
    correctionFactor,
    sampleCount: 0,
  };
}
