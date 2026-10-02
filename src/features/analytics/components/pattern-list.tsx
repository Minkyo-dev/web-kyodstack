import { formatMinutes } from "@/features/scheduler/utils/duration";
import type { Stats } from "../domain/stats.types";
import { josa, TERMS } from "@/lib/terms";
import { biasText } from "./stat-card";

function Row({ term, value, missing }: { term: string; value: string | null; missing: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="text-right tabular-nums">{value ?? <span className="text-muted-foreground">— {missing}</span>}</dd>
    </div>
  );
}

/** Not scored: facts about how the user works (D2 spec §2 Patterns). */
export function PatternList({
  patterns,
  calibrationBias,
}: {
  patterns: Stats["patterns"];
  calibrationBias: number | null;
}) {
  const p = patterns;
  return (
    <section aria-labelledby="patterns-heading" className="space-y-2">
      <h2 id="patterns-heading" className="text-lg font-semibold">
        나의 패턴
      </h2>
      <p className="text-xs text-muted-foreground">최근 4주 기준</p>
      <dl className="max-w-lg">
        <Row term="보통 세션" value={p.medianSessionMinutes !== null ? formatMinutes(p.medianSessionMinutes) : null} missing="완료한 세션이 없습니다" />
        <Row term="쉼 비율" value={p.pauseRatio !== null ? `${Math.round(p.pauseRatio * 100)}%` : null} missing="완료한 세션이 없습니다" />
        <Row term="스스로 매긴 집중도" value={p.averageFocus !== null ? `${p.averageFocus} / 5` : null} missing="집중도 기록이 없습니다" />
        <Row
          term="하루 작업량"
          value={p.dailyCapacityMinutes !== null ? formatMinutes(p.dailyCapacityMinutes) : null}
          missing="의미 있게 일한 근무일이 없습니다"
        />
        <Row term="계획 편향" value={calibrationBias !== null ? biasText(calibrationBias, null) : null} missing={`완료한 ${josa(TERMS.task, "이/가")} 더 필요합니다`} />
        <Row
          term="잘 지켜지는 시간대"
          value={p.reliableWindow ? `${p.reliableWindow.start}–${p.reliableWindow.end}` : null}
          missing="약속 블록이 더 필요합니다"
        />
        <Row
          term="자주 미뤄지는 시간대"
          value={p.rescheduleWindow ? `${p.rescheduleWindow.start}–${p.rescheduleWindow.end}` : null}
          missing="옮긴 일정이 적습니다"
        />
      </dl>
    </section>
  );
}
