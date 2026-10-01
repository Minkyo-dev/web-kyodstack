import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LocalMonth } from "../utils/month";

export function MonthNavigation({ month, today }: { month: LocalMonth; today: string }) {
  const btn = cn(buttonVariants({ variant: "outline", size: "sm" }));
  const isCurrent = today.startsWith(month.month);
  return (
    <nav aria-label="월 이동" className="flex items-center gap-1.5">
      <Link href={`/scheduler?view=month&month=${month.prev}`} className={btn} aria-label="이전 달">
        <ChevronLeft aria-hidden />
      </Link>
      <Link
        href="/scheduler?view=month"
        className={cn(btn, isCurrent && "pointer-events-none opacity-60")}
        aria-disabled={isCurrent}
      >
        이번 달
      </Link>
      <Link href={`/scheduler?view=month&month=${month.next}`} className={btn} aria-label="다음 달">
        <ChevronRight aria-hidden />
      </Link>
      <span className="ml-2 text-sm font-medium tabular-nums" aria-live="polite">
        {month.label}
      </span>
    </nav>
  );
}

/** Week / month switch. Links, so the view is in the URL and survives reloads. */
export function CalendarViewToggle({ view, month, weekStart }: { view: "week" | "month"; month: string; weekStart: string }) {
  const item = (active: boolean) =>
    cn(
      "rounded-sm px-2.5 py-1 text-xs font-medium",
      active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav aria-label="캘린더 보기" className="flex rounded-md border border-border p-0.5">
      <Link href={`/scheduler?week=${weekStart}`} aria-current={view === "week" ? "page" : undefined} className={item(view === "week")}>
        주
      </Link>
      <Link
        href={`/scheduler?view=month&month=${month}`}
        aria-current={view === "month" ? "page" : undefined}
        className={item(view === "month")}
      >
        월
      </Link>
    </nav>
  );
}
