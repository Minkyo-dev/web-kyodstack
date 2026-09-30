"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addLocalDays, startOfLocalDate } from "../utils/timezone";

export function WeekNavigation({
  week,
  today,
  timezone,
}: {
  week: { startDate: string; endDate: string };
  today: string;
  timezone: string;
}) {
  const prev = addLocalDays(week.startDate, -7, timezone);
  const next = addLocalDays(week.startDate, 7, timezone);
  const last = addLocalDays(week.endDate, -1, timezone);
  const isCurrent = today >= week.startDate && today < week.endDate;
  const label = `${format(startOfLocalDate(week.startDate, timezone), "M월 d일", { locale: ko })} – ${format(
    startOfLocalDate(last, timezone),
    "M월 d일",
    { locale: ko },
  )}`;

  const btn = cn(buttonVariants({ variant: "outline", size: "sm" }));

  return (
    <nav aria-label="주 이동" className="flex items-center gap-1.5">
      <Link href={`/scheduler?week=${prev}`} className={btn} aria-label="이전 주">
        <ChevronLeft aria-hidden />
      </Link>
      <Link
        href="/scheduler"
        className={cn(btn, isCurrent && "pointer-events-none opacity-60")}
        aria-disabled={isCurrent}
      >
        이번 주
      </Link>
      <Link href={`/scheduler?week=${next}`} className={btn} aria-label="다음 주">
        <ChevronRight aria-hidden />
      </Link>
      <span className="ml-2 text-sm font-medium tabular-nums" aria-live="polite">
        {label}
      </span>
    </nav>
  );
}
