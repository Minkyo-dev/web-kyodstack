"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTerms } from "@/hooks/use-terms";

/** Planner sections. Compact tabs under /scheduler; the private sidebar shows a single "플래너" entry. */
export function PlannerNav() {
  const pathname = usePathname();
  const terms = useTerms();
  const tabs = [
    { href: "/scheduler", label: "스케줄러", exact: true },
    { href: "/scheduler/directive", label: terms.directiveNav, exact: false },
    { href: "/scheduler/projects", label: terms.project, exact: false },
    { href: "/scheduler/review", label: "주간 회고", exact: false },
    { href: "/scheduler/progress", label: "추적", exact: false },
    { href: "/scheduler/manual", label: "매뉴얼", exact: false },
  ];

  return (
    <nav aria-label="플래너" className="flex h-full gap-0.5 overflow-x-auto sm:gap-1">
      {tabs.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center border-b-2 px-2 text-sm font-medium sm:px-3 whitespace-nowrap transition-colors",
              active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
