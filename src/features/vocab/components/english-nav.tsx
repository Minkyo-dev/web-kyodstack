"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** 단어장 tabs. Later phases add 단어 · 복습 · AI 연습 · 통계 (spec §10). */
const TABS = [
  { href: "/english", label: "홈", exact: true },
  { href: "/english/settings", label: "설정", exact: false },
] as const;

export function EnglishNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="단어장" className="flex h-full gap-0.5 overflow-x-auto overflow-y-hidden sm:gap-1">
      {TABS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center border-b-2 px-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-3",
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
