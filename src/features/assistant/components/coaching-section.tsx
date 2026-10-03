"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, CircleSlash, Compass, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { applyProposalAction, dismissProposalAction } from "../actions/proposal.actions";
import { KIND_LABEL, type ProposalKind } from "../domain/coach";
import type { ProposalRow } from "../queries/coach.queries";

const EVIDENCE_LABEL: Record<string, string> = {
  sessions: "세션",
  medianMinutes: "보통",
  intendedMinutes: "규칙",
  done: "지킴",
  due: "예정",
  paceGap: "진도 차",
  habitRate: "습관 달성률",
  progressNow: "현재 진행",
  progressBefore: "4주 전",
  habitDone: "체크",
  habitScheduled: "예정",
  missedOrSkipped: "놓친 블록",
  blocks: "블록",
  blockers: "방해",
  logs: "기록",
  recovery: "회복력",
  inHour: "그 시간대",
  hour: "시각",
};
const unit = (k: string, v: number | string) =>
  k === "hour" ? `${v}시` : typeof v === "number" && /Minutes$/.test(k) ? `${v}분` : typeof v === "number" && /Rate|progress|paceGap/.test(k) ? `${Math.round(v * 100)}%` : String(v);
const STATUS_TEXT: Record<string, string> = { applied: "적용함", dismissed: "넘김" };

/**
 * Weekly coaching on the review page (ADR 0040): this week's "1% 변화" first, up to two more, then what was decided.
 * Past weeks' open proposals read as expired and have no actions.
 */
export function CoachingSection({ proposals, current }: { proposals: ProposalRow[]; current: boolean }) {
  const open = proposals.filter((p) => p.status === "proposed");
  const decided = proposals.filter((p) => p.status !== "proposed");
  return (
    <section id="coaching" aria-labelledby="coaching-heading" className="scroll-mt-4 space-y-3">
      <h2 id="coaching-heading" className="flex items-center gap-1.5 text-lg font-semibold">
        <Compass className="size-4" aria-hidden />
        코칭
      </h2>
      {proposals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {current
            ? "이번 주 제안이 없습니다. 실행 규칙에 타이머를 쓰고 습관을 체크하면, 4주 기록을 보고 한 가지씩 다듬을 점을 찾아 드려요."
            : "이 주에는 제안이 없었습니다."}
        </p>
      ) : (
        <>
          {open.length > 0 && (
            <ul className="space-y-2">
              {open.map((p) => (
                <ProposalCard key={p.id} p={p} expired={!current} />
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">{`${current ? "이번 주" : "이 주"} 결정 (${decided.length})`}</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {decided.map((p) => (
                  <li key={p.id} aria-label={`결정한 제안 ${p.title}`} className="flex items-center gap-2">
                    {p.status === "applied" ? <CheckCircle2 className="size-4" aria-hidden /> : <CircleSlash className="size-4 text-muted-foreground" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate">{p.title}</span>
                    <span className="text-xs text-muted-foreground">{STATUS_TEXT[p.status]}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function ProposalCard({ p, expired }: { p: ProposalRow; expired: boolean }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const evidence = Object.entries((p.evidence ?? {}) as Record<string, number | string>).filter(([k]) => EVIDENCE_LABEL[k]);
  const isReview = p.kind === "review";
  return (
    <li aria-label={`제안 ${p.title}`} className={cn("space-y-2 rounded-lg border p-3", p.focus && !expired ? "border-foreground" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {p.focus && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-foreground px-1.5 py-px font-semibold">
            <Lightbulb className="size-3" aria-hidden />
            이번 주 1% 변화
          </span>
        )}
        <span className="rounded-sm border border-border px-1.5 py-px text-muted-foreground">{KIND_LABEL[p.kind as ProposalKind] ?? p.kind}</span>
        {expired && <span className="text-muted-foreground">기간 지남</span>}
      </div>
      <p className="font-medium">{p.title}</p>
      <p className="text-sm text-muted-foreground">{p.reason}</p>
      {evidence.length > 0 && (
        <ul aria-label="근거" className="flex flex-wrap gap-1.5 text-xs">
          {evidence.map(([k, v]) => (
            <li key={k} className="rounded-sm bg-muted px-1.5 py-0.5 tabular-nums">
              {EVIDENCE_LABEL[k]} {unit(k, v)}
            </li>
          ))}
        </ul>
      )}
      {!expired && (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => applyProposalAction({ proposalId: p.id }), {
                success: isReview ? undefined : "적용했습니다.",
                onSuccess: (r) => {
                  if (r.href) router.push(r.href);
                },
              })
            }
          >
            {isReview ? "확인하고 이동" : "적용"}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => dismissProposalAction({ proposalId: p.id }), { success: "넘겼습니다." })}>
            넘기기
          </Button>
        </div>
      )}
    </li>
  );
}
