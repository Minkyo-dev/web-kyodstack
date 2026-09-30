import { Sparkles } from "lucide-react";
import { formatMinutes } from "../utils/duration";
import { MIN_SAMPLES, type DurationEstimate } from "../utils/estimator";

/**
 * Why a block gets its length (spec §62, D1 spec §2): the recommendation with its range,
 * reason and confidence. Low confidence shows only the range (requirements §46).
 */
export function DurationInsight({ estimate }: { estimate: DurationEstimate }) {
    const baseLabel =
      estimate.baseSource === "user"
        ? `예상 ${formatMinutes(estimate.baseMinutes)}`
        : estimate.baseSource === "template"
          ? `템플릿 기본값 ${formatMinutes(estimate.baseMinutes)}`
          : `기본값 ${formatMinutes(estimate.baseMinutes)} (예상 시간 미입력)`;
    if (estimate.scope === "none") {
      return (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p>{formatMinutes(estimate.minutes)} 블록 · {baseLabel}</p>
          <p>유형이나 태그가 같은 완료 작업이 {MIN_SAMPLES}개 이상 쌓이면 실제 기록으로 추천합니다.</p>
        </div>
      );
    }
    const conf = { high: "높음", medium: "보통", low: "낮음", none: "" }[estimate.confidence];
    const rangeText =
      estimate.range && estimate.range.low !== estimate.range.high
        ? ` (${formatMinutes(estimate.range.low)}–${formatMinutes(estimate.range.high)})`
        : "";
    return (
      <div className="space-y-0.5 rounded-md border border-ai/40 bg-ai/5 px-3 py-2 text-xs">
        <p className="flex items-center gap-1 font-medium text-foreground">
          <Sparkles className="size-3.5 text-ai" aria-hidden />
          {estimate.confidence === "low"
            ? `${baseLabel} · 예상 범위 ${formatMinutes(estimate.range!.low)}–${formatMinutes(estimate.range!.high)}`
            : `${baseLabel} → 추천 ${formatMinutes(estimate.minutes)}${rangeText}`}
        </p>
        <p className="text-muted-foreground">{estimate.reason} 기준 · 신뢰도 {conf}</p>
      </div>
    );
  }
