"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createTagAction, setTaskTagsAction } from "../actions/classification.actions";
import {
  TASK_TYPE_LABEL,
  TASK_TYPES,
  type DomainRef,
  type TagColor,
  type TagRef,
} from "../domain/classification.types";
import { sameName } from "../utils/quick-add";

const selectClass = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

const DOT: Record<TagColor, string> = {
  gray: "bg-zinc-400",
  red: "bg-red-400",
  orange: "bg-orange-400",
  yellow: "bg-yellow-400",
  green: "bg-green-400",
  blue: "bg-blue-400",
  purple: "bg-purple-400",
  pink: "bg-pink-400",
};

/** Tag chip: the name is always shown; color is decoration only. */
export function TagChip({ tag, onRemove }: { tag: TagRef; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-40 items-center gap-1 rounded-sm border border-border px-1.5 text-[11px] leading-5">
      {tag.color && <span className={cn("size-1.5 shrink-0 rounded-full", DOT[tag.color])} aria-hidden />}
      <span className="truncate">#{tag.name}</span>
      {onRemove && (
        <button type="button" aria-label={`태그 ${tag.name} 제거`} onClick={onRemove} className="hover:text-foreground">
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

export function TagChips({ tags, max = 3 }: { tags: TagRef[]; max?: number }) {
  if (tags.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tags.slice(0, max).map((t) => (
        <TagChip key={t.id} tag={t} />
      ))}
      {tags.length > max && <span className="text-[11px]">+{tags.length - max}</span>}
    </span>
  );
}

export function TypeSelect({ id, name, defaultValue }: { id: string; name: string; defaultValue?: string | null }) {
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? ""} className={selectClass}>
      <option value="">없음</option>
      {TASK_TYPES.map((t) => (
        <option key={t} value={t}>
          {TASK_TYPE_LABEL[t]}
        </option>
      ))}
    </select>
  );
}

/** Depth-first order with indentation, so the tree reads top-down. */
export function orderedDomains(domains: DomainRef[]): { domain: DomainRef; depth: number }[] {
  const children = new Map<string | null, DomainRef[]>();
  for (const d of domains) {
    const key = d.parent_id && domains.some((p) => p.id === d.parent_id) ? d.parent_id : null;
    children.set(key, [...(children.get(key) ?? []), d]);
  }
  const out: { domain: DomainRef; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const d of (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ domain: d, depth });
      if (depth < 10) walk(d.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function DomainSelect({
  id,
  name,
  domains,
  defaultValue,
  exclude,
}: {
  id: string;
  name: string;
  domains: DomainRef[];
  defaultValue?: string | null;
  /** Hide this domain (e.g. itself when choosing a parent). */
  exclude?: string;
}) {
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? ""} className={selectClass}>
      <option value="">없음</option>
      {orderedDomains(domains)
        .filter(({ domain }) => domain.id !== exclude)
        .map(({ domain, depth }) => (
          <option key={domain.id} value={domain.id}>
            {"  ".repeat(depth)}
            {domain.name}
          </option>
        ))}
    </select>
  );
}

/** Tags of one task, edited live: chips with ×, plus an input with suggestions (Enter adds or creates). */
export function TagEditor({ taskId, tags, allTags }: { taskId: string; tags: TagRef[]; allTags: TagRef[] }) {
  const [current, setCurrent] = useState(tags);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const q = query.trim().replace(/^#/, "");
  const options = q
    ? allTags
        .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()) && !current.some((c) => c.id === t.id))
        .slice(0, 8)
    : [];

  const save = async (next: TagRef[]) => {
    setBusy(true);
    const r = await setTaskTagsAction({ taskId, tagIds: next.map((t) => t.id) });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    setCurrent(next);
  };

  const add = async () => {
    const picked = options[active];
    if (picked) return save([...current, picked]);
    if (!q || current.some((c) => sameName(c.name, q))) return;
    const existing = allTags.find((t) => sameName(t.name, q));
    if (existing) return save([...current, existing]);
    const created = await createTagAction({ name: q });
    if (!created.ok) return toast.error(created.message);
    await save([...current, created.data]);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {current.map((t) => (
          <TagChip key={t.id} tag={t} onRemove={() => save(current.filter((c) => c.id !== t.id))} />
        ))}
      </div>
      <div className="relative">
        <label htmlFor={`tag-editor-${taskId}`} className="sr-only">
          태그 추가
        </label>
        <Input
          id={`tag-editor-${taskId}`}
          value={query}
          disabled={busy}
          placeholder="태그 추가 (Enter)"
          autoComplete="off"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={`tag-editor-list-${taskId}`}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={async (e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(options.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              await add();
              setQuery("");
            }
          }}
        />
        {options.length > 0 && (
          <ul
            id={`tag-editor-list-${taskId}`}
            role="listbox"
            className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover py-1 text-sm shadow-md"
          >
            {options.map((t, i) => (
              <li
                key={t.id}
                role="option"
                aria-selected={i === active}
                className={cn("cursor-pointer px-2 py-1", i === active && "bg-muted")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  save([...current, t]);
                  setQuery("");
                }}
              >
                #{t.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
