"use client";

import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { STAT_LABEL } from "@/features/analytics/domain/stats.types";
import { reanalyzeAction } from "../actions/analysis.actions";
import type { AnalysisContent } from "../utils/analysis";
import { AnalysisSchedule } from "./analysis-schedule";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const ASSESSMENT_LABEL: [keyof AnalysisContent["assessment"], string][] = [
  ["planningTendency", "계획 경향"],
  ["workStyle", "작업 방식"],
  ["currentRisk", "현재 위험"],
  ["strongPattern", "강한 패턴"],
];

/** SYSTEM ANALYSIS (F2 spec §1): the algorithm's numbers explained; kept apart from the numeric stat cards. */
export function SystemAnalysisCard({
  analysis,
  createdLabel,
  analyzedToday,
  schedule,
}: {
  analysis: AnalysisContent | null;
  createdLabel: string | null;
  analyzedToday: boolean;
  schedule: { weekday: number | null; hour: number };
}) {
  const { run, pending } = useActionRunner();
  const next =
    schedule.weekday === null ? "자동 분석 꺼짐" : `다음 분석 ${WEEKDAYS[schedule.weekday]} ${String(schedule.hour).padStart(2, "0")}:00`;
  const assessment = analysis ? ASSESSMENT_LABEL.filter(([k]) => analysis.assessment[k]) : [];
  return (
    <section aria-labelledby="analysis-heading" className="space-y-3 rounded-md border border-border p-4">
      <h3 id="analysis-heading" className="font-mono text-xs tracking-widest text-muted-foreground">
        SYSTEM ANALYSIS
      </h3>
      {analysis ? (
        <>
          <ul className="space-y-2">
            {analysis.explanations.map((e, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">
                  <span className="mr-1.5 text-xs text-muted-foreground">{STAT_LABEL[e.stat].name}</span>
                  {e.headline}
                </p>
                {e.detail && <p className="text-muted-foreground">{e.detail}</p>}
                {e.evidence.length > 0 && <p className="font-mono text-[11px] text-muted-foreground">{e.evidence.join(" · ")}</p>}
              </li>
            ))}
          </ul>
          {assessment.length > 0 && (
            <div className="space-y-1 border-t border-border pt-3">
              <h4 className="font-mono text-xs tracking-widest text-muted-foreground">SYSTEM ASSESSMENT</h4>
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                {assessment.map(([k, label]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{analysis.assessment[k]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">아직 분석이 없습니다. 통계가 바뀐 이유를 숫자 근거와 함께 설명해 드려요.</p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>
          {createdLabel ? `분석 ${createdLabel} · ` : ""}
          {next}
        </span>
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          disabled={pending || analyzedToday}
          onClick={() => run(() => reanalyzeAction(), { success: "분석했습니다." })}
        >
          {analysis ? "다시 분석" : "지금 분석"}
        </Button>
        {analyzedToday && <span>오늘 이미 분석했어요</span>}
      </div>
      <AnalysisSchedule weekday={schedule.weekday} hour={schedule.hour} />
    </section>
  );
}
