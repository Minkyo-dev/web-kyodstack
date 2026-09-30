import { TASK_TYPE_LABEL, type DomainRef, type TaskType } from "../domain/classification.types";
import type { GroupLabels } from "@/features/scheduler/utils/estimator";

export function groupLabels(domains: DomainRef[]): GroupLabels {
  const names = new Map(domains.map((d) => [d.id, d.name]));
  return {
    typeLabel: (t) => TASK_TYPE_LABEL[t as TaskType] ?? t,
    domainName: (id) => names.get(id) ?? null,
  };
}
