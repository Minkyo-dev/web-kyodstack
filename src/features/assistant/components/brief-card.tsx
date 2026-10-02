"use client";

import Link from "next/link";
import { CheckCircle2, Compass, Flag, Gauge, MessageCircle, Moon, Play, Repeat, Sparkles, Sun, Sunset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TERMS } from "@/lib/terms";
import type { Brief } from "../domain/brief";

const PHASE_ICON = { morning: Sun, day: Sunset, evening: Moon } as const;
const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;

/**
 * Daily brief at the top of the 오늘 panel (ADR 0039). Every row is text + icon; actions start or open the one thing
 * and open the evening check-in. Collapsible; open by default. Rows use ARIA list roles (not <li>) and the one-thing
 * controls have their own names, so the task's own row stays the only "<title>" button / list item on the page.
 */
export function BriefCard({
  brief,
  onStart,
  onOpen,
  onCheckIn,
}: {
  brief: Brief;
  onStart: (taskId: string) => void;
  onOpen: (taskId: string) => void;
  onCheckIn: () => void;
}) {
  const Icon = PHASE_ICON[brief.phase];
  const empty =
    !brief.line && !brief.oneThing && !brief.habits && !brief.overCapacity && !brief.nextStep && !brief.weeklyFocus && !brief.yesterday && !brief.checkIn.show;
  if (empty) return null;
  return (
    <details open aria-label={brief.title} className="group mx-3 mb-2 rounded-lg border border-border bg-muted/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold">
        <Icon className="size-4" aria-hidden />
        {brief.title}
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">펼치기</span>
      </summary>
      <div role="list" className="space-y-2 px-3 pb-3 text-sm">
        {brief.line && (
          <div role="listitem" className="flex gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-ai" aria-hidden />
            <p>
              <span className="sr-only">코치 한마디: </span>
              {brief.line}
            </p>
          </div>
        )}
        {brief.oneThing && (
          <div role="listitem" aria-label="오늘의 한 가지" className="flex items-start gap-2">
            <Flag className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">오늘의 한 가지 · {brief.oneThing.reasonText}</p>
              <button
                type="button"
                aria-label={`오늘의 한 가지 열기: ${brief.oneThing.title}`}
                className="block max-w-full truncate text-left font-medium hover:underline"
                onClick={() => onOpen(brief.oneThing!.taskId)}
              >
                {brief.oneThing.title}
              </button>
            </div>
            <Button size="xs" variant="outline" aria-label={`오늘의 한 가지 시작: ${brief.oneThing.title}`} onClick={() => onStart(brief.oneThing!.taskId)}>
              <Play aria-hidden />
              시작
            </Button>
          </div>
        )}
        {brief.habits && (
          <div role="listitem" aria-label={TERMS.habits} className="flex gap-2">
            <Repeat className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              {brief.habits.due > 0 && <p>{`${TERMS.habit} 오늘 ${brief.habits.due}개 중 ${brief.habits.done}개 완료`}</p>}
              {brief.habits.missedYesterday.length > 0 && (
                <p className="text-xs text-muted-foreground">{`어제 놓친 ${TERMS.habit}: ${brief.habits.missedYesterday.join(", ")} — 오늘 하면 두 번 연속은 아닙니다.`}</p>
              )}
            </div>
          </div>
        )}
        {brief.overCapacity && (
          <div role="listitem" aria-label="작업량" className="flex gap-2">
            <Gauge className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{`계획 ${hours(brief.overCapacity.plannedMinutes)} / 평소 ${hours(brief.overCapacity.capacityMinutes)} — 덜 중요한 일을 내일로 옮겨 보세요.`}</p>
          </div>
        )}
        {brief.nextStep && (
          <div role="listitem" aria-label={`다음 ${TERMS.mission} 단계`} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <Link href={`/scheduler/directive?mission=${brief.nextStep.missionId}#mission-detail`} className="underline-offset-2 hover:underline">
                {`'${brief.nextStep.title}' — 다음 단계: ${brief.nextStep.step}`}
              </Link>
            </p>
          </div>
        )}
        {brief.weeklyFocus && (
          <div role="listitem" aria-label="이번 주 1% 변화" className="flex gap-2">
            <Compass className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <Link href="/scheduler/review#coaching" className="underline-offset-2 hover:underline">
                {`이번 주 1% 변화: ${brief.weeklyFocus}`}
              </Link>
            </p>
          </div>
        )}
        {brief.yesterday && (
          <div role="listitem" aria-label="어제 체크인" className="flex gap-2">
            <MessageCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-xs text-muted-foreground">
              {[brief.yesterday.win && `어제 잘한 일: ${brief.yesterday.win}`, brief.yesterday.blocker && `어제 막힌 점: ${brief.yesterday.blocker}`].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}
        {brief.checkIn.show && (
          <div role="listitem" aria-label="체크인" className="flex items-center gap-2 border-t border-border pt-2">
            {brief.checkIn.done ? (
              <>
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                <p className="min-w-0 flex-1 text-xs">
                  체크인 완료{brief.checkIn.nextTaskTitle ? ` · 내일의 한 가지: ${brief.checkIn.nextTaskTitle}` : ""}
                </p>
                <Button size="xs" variant="ghost" aria-label="체크인 수정" onClick={onCheckIn}>
                  수정
                </Button>
              </>
            ) : (
              <>
                <Moon className="size-4 shrink-0" aria-hidden />
                <p className="min-w-0 flex-1 text-xs">오늘을 정리하고 내일의 한 가지를 정해 두세요.</p>
                {/* Its own name: the footer keeps the only "하루 마무리" button on the page. */}
                <Button size="xs" aria-label="체크인 시작" onClick={onCheckIn}>
                  하루 마무리
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
