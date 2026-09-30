"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DomainRef, TagRef } from "../domain/classification.types";
import { activeToken } from "../utils/quick-add";
import { TagChip } from "./classification-fields";

type Option = { kind: "#"; tag: TagRef } | { kind: "@"; domain: DomainRef };

/**
 * Quick-add title with "#tag" / "@domain" autocomplete (D1 spec §3). Picking an option adds a chip
 * (so names with spaces work) and removes the typed token. While the list is open, Enter picks
 * instead of submitting the form.
 */
export function TokenInput({
  id,
  name,
  placeholder,
  tags,
  domains,
  selectedTagIds,
  onSelectedTagIdsChange,
  selectedDomainId,
  onSelectedDomainIdChange,
  onFocus,
}: {
  id: string;
  name: string;
  placeholder?: string;
  tags: TagRef[];
  domains: DomainRef[];
  selectedTagIds: string[];
  onSelectedTagIdsChange: (ids: string[]) => void;
  selectedDomainId: string | null;
  onSelectedDomainIdChange: (id: string | null) => void;
  onFocus?: () => void;
}) {
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const token = activeToken(value, caret);
  const q = token?.query.toLowerCase() ?? "";
  const options: Option[] = !token
    ? []
    : token.kind === "#"
      ? tags
          .filter((t) => t.name.toLowerCase().startsWith(q) && !selectedTagIds.includes(t.id))
          .slice(0, 8)
          .map((tag) => ({ kind: "#", tag }))
      : domains
          .filter((d) => d.name.toLowerCase().startsWith(q))
          .slice(0, 8)
          .map((domain) => ({ kind: "@", domain }));
  const open = options.length > 0 && !dismissed;
  const listId = `${id}-options`;

  const pick = (o: Option) => {
    if (!token) return;
    const next = (value.slice(0, token.start) + value.slice(caret)).replace(/\s{2,}/g, " ");
    setValue(next);
    setCaret(token.start);
    if (o.kind === "#") onSelectedTagIdsChange([...selectedTagIds, o.tag.id]);
    else onSelectedDomainIdChange(o.domain.id);
    setActive(0);
  };

  const selectedTags = selectedTagIds.map((tid) => tags.find((t) => t.id === tid)).filter((t): t is TagRef => !!t);
  const selectedDomain = domains.find((d) => d.id === selectedDomainId) ?? null;

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        required
        maxLength={300}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={onFocus}
        onChange={(e) => {
          setValue(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setActive(0);
          setDismissed(false);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDismissed(true);
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover py-1 text-sm shadow-md"
        >
          {options.map((o, i) => (
            <li
              key={o.kind === "#" ? o.tag.id : o.domain.id}
              role="option"
              aria-selected={i === active}
              className={cn("cursor-pointer px-2 py-1", i === active && "bg-muted")}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              {o.kind === "#" ? `#${o.tag.name}` : `@${o.domain.name}`}
            </li>
          ))}
        </ul>
      )}
      {(selectedTags.length > 0 || selectedDomain) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {selectedTags.map((t) => (
            <TagChip
              key={t.id}
              tag={t}
              onRemove={() => onSelectedTagIdsChange(selectedTagIds.filter((x) => x !== t.id))}
            />
          ))}
          {selectedDomain && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 text-[11px] leading-5">
              @{selectedDomain.name}
              <button
                type="button"
                aria-label={`영역 ${selectedDomain.name} 제거`}
                onClick={() => onSelectedDomainIdChange(null)}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
