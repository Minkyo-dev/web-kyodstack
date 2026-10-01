"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarClock, Compass, FolderKanban, LayoutDashboard, NotebookText, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTerms } from "@/hooks/use-terms";

const NAV = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard, exact: true },
  { href: "/scheduler", label: "스케줄러", icon: CalendarClock, exact: true },
  { href: "/scheduler/directive", label: "directive", icon: Compass, exact: false },
  { href: "/scheduler/projects", label: "project", icon: FolderKanban, exact: false },
  { href: "/scheduler/review", label: "주간 리뷰", icon: NotebookText, exact: false },
  { href: "/scheduler/progress", label: "진행", icon: BarChart3, exact: false },
  { href: "/finance", label: "가계부", icon: Wallet, exact: false },
] as const;

export function PrivateNav() {
  const pathname = usePathname();
  const terms = useTerms();

  return (
    <nav aria-label="개인 도구" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {NAV.map(({ href, label: rawLabel, icon: Icon, exact }) => {
        const label = rawLabel === "project" ? terms.project : rawLabel === "directive" ? terms.directiveNav : rawLabel;
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground md:before:absolute md:before:inset-y-2 md:before:-left-3 md:before:w-0.5 md:before:rounded-full md:before:bg-sidebar-primary"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-sidebar-primary")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
