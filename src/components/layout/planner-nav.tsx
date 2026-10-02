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
    { href: "/scheduler/review", label: "주간 리뷰", exact: false },
    { href: "/scheduler/progress", label: "진행", exact: false },
  ];

  return (
    <nav aria-label="플래너" className="flex h-full gap-1 overflow-x-auto">
      {tabs.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
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
