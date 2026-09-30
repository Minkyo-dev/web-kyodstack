"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, FolderKanban, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard, exact: true },
  { href: "/scheduler", label: "스케줄러", icon: CalendarClock, exact: true },
  { href: "/scheduler/projects", label: "프로젝트", icon: FolderKanban, exact: false },
] as const;

export function PrivateNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="개인 도구" className="flex gap-1 md:flex-col">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
