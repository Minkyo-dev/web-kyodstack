import { Sparkles } from "lucide-react";
import type { Task } from "../domain/task.types";
import { formatMinutes } from "../utils/duration";
import { MIN_SAMPLES, type DurationEstimate, type StoredProfile } from "../utils/estimator";

/**
 * Why a block gets its length (spec §62): human-sized numbers, the sample count,
 * and the usual over/under-run. No false precision.
 */
export function DurationInsight({
  task,
  estimate,
  profiles,
}: {
  task: Task;
  estimate: DurationEstimate;
  profiles: StoredProfile[];
}) {
  const baseLabel =
    estimate.baseSource === "user"
      ? `예상 ${formatMinutes(estimate.baseMinutes)}`
      : estimate.baseSource === "template"
        ? `유형 기본값 ${formatMinutes(estimate.baseMinutes)}`
        : `기본값 ${formatMinutes(estimate.baseMinutes)} (예상 시간 미입력)`;

  if (estimate.scope === "none") {
    const collected = task.template
      ? (profiles.find((p) => p.task_template_id === task.template!.id && p.complexity_bucket === 0)
          ?.sample_count ?? 0)
      : 0;
    return (
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>
          {formatMinutes(estimate.minutes)} 블록 · {baseLabel}
        </p>
        <p>
          {task.template
            ? `완료된 '${task.template.name}' 작업이 ${MIN_SAMPLES}개 이상 쌓이면 실제 기록으로 추천합니다 (현재 ${collected}개).`
            : "작업 유형을 지정하면 실제 기록으로 걸리는 시간을 학습합니다."}
        </p>
      </div>
    );
  }

  const pct = Math.round((estimate.correctionFactor - 1) * 100);
  const tendency =
    Math.abs(pct) < 5
      ? "보통 예상과 비슷하게 걸립니다"
      : pct > 0
        ? `보통 예상보다 ${pct}% 더 걸립니다`
        : `보통 예상보다 ${-pct}% 덜 걸립니다`;

  return (
    <div className="space-y-0.5 rounded-md border border-ai/40 bg-ai/5 px-3 py-2 text-xs">
      <p className="flex items-center gap-1 font-medium text-foreground">
        <Sparkles className="size-3.5 text-ai" aria-hidden />
        {baseLabel} → 추천 {formatMinutes(estimate.minutes)}
      </p>
      <p className="text-muted-foreground">
        비슷한 완료 작업 {estimate.sampleCount}개
        {estimate.scope === "template_complexity" && ` (난이도 ${task.complexity})`} 기준, {tendency}.
      </p>
    </div>
  );
}
