"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/finance", label: "대시보드", exact: true },
  { href: "/finance/calendar", label: "캘린더", exact: false },
  { href: "/finance/transactions", label: "거래", exact: false },
  { href: "/finance/settings", label: "설정", exact: false },
] as const;

/** Finance sections (spec §4). Compact tabs on every width; the private sidebar stays the app-level nav. */
export function FinanceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="가계부" className="-mb-px flex gap-1 overflow-x-auto">
      {NAV.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
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

const SETTINGS_NAV = [
  { href: "/finance/settings/accounts", label: "계좌" },
  { href: "/finance/settings/categories", label: "카테고리" },
  { href: "/finance/settings/household", label: "가계 구성원" },
] as const;

export function FinanceSettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="가계부 설정" className="flex gap-1">
      {SETTINGS_NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm",
            pathname === href ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
