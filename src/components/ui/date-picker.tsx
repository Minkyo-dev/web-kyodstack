"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addMonthsToKey, isDisabledDate, monthGrid, moveDate } from "@/lib/month-grid";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** Local calendar date → Date at local midnight, so formatting never shifts the day (SSR = client). */
const asLocal = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Calendar date picker. The value is a local calendar date ("yyyy-MM-dd"). A hidden form field keeps
 * existing FormData-based forms working; `required` is enforced by that field.
 */
export function DatePicker({
  id,
  name,
  defaultValue,
  value: controlled,
  onChange,
  required,
  min,
  max,
  weekStartsOn = 1,
  clearable,
  placeholder = "날짜 선택",
  className,
}: {
  id?: string;
  name?: string;
  defaultValue?: string | null;
  value?: string | null;
  onChange?: (value: string | null) => void;
  required?: boolean;
  min?: string;
  max?: string;
  weekStartsOn?: number;
  /** Show "지우기" to unset an optional date. */
  clearable?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [inner, setInner] = useState<string | null>(defaultValue || null);
  const value = controlled !== undefined ? controlled : inner;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value ?? todayKey()).slice(0, 7));
  const [focused, setFocused] = useState(value ?? todayKey());

  const select = (next: string | null) => {
    if (controlled === undefined) setInner(next);
    onChange?.(next);
    setOpen(false);
  };

  const openChange = (next: boolean) => {
    if (next) {
      const start = value ?? todayKey();
      setMonth(start.slice(0, 7));
      setFocused(start);
    }
    setOpen(next);
  };

  const focusDate = (date: string) => {
    setFocused(date);
    if (!date.startsWith(month)) setMonth(date.slice(0, 7));
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      focusDate(moveDate(focused, step));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isDisabledDate(focused, { min, max })) select(focused);
    }
  };

  const today = todayKey();

  return (
    <>
      <Popover open={open} onOpenChange={openChange}>
        <PopoverTrigger
          id={id}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-left text-sm dark:bg-input/30",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{value ? format(asLocal(value), "yyyy. M. d. (EEE)", { locale: ko }) : placeholder}</span>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="이전 달"
              onClick={() => setMonth(addMonthsToKey(month, -1))}
              className="rounded-md p-1 hover:bg-muted"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="text-sm font-medium" aria-live="polite">
              {format(asLocal(`${month}-01`), "yyyy년 M월", { locale: ko })}
            </span>
            <button
              type="button"
              aria-label="다음 달"
              onClick={() => setMonth(addMonthsToKey(month, 1))}
              className="rounded-md p-1 hover:bg-muted"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div role="grid" aria-label="날짜 선택" onKeyDown={onGridKey} className="space-y-1">
            <div role="row" className="grid grid-cols-7 text-center text-xs text-muted-foreground">
              {Array.from({ length: 7 }, (_, i) => (
                <span role="columnheader" key={i}>
                  {WEEKDAYS[(i + weekStartsOn) % 7]}
                </span>
              ))}
            </div>
            {monthGrid(month, weekStartsOn).map((week) => (
              <div role="row" key={week[0].date} className="grid grid-cols-7 gap-0.5">
                {week.map((day) => {
                  const disabled = isDisabledDate(day.date, { min, max });
                  const selected = day.date === value;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      role="gridcell"
                      data-date={day.date}
                      aria-selected={selected}
                      aria-label={format(asLocal(day.date), "yyyy년 M월 d일 EEEE", { locale: ko })}
                      aria-current={day.date === today ? "date" : undefined}
                      disabled={disabled}
                      tabIndex={day.date === focused ? 0 : -1}
                      ref={(el) => {
                        if (el && open && day.date === focused && document.activeElement !== el) el.focus();
                      }}
                      onClick={() => select(day.date)}
                      className={cn(
                        "h-8 rounded-md text-sm tabular-nums hover:bg-muted disabled:pointer-events-none disabled:opacity-30",
                        !day.inMonth && "text-muted-foreground/60",
                        day.date === today && "font-semibold underline underline-offset-4",
                        selected && "bg-foreground text-background hover:bg-foreground",
                      )}
                    >
                      {Number(day.date.slice(8))}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <button
              type="button"
              disabled={isDisabledDate(today, { min, max })}
              onClick={() => select(today)}
              className="rounded-md px-2 py-1 hover:bg-muted disabled:opacity-40"
            >
              오늘
            </button>
            {clearable && value && (
              <button type="button" onClick={() => select(null)} className="rounded-md px-2 py-1 hover:bg-muted">
                지우기
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {name && (
        // Visually hidden but focusable by the browser's validation, so `required` still works.
        <input
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          name={name}
          value={value ?? ""}
          required={required}
          onChange={() => {}}
        />
      )}
    </>
  );
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
