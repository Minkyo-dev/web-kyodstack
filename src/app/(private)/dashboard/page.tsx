import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, Wallet } from "lucide-react";

export const metadata: Metadata = { title: "대시보드", robots: { index: false } };

const TOOLS = [
  { href: "/scheduler", title: "Work Scheduler", body: "계획 → 실행 → 기록 → 회고", icon: CalendarClock },
  { href: "/finance", title: "가계부", body: "우리 집 돈의 흐름 → 날짜 → 거래", icon: Wallet },
] as const;

export default function DashboardPage() {
  return (
    <div className="max-w-5xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map(({ href, title, body, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex items-start gap-3 rounded-lg border bg-card p-4 shadow-xs transition-colors hover:border-ring/50 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-primary dark:text-sidebar-primary">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between font-medium">
                  {title}
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    aria-hidden
                  />
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
