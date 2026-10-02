import { formatMinutes } from "@/features/scheduler/utils/duration";
import { TERMS } from "@/lib/terms";
import type { QuestMetric, QuestType } from "../domain/quest.types";
import type { QuestRow } from "../queries/quest.queries";

export type ObjectiveView = { id: string; metric: QuestMetric; current: number; target: number; done: boolean; domainName: string | null; before: string | null; minMinutes: number | null };
export type QuestView = {
  id: string;
  type: QuestType;
  title: string;
  status: string;
  rewardXp: number;
  canSwap: boolean;
  swapUsed: boolean;
  /** SYSTEM 추천 line for an AI-picked quest (F2). */
  reason: string | null;
  objectives: ObjectiveView[];
};

export function toQuestViews(rows: QuestRow[], domainNames: Record<string, string>): QuestView[] {
  return rows.map((q) => ({
    id: q.id,
    type: q.type,
    title: q.title,
    status: q.status,
    rewardXp: q.reward_xp,
    swapUsed: q.swap_used,
    reason: q.generated_by === "ai" ? (q.reason ?? null) : null,
    canSwap: q.type === "daily" && q.status === "active" && !q.swap_used && Array.isArray(q.spare) && q.spare.length > 0,
    objectives: q.objectives.map((o) => ({
      id: o.id,
      metric: o.metric,
      current: Number(o.current_value),
      target: Number(o.target_value),
      done: o.completed_at !== null,
      domainName: o.params?.domainId ? (domainNames[o.params.domainId] ?? "영역") : null,
      before: o.params?.before ?? null,
      minMinutes: o.params?.minMinutes ?? null,
    })),
  }));
}

export function objectiveText(o: ObjectiveView): string {
  const m = (x: number) => formatMinutes(x);
  switch (o.metric) {
    case "focus_minutes": return `집중 ${m(o.current)} / ${m(o.target)}`;
    case "complete_planned_tasks": return `계획한 ${TERMS.task} 완료 ${o.current}/${o.target}`;
    case "complete_tasks": return `${TERMS.task} 완료 ${o.current}/${o.target}`;
    case "domain_minutes": return `${o.domainName} 연습 ${m(o.current)} / ${m(o.target)}`;
    case "domain_sessions": return `${o.domainName} 세션 ${o.current}/${o.target}`;
    case "kept_commitments": return `약속 블록 지키기 ${o.current}/${o.target}`;
    case "kept_commitment_rate": return `약속 블록 ${o.target}% 이상 지키기 · 현재 ${o.current}%`;
    case "days_within_capacity": return `작업량 안에서 계획한 날 ${o.current}/${o.target}`;
    case "early_session": return `${o.before ?? "12:00"} 전에 타이머 시작`;
    case "booked_block": return `${o.minMinutes ?? 30}분 블록 잡기`;
    case "started_session": return "타이머 시작하기";
  }
}
