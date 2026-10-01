import { TASK_TYPES, type TaskType } from "@/features/classification/domain/classification.types";
import type { ClassifyOutput } from "../schemas/classify.schema";

export type FeatureType = "task_type" | "domain" | "complexity" | "skills";
export type ClassifyItem = { taskId: string; taskType: TaskType | null; domainId: string | null; complexity: number | null; skills: string[]; confidence: number };

export function validateClassification(out: ClassifyOutput, ctx: { taskIds: Set<string>; domainIds: Set<string> }): ClassifyItem[] {
  return out.items
    .filter((i) => ctx.taskIds.has(i.taskId))
    .map((i) => {
      const skills: string[] = [];
      for (const raw of i.skills) {
        const s = raw.trim().toLowerCase();
        if (s.length >= 1 && s.length <= 30 && !skills.includes(s) && skills.length < 5) skills.push(s);
      }
      return {
        taskId: i.taskId,
        taskType: i.taskType && (TASK_TYPES as readonly string[]).includes(i.taskType) ? (i.taskType as TaskType) : null,
        domainId: i.domainId && ctx.domainIds.has(i.domainId) ? i.domainId : null,
        complexity: Number.isInteger(i.complexity) && i.complexity! >= 1 && i.complexity! <= 5 ? i.complexity! : null,
        skills,
        confidence: i.confidence,
      };
    });
}

export function proposalRows(
  item: ClassifyItem,
  task: { task_type: string | null; practice_domain_id: string | null; complexity: number; tagNames: string[]; rejected: Set<FeatureType> },
): { feature_type: FeatureType; feature_value: unknown }[] {
  const rows: { feature_type: FeatureType; feature_value: unknown }[] = [];
  if (item.taskType && !task.task_type && !task.rejected.has("task_type")) rows.push({ feature_type: "task_type", feature_value: item.taskType });
  if (item.domainId && !task.practice_domain_id && !task.rejected.has("domain")) rows.push({ feature_type: "domain", feature_value: item.domainId });
  if (item.complexity !== null && item.complexity !== task.complexity && !task.rejected.has("complexity"))
    rows.push({ feature_type: "complexity", feature_value: item.complexity });
  const known = new Set(task.tagNames.map((n) => n.toLowerCase()));
  const skills = item.skills.filter((s) => !known.has(s));
  if (skills.length && !task.rejected.has("skills")) rows.push({ feature_type: "skills", feature_value: skills });
  return rows;
}
