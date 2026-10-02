"use client";

import { ChevronRight } from "lucide-react";
import { buildBreadcrumb, type BreadcrumbInput } from "../domain/breadcrumb";
import { TERMS } from "@/lib/terms";

/** "Why am I doing this?" — Mission › Path › Protocol, or a MAINTENANCE label. */
export function DirectionBreadcrumb({ task }: { task: BreadcrumbInput }) {
  const b = buildBreadcrumb(task);
  if (b.kind === "maintenance") {
    return <p className="text-[11px] font-semibold tracking-widest text-muted-foreground">{TERMS.maintenance}</p>;
  }
  return (
    <nav aria-label="연결 경로" className="text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {b.crumbs.map((c, i) => (
          <li key={c.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3" aria-hidden />}
            <span className={i === 0 ? "font-medium text-foreground" : undefined}>{c.label}</span>
            {c.note && <span className="rounded-sm border border-border px-1 text-[10px]">{c.note}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
