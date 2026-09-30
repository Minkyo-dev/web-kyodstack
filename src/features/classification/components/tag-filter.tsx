"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { TagRef } from "../domain/classification.types";

/** "Any of" tag filter for the Today list; the selection lives in ?tags=<id,id>. */
export function TagFilter({ tags, selected }: { tags: TagRef[]; selected: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (tags.length === 0) return null;

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    const sp = new URLSearchParams(params.toString());
    if (next.length) sp.set("tags", next.join(","));
    else sp.delete("tags");
    const q = sp.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <div role="group" aria-label="태그 필터" className="flex flex-wrap gap-1 px-4 pb-2">
      {tags.map((t) => {
        const on = selected.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(t.id)}
            className={cn(
              "rounded-sm border px-1.5 text-[11px] leading-5",
              on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            #{t.name}
          </button>
        );
      })}
    </div>
  );
}
