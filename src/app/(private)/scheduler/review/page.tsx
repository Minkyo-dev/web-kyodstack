import type { Metadata } from "next";
import { PageHelp } from "@/components/layout/page-help";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { GenerateReviewButton } from "@/features/ai/components/generate-review-button";
import { getWeeklyReview } from "@/features/ai/queries/ai.queries";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { loadWeekInput } from "@/features/scheduler/queries/week.queries";
import { formatMinutes } from "@/features/scheduler/utils/duration";
import { addLocalDays, isLocalDateString, localWeek, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { computeWeeklyMetrics, type WeeklyMetrics } from "@/features/scheduler/utils/weekly-metrics";
import { CoachingSection } from "@/features/assistant/components/coaching-section";
import { listWeekProposals, type ProposalRow } from "@/features/assistant/queries/coach.queries";
import { ensureWeeklyCoaching } from "@/features/assistant/services/proposal.service";
import { log } from "@/lib/logger";

export const metadata: Metadata = { title: "주간 회고", robots: { index: false } };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const { week } = await searchParams;
  const { timezone, settings } = await getSchedulerContext(supabase, user.id);
  const today = todayLocalDate(timezone);
  const anchor = week && isLocalDateString(week) ? week : today;
  const { startDate, endDate } = localWeek(anchor, timezone, settings.week_starts_on);
  const current = startDate === localWeek(today, timezone, settings.week_starts_on).startDate;

  // Weekly coaching (ADR 0040): generated lazily for the current week; a failure only hides the section.
  const loadCoaching = async (): Promise<ProposalRow[] | null> => {
    try {
      if (current) await ensureWeeklyCoaching({ user, supabase });
      return await listWeekProposals(supabase, user.id, startDate);
    } catch (error) {
      log({ action: "assistant.coaching", userId: user.id, success: false, errorCode: "INTERNAL_ERROR", detail: String(error) });
      return null;
    }
  };

  const [input, review, proposals] = await Promise.all([
    loadWeekInput(supabase, user.id, startDate, timezone),
    getWeeklyReview(supabase, startDate),
    loadCoaching(),
  ]);
  const m = computeWeeklyMetrics(input);
  const prev = addLocalDays(startDate, -7, timezone);
  const next = addLocalDays(startDate, 7, timezone);
  const btn = buttonVariants({ variant: "outline", size: "sm" });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-2xl font-semibold">주간 회고</h2>
          <PageHelp page="review" />
        </div>
        <nav aria-label="주 이동" className="flex items-center gap-1.5">
          <Link href={`/scheduler/review?week=${prev}`} className={btn} aria-label="이전 주">
            <ChevronLeft aria-hidden />
          </Link>
          <span className="px-2 text-sm font-medium tabular-nums">
            {startDate} – {addLocalDays(endDate, -1, timezone)}
          </span>
          <Link
            href={`/scheduler/review?week=${next}`}
            className={cn(btn, next > today && "pointer-events-none opacity-50")}
            aria-disabled={next > today}
            aria-label="다음 주"
          >
            <ChevronRight aria-hidden />
          </Link>
        </nav>
      </header>

      {proposals && <CoachingSection proposals={proposals} current={current} />}

      <MetricsSection m={m} />

      <section aria-labelledby="ai-review-heading" className="space-y-3 rounded-lg border border-ai/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ai-review-heading" className="flex items-center gap-1.5 text-lg font-semibold">
            <Sparkles className="size-4 text-ai" aria-hidden />
            AI 해석
          </h2>
          <GenerateReviewButton weekStart={startDate} hasReview={review !== null} />
        </div>
        {!review ? (
          <p className="text-sm text-muted-foreground">
            위 지표를 바탕으로 AI가 패턴을 해석하고 다음 주 조정안을 제안합니다. AI는 데이터를 바꾸지 않습니다.
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="leading-relaxed">{review.summary}</p>
            <ReviewList title="잘한 점" items={review.positives} />
            <ReviewList title="개선할 점" items={review.issues} />
            {review.recommendations.length > 0 && (
              <div>
                <h3 className="mb-1.5 font-medium">다음 주 제안</h3>
                <ul className="space-y-2">
                  {review.recommendations.map((r, i) => (
                    <li key={i} className="rounded-md border border-border p-2.5">
                      <p className="font-medium">{r.title}</p>
                      <p className="text-muted-foreground">근거: {r.reason}</p>
                      <p>실행: {r.action}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {format(new Date(review.updated_at), "yyyy-MM-dd HH:mm")} 생성 · {review.model} · 프롬프트{" "}
              {review.prompt_version} · 생성 당시 지표 기준
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricsSection({ m }: { m: WeeklyMetrics }) {
  const ratio = m.planCompletionRatio === null ? "—" : `${Math.round(m.planCompletionRatio * 100)}%`;
  const avg = (x: number | null) => (x === null ? "—" : x.toFixed(1));
  return (
    <section aria-labelledby="metrics-heading" className="space-y-3">
      <h2 id="metrics-heading" className="text-lg font-semibold">
        이번 주 지표
      </h2>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Stat label="계획" value={formatMinutes(m.plannedMinutes)} />
        <Stat label="실제" value={formatMinutes(m.actualMinutes)} note={`계획 대비 ${ratio}`} />
        <Stat label="완료 / 생성" value={`${m.completedTaskCount} / ${m.createdTaskCount}`} />
        <Stat label="깊은 작업" value={formatMinutes(m.deepWorkMinutes)} note="50분 이상 세션" />
        <Stat label="건너뛴 블록" value={`${m.skippedBlockCount}개`} note={formatMinutes(m.skippedMinutes)} />
        <Stat label="일정 변경" value={`${m.rescheduleCount}회`} note={`이동 ${m.moveCount} · 조정 ${m.resizeCount} · 날짜 변경 ${m.daysShifted}`} />
        <Stat label="집중 · 기분 · 에너지" value={`${avg(m.averageFocus)} · ${avg(m.averageMood)} · ${avg(m.averageEnergy)}`} />
        <Stat
          label="집중 잘 되는 시간"
          value={m.bestFocusWindow ? `${m.bestFocusWindow.start}–${m.bestFocusWindow.end}` : "—"}
          note={m.worstFocusWindow ? `가장 낮음 ${m.worstFocusWindow.start}–${m.worstFocusWindow.end}` : undefined}
        />
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniList
          title="시간을 많이 쓴 작업 유형"
          rows={m.topTaskTypes.map((t) => [t.name, formatMinutes(t.actualMinutes)])}
        />
        <MiniList
          title="예상보다 오래/짧게 걸린 유형"
          rows={[
            ...m.underestimatedTaskTypes.map((t): [string, string] => [t.name, `예상의 ${Math.round(t.ratio * 100)}% (${t.samples}건)`]),
            ...m.overestimatedTaskTypes.map((t): [string, string] => [t.name, `예상의 ${Math.round(t.ratio * 100)}% (${t.samples}건)`]),
          ]}
        />
      </div>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
      {note && <dd className="text-[11px] text-muted-foreground">{note}</dd>}
    </div>
  );
}

function MiniList({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">데이터 없음</p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {rows.map(([a, b]) => (
            <li key={a} className="flex justify-between gap-2">
              <span className="truncate">{a}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 font-medium">{title}</h3>
      <ul className="list-disc space-y-0.5 pl-5">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
