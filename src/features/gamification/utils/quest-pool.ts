/**
 * Candidate pool for AI-picked daily quests and the rule validator (F2 spec §2). Pure; the AI only chooses keys from
 * this pool, so E2's evaluation, swap and clearing apply unchanged. Any validation failure → the E2 rule quest.
 */
import { formatMinutes } from "@/features/scheduler/utils/duration";
import { QUEST_META, type DailyContext, type ObjectiveDraft } from "../domain/quest.types";

export type PoolCandidate = { key: string; label: string; draft: ObjectiveDraft; family: string };
export type PickerOutput = { picks: string[]; title: string; reason: string };

const round5 = (x: number) => Math.round(x / 5) * 5;

export function questPool(ctx: DailyContext): PoolCandidate[] {
  const focus = ctx.capacity === null || ctx.plannedMinutes <= 0 ? 60 : Math.max(30, round5(Math.min(0.6 * ctx.capacity, ctx.plannedMinutes)));
  const raw: Omit<PoolCandidate, "key">[] = [
    { family: "focus", label: `집중 ${formatMinutes(focus)}`, draft: { metric: "focus_minutes", params: {}, target: focus } },
    ctx.plannedTaskIds.length
      ? {
          family: "planned",
          label: `계획한 할 일 ${Math.min(2, ctx.plannedTaskIds.length)}개 완료`,
          draft: { metric: "complete_planned_tasks", params: { taskIds: ctx.plannedTaskIds }, target: Math.min(2, ctx.plannedTaskIds.length) },
        }
      : { family: "any_task", label: "할 일 1개 완료", draft: { metric: "complete_tasks", params: {}, target: 1 } },
    ctx.topDomainId
      ? { family: "top_domain", label: "주 영역 연습 30분", draft: { metric: "domain_minutes", params: { domainId: ctx.topDomainId }, target: 30 } }
      : { family: "kept", label: "약속 블록 1개 지키기", draft: { metric: "kept_commitments", params: {}, target: 1 } },
    { family: "early", label: "12:00 전에 타이머 시작", draft: { metric: "early_session", params: { before: "12:00" }, target: 1 } },
    { family: "kept", label: "약속 블록 1개 지키기", draft: { metric: "kept_commitments", params: {}, target: 1 } },
  ];
  if (ctx.topTask) {
    raw.push({
      family: "top_task",
      label: `가장 중요한 할 일 완료: ${ctx.topTask.title}`,
      draft: { metric: "complete_planned_tasks", params: { taskIds: [ctx.topTask.id] }, target: 1 },
    });
  }
  if (ctx.weakDomainId && ctx.weakDomainId !== ctx.topDomainId) {
    raw.push({ family: "weak_domain", label: "약한 영역 연습 30분", draft: { metric: "domain_minutes", params: { domainId: ctx.weakDomainId }, target: 30 } });
  }
  const seen = new Set<string>();
  return raw
    .filter((c) => (seen.has(c.family) ? false : (seen.add(c.family), true)))
    .map((c, i) => ({ ...c, key: `c${i + 1}` }));
}

const sanitize = (s: string, max: number): string | null => {
  const v = s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return v.length >= 1 && v.length <= max ? v : null;
};

export function validatePicks(
  pool: PoolCandidate[],
  out: PickerOutput,
  capacity: number | null,
): { objectives: ObjectiveDraft[]; spare: ObjectiveDraft[]; title: string; reason: string | null } | null {
  if (out.picks.length !== 3 || new Set(out.picks).size !== 3) return null;
  const picked = out.picks.map((k) => pool.find((c) => c.key === k));
  if (picked.some((c) => !c)) return null;
  const chosen = picked as PoolCandidate[];
  if (new Set(chosen.map((c) => c.draft.metric)).size !== 3) return null;
  const families = new Set(chosen.map((c) => c.family));
  if (families.has("planned") && families.has("top_task")) return null;
  const focus = chosen.find((c) => c.draft.metric === "focus_minutes");
  if (focus && capacity !== null && focus.draft.target > capacity) return null;
  return {
    objectives: chosen.map((c) => c.draft),
    spare: pool.filter((c) => !out.picks.includes(c.key)).map((c) => c.draft),
    title: sanitize(out.title, 20) ?? QUEST_META.daily.title,
    reason: sanitize(out.reason, 80),
  };
}
