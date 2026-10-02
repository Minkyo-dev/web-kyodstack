"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { createTransactionsAction } from "../actions/finance.actions";
import {
  BULK_COLUMNS,
  BULK_TYPE_LABEL,
  checkRow,
  filterOptions,
  formatLooseDate,
  isBlankRow,
  parseClipboardGrid,
  parseLooseDate,
  resolveOption,
  type BulkColumn,
  type BulkLookups,
  type BulkPayload,
  type BulkRow,
  type BulkType,
  type PickOption,
} from "../domain/bulk-entry";
import { categoryOptions } from "../domain/category-tree";
import { formatMoney, sumAmounts } from "../domain/money";
import { BULK_MAX_ROWS } from "../schemas/finance.schema";
import { useFinance } from "./finance-provider";

const COLUMN_META: Record<BulkColumn, { label: string; width: string; compactWidth: string; placeholder?: string; align?: "right" }> = {
  date: { label: "날짜", width: "w-28", compactWidth: "w-20", placeholder: "10/3" },
  type: { label: "구분", width: "w-20", compactWidth: "w-14" },
  amount: { label: "금액", width: "w-28", compactWidth: "w-24", placeholder: "0.00", align: "right" },
  category: { label: "카테고리·받는 계좌", width: "w-52", compactWidth: "w-44" },
  account: { label: "계좌", width: "w-40", compactWidth: "w-28" },
  merchant: { label: "가맹점·내용", width: "w-40", compactWidth: "w-32" },
  payer: { label: "결제한 사람", width: "w-36", compactWidth: "w-28" },
  note: { label: "메모", width: "w-56", compactWidth: "w-40" },
};
const PICKER_COLUMNS = new Set<BulkColumn>(["type", "category", "account", "payer"]);

const TYPE_OPTIONS: PickOption[] = [
  { id: "EXPENSE", label: BULK_TYPE_LABEL.EXPENSE, aliases: ["-", "e", "expense", "출"] },
  { id: "INCOME", label: BULK_TYPE_LABEL.INCOME, aliases: ["+", "i", "income", "입"] },
  { id: "TRANSFER", label: BULK_TYPE_LABEL.TRANSFER, aliases: ["t", "transfer", "이", ">"] },
  { id: "REFUND", label: BULK_TYPE_LABEL.REFUND, aliases: ["r", "refund", "환"] },
];

const KEY_HINTS: [string, string][] = [
  ["Enter", "아래 칸 (마지막 행이면 새 행)"],
  ["Tab", "다음 칸"],
  ["↑ ↓ ← →", "칸 이동"],
  ["Alt+↓", "선택지 열기"],
  ["Ctrl+D", "위 칸 복사"],
  ["Ctrl+Enter", "모두 저장"],
];

let keySeq = 0;
const nextKey = () => `row-${++keySeq}`;

// ------------------------------------------------------------------ picker cell

function ComboCell({
  value,
  options,
  invalid,
  cell,
  label,
  placeholder,
  onChange,
}: {
  value: string;
  options: PickOption[];
  invalid: boolean;
  cell: string;
  label: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const matches = useMemo(() => filterOptions(value, options).slice(0, 50), [value, options]);

  const place = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return false;
    setPos({ left: rect.left, top: rect.bottom + 2, width: Math.max(rect.width, 200) });
    return true;
  };
  const show = () => {
    if (!place()) return;
    setActive(0);
    setOpen(true);
  };
  const pick = (option: PickOption | undefined) => {
    if (option) onChange(option.label);
    setOpen(false);
  };

  // The list is fixed-positioned (it must escape the grid's scroll box): it follows its cell when the page or the grid
  // scrolls, and closes once the cell leaves the screen. Scrolling the list itself is ignored.
  useEffect(() => {
    if (!open) return;
    const follow = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) setOpen(false);
      else place();
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  return (
    <>
      <input
        ref={inputRef}
        data-cell={cell}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) show();
          setActive(0);
        }}
        onMouseDown={() => {
          if (document.activeElement !== inputRef.current) return;
          if (open) setOpen(false);
          else show();
        }}
        onBlur={() => {
          setOpen(false);
          // Canonical text once it resolves, so "장보" becomes "식비 > 장보기".
          const resolved = resolveOption(value, options);
          if (resolved && resolved.label !== value) onChange(resolved.label);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            show();
            return;
          }
          if (!open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            const n = matches.length;
            if (n) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
          } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            pick(matches[active]);
          } else if (e.key === "Tab") {
            pick(matches[active]);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={cellInputClass(invalid)}
      />
      {open && pos && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={`${label} 선택지`}
          style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
          className="fixed z-50 max-h-64 overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">일치하는 항목이 없습니다</li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("cursor-default rounded-sm px-2 py-1.5 whitespace-nowrap", i === active && "bg-accent text-accent-foreground")}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </>
  );
}

function cellInputClass(invalid: boolean, align?: "right") {
  return cn(
    "h-9 w-full min-w-0 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60",
    "focus:bg-accent/40 focus:ring-2 focus:ring-ring focus:ring-inset",
    invalid && "bg-destructive/10 ring-1 ring-destructive ring-inset",
    align === "right" && "text-right tabular-nums",
  );
}

// ------------------------------------------------------------------ grid

/**
 * Bulk entry (ADR 0027): a spreadsheet for expenses and income. Every cell is text; Enter/arrow keys move like a
 * spreadsheet, picker cells suggest as you type, and a block copied from Excel/Sheets pastes across rows and columns.
 * Rows are checked in the browser first, then saved in one all-or-nothing call.
 *
 * `columns` shows a subset (hidden ones keep their defaults: the payer follows the account, no memo); `defaultDate`
 * is the date for new rows, and rows not typed into yet follow it when it changes (the calendar's selected day).
 */
export function BulkEntryGrid({
  columns = BULK_COLUMNS,
  defaultDate,
  compact = false,
  onSaved,
}: {
  columns?: readonly BulkColumn[];
  defaultDate?: string | null;
  compact?: boolean;
  onSaved?: () => void;
} = {}) {
  const f = useFinance();
  const { run, pending } = useActionRunner();
  const tableRef = useRef<HTMLTableElement>(null);
  const pendingFocus = useRef<[number, number] | null>(null);

  const lookups = useMemo<BulkLookups>(() => {
    const categories = (type: "EXPENSE" | "INCOME") =>
      categoryOptions(f.categories, type).map((o) => ({
        id: o.id,
        label: o.label,
        aliases: o.depth === 1 ? [o.label.split(" > ").pop()!] : [],
      }));
    return {
      today: f.today,
      types: TYPE_OPTIONS,
      categories: { EXPENSE: categories("EXPENSE"), INCOME: categories("INCOME"), REFUND: categories("EXPENSE") },
      accounts: f.activeAccounts.map((a) => ({ id: a.id, label: a.name })),
      members: f.members.map((m) => ({ id: m.userId, label: m.displayName })),
    };
  }, [f.categories, f.activeAccounts, f.members, f.today]);

  /** A personal card is usually paid by its owner (same rule as the single form). */
  const payerFor = (accountText: string) => {
    const account = resolveOption(accountText, lookups.accounts);
    const owner = account ? f.accounts.find((a) => a.id === account.id)?.owner_user_id : null;
    return f.memberName(owner ?? f.meId) ?? "";
  };

  const blankRow = (prev?: BulkRow): BulkRow => {
    const account = prev?.account ?? lookups.accounts[0]?.label ?? "";
    return {
      key: nextKey(),
      // Beside a selected day (the calendar panel) new rows take that day; otherwise the row above's date.
      date: defaultDate ? formatLooseDate(defaultDate, f.today) : (prev?.date ?? formatLooseDate(f.today, f.today)),
      type: prev?.type ?? BULK_TYPE_LABEL.EXPENSE,
      amount: "",
      category: "",
      account,
      merchant: "",
      payer: prev?.payer ?? payerFor(account),
      note: "",
    };
  };

  // No rows until the user adds one; a new row copies date, type, account and payer from the last row (or the last
  // saved one).
  const [rows, setRows] = useState<BulkRow[]>([]);
  const lastSaved = useRef<BulkRow | undefined>(undefined);
  const [errors, setErrors] = useState<Record<string, Partial<Record<BulkColumn, string>>> | null>(null);
  // Payer follows the account until it is typed by hand.
  const [payerTouched, setPayerTouched] = useState<Set<string>>(() => new Set());
  const lastCol = columns.length - 1;

  // A new default date (another day picked in the calendar) moves the rows nobody has typed into yet.
  const [shownDefault, setShownDefault] = useState(defaultDate);
  if (defaultDate !== shownDefault) {
    setShownDefault(defaultDate);
    const date = formatLooseDate(defaultDate ?? f.today, f.today);
    setRows((prev) => prev.map((r) => (isBlankRow(r) ? { ...r, date } : r)));
  }

  const checks = useMemo(() => rows.map((r) => (isBlankRow(r) ? null : checkRow(r, lookups))), [rows, lookups]);
  const filled = checks.filter((c) => c !== null).length;
  const valid = checks.flatMap((c) => (c?.payload ? [c.payload] : []));
  const totals = {
    expense: sumAmounts(valid.filter((p) => p.type === "EXPENSE").map((p) => p.amount)),
    income: sumAmounts(valid.filter((p) => p.type === "INCOME").map((p) => p.amount)),
    transfer: sumAmounts(valid.filter((p) => p.type === "TRANSFER").map((p) => p.amount)),
    refund: sumAmounts(valid.filter((p) => p.type === "REFUND").map((p) => p.amount)),
  };
  const currency = f.activeAccounts[0]?.currency_code ?? "CAD";

  // After an errored save, cells re-check as they change so fixed ones clear right away.
  const liveErrors = useMemo(() => {
    if (!errors) return null;
    const out: Record<string, Partial<Record<BulkColumn, string>>> = {};
    rows.forEach((r, i) => {
      const errs = checks[i]?.errors;
      if (errs) out[r.key] = errs;
    });
    return out;
  }, [errors, rows, checks]);

  const focusCell = (r: number, c: number) => {
    const el = tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`);
    if (!el) return;
    el.focus();
    el.select();
  };

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    focusCell(target[0], target[1]);
  });

  useEffect(() => {
    if (filled === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [filled]);

  const setCell = (key: string, col: BulkColumn, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, [col]: value };
        if (col === "account" && !payerTouched.has(key)) next.payer = payerFor(value);
        return next;
      }),
    );
    if (col === "payer") setPayerTouched((s) => new Set(s).add(key));
  };

  const appendRow = (focusCol: number) => {
    if (rows.length >= BULK_MAX_ROWS) {
      toast.error(`한 번에 ${BULK_MAX_ROWS}행까지 입력할 수 있습니다.`);
      return;
    }
    pendingFocus.current = [rows.length, focusCol];
    setRows((prev) => [...prev, blankRow(prev[prev.length - 1] ?? lastSaved.current)]);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const save = () => {
    const kept = rows.filter((r) => !isBlankRow(r));
    if (kept.length === 0) {
      toast.error("입력한 거래가 없습니다.");
      return;
    }
    // Blank rows go away first, so "n행" in a server message matches the grid.
    const results = kept.map((r) => checkRow(r, lookups));
    setRows(kept);
    const bad = results.findIndex((c) => c.errors);
    if (bad >= 0) {
      setErrors({});
      const count = results.filter((c) => c.errors).length;
      toast.error(`${count}개 행을 확인해 주세요.`);
      const col = columns.findIndex((c) => results[bad].errors?.[c]);
      pendingFocus.current = [bad, Math.max(col, 0)];
      return;
    }
    const payloads = results.map((c) => c.payload as BulkPayload);
    run(() => createTransactionsAction({ rows: payloads }), {
      success: `${payloads.length}건을 저장했습니다.`,
      onSuccess: () => {
        lastSaved.current = kept[kept.length - 1];
        setErrors(null);
        setPayerTouched(new Set());
        setRows([]);
        onSaved?.();
      },
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTableElement>) => {
    const target = e.target as HTMLInputElement;
    const cell = target.dataset?.cell;
    if (!cell) return;
    const [r, c] = cell.split(":").map(Number);
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) focusCell(Math.max(r - 1, 0), c);
      else if (r === rows.length - 1) appendRow(c);
      else focusCell(r + 1, c);
    } else if (e.key === "ArrowDown" && !e.altKey) {
      e.preventDefault();
      focusCell(Math.min(r + 1, rows.length - 1), c);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(Math.max(r - 1, 0), c);
    } else if (e.key === "ArrowLeft" && target.selectionStart === 0 && target.selectionEnd === 0 && c > 0) {
      e.preventDefault();
      focusCell(r, c - 1);
    } else if (
      e.key === "ArrowRight" &&
      target.selectionStart === target.value.length &&
      target.selectionEnd === target.value.length &&
      c < lastCol
    ) {
      e.preventDefault();
      focusCell(r, c + 1);
    } else if (e.key === "Tab" && !e.shiftKey && c === lastCol && r === rows.length - 1) {
      e.preventDefault();
      appendRow(0);
    } else if (mod && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      if (r > 0) setCell(rows[r].key, columns[c], rows[r - 1][columns[c]]);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTableElement>) => {
    const cell = (e.target as HTMLElement).dataset?.cell;
    const text = e.clipboardData.getData("text/plain");
    if (!cell || !/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return;
    e.preventDefault();
    const [r0, c0] = cell.split(":").map(Number);
    let grid = parseClipboardGrid(text);
    if (grid[0]?.[0]?.trim() === COLUMN_META.date.label) grid = grid.slice(1); // a copied header row
    const room = BULK_MAX_ROWS - r0;
    if (grid.length > room) {
      toast.error(`한 번에 ${BULK_MAX_ROWS}행까지 입력할 수 있어 ${grid.length - room}행은 붙여넣지 않았습니다.`);
      grid = grid.slice(0, room);
    }
    const touched = new Set(payerTouched);
    setRows((prev) => {
      const next = [...prev];
      grid.forEach((cells, i) => {
        const r = r0 + i;
        if (!next[r]) next[r] = blankRow(next[r - 1] ?? lastSaved.current);
        const row = { ...next[r] };
        cells.forEach((value, j) => {
          const col = columns[c0 + j];
          if (!col) return;
          row[col] = value.trim();
          if (col === "payer") touched.add(row.key);
        });
        if (!touched.has(row.key) && cells.some((_, j) => columns[c0 + j] === "account")) row.payer = payerFor(row.account);
        next[r] = row;
      });
      return next;
    });
    setPayerTouched(touched);
    toast.success(`${grid.length}행을 붙여넣었습니다.`);
  };

  if (lookups.accounts.length === 0) {
    return (
      <div className="space-y-2 py-4 text-sm">
        <p>거래를 기록하려면 계좌가 하나 이상 필요합니다.</p>
        <Link href="/finance/settings/accounts" className="underline underline-offset-4">
          계좌 추가하러 가기
        </Link>
      </div>
    );
  }

  const errorList = liveErrors
    ? rows.flatMap((r, i) =>
        BULK_COLUMNS.flatMap((col) => {
          const msg = liveErrors[r.key]?.[col];
          return msg ? [{ r: i, c: columns.indexOf(col), text: `${i + 1}행 ${COLUMN_META[col].label}: ${msg}` }] : [];
        }),
      )
    : [];

  const hints = (
    <ul aria-label="키보드 단축키" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {KEY_HINTS.map(([key, text]) => (
        <li key={key} className="flex items-center gap-1.5">
          <kbd className="rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{key}</kbd>
          {text}
        </li>
      ))}
      <li>
        엑셀·스프레드시트에서 복사한 표를 그대로 붙여넣을 수 있습니다 (열 순서:{" "}
        {columns.map((c) => COLUMN_META[c].label).join(", ")}).
      </li>
    </ul>
  );

  return (
    <div className="space-y-3">
      {compact ? (
        <details className="group text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer select-none hover:text-foreground">키보드 단축키 · 붙여넣기</summary>
          <div className="mt-2">{hints}</div>
        </details>
      ) : (
        hints
      )}

      <div className="relative overflow-x-auto rounded-lg border bg-card shadow-xs">
        <table
          ref={tableRef}
          aria-label="여러 건 입력"
          className={cn("w-full border-collapse text-sm", compact ? "min-w-[620px]" : "min-w-[1080px]")}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        >
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th scope="col" className="w-10 px-2 py-2 text-right font-medium">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  scope="col"
                  className={cn(
                    "border-l px-2 py-2 text-left font-medium whitespace-nowrap",
                    compact ? COLUMN_META[col].compactWidth : COLUMN_META[col].width,
                    COLUMN_META[col].align === "right" && "text-right",
                  )}
                >
                  {COLUMN_META[col].label}
                  {!compact && (col === "merchant" || col === "note" || col === "payer") && (
                    <span className="ml-1 font-normal opacity-70">(선택)</span>
                  )}
                </th>
              ))}
              <th scope="col" className="w-10 border-l px-2 py-2">
                <span className="sr-only">행 작업</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const rowErrors = liveErrors?.[row.key];
              const type = resolveOption(row.type, TYPE_OPTIONS)?.id as BulkType | undefined;
              return (
                <tr key={row.key} className="border-b last:border-b-0">
                  <td className="px-2 text-right text-xs text-muted-foreground tabular-nums">
                    {rowErrors ? (
                      <AlertCircle className="ml-auto size-4 text-destructive" aria-label={`${r + 1}행 오류`} />
                    ) : (
                      r + 1
                    )}
                  </td>
                  {columns.map((col, c) => {
                    const meta = COLUMN_META[col];
                    const msg = rowErrors?.[col];
                    const label = `${r + 1}행 ${meta.label}`;
                    return (
                      <td key={col} className="border-l p-0" title={msg}>
                        {PICKER_COLUMNS.has(col) ? (
                          <ComboCell
                            cell={`${r}:${c}`}
                            label={label}
                            value={row[col]}
                            invalid={!!msg}
                            placeholder={col === "category" ? (type === "TRANSFER" ? "받는 계좌" : "카테고리") : undefined}
                            options={
                              col === "type"
                                ? TYPE_OPTIONS
                                : col === "category"
                                  ? type === "TRANSFER"
                                    ? lookups.accounts
                                    : type
                                      ? lookups.categories[type]
                                      : []
                                  : col === "account"
                                    ? lookups.accounts
                                    : lookups.members
                            }
                            onChange={(v) => setCell(row.key, col, v)}
                          />
                        ) : (
                          <input
                            data-cell={`${r}:${c}`}
                            aria-label={label}
                            aria-invalid={!!msg || undefined}
                            autoComplete="off"
                            inputMode={col === "amount" ? "decimal" : undefined}
                            placeholder={meta.placeholder}
                            value={row[col]}
                            maxLength={col === "note" ? 2000 : col === "merchant" ? 150 : undefined}
                            onChange={(e) => setCell(row.key, col, e.target.value)}
                            onBlur={
                              col === "date"
                                ? () => {
                                    const parsed = parseLooseDate(row.date, f.today);
                                    const shown = parsed && formatLooseDate(parsed, f.today);
                                    if (shown && shown !== row.date) setCell(row.key, "date", shown);
                                  }
                                : undefined
                            }
                            className={cellInputClass(!!msg, meta.align)}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="border-l p-0 text-center">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      tabIndex={-1}
                      aria-label={`${r + 1}행 삭제`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.key)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  입력 중인 행이 없습니다.{" "}
                  <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => appendRow(0)}>
                    행 추가
                  </button>
                  를 누른 뒤 입력하거나 엑셀 표를 붙여넣으세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {errorList.length > 0 && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium text-destructive">저장하지 못했습니다. 아래 칸을 고쳐 주세요.</p>
          <ul className="mt-1 space-y-0.5">
            {errorList.slice(0, 8).map((e) => (
              <li key={`${e.r}:${e.c}`}>
                <button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => focusCell(e.r, e.c)}>
                  {e.text}
                </button>
              </li>
            ))}
            {errorList.length > 8 && <li className="text-muted-foreground">외 {errorList.length - 8}개</li>}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => appendRow(0)} disabled={pending}>
          <Plus aria-hidden />행 추가
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          입력 {filled}건
          {valid.length > 0 && (
            <>
              {" · "}지출 <span className="font-medium text-foreground tabular-nums">{formatMoney(totals.expense, currency)}</span>
              {" · "}수입 <span className="font-medium text-foreground tabular-nums">{formatMoney(totals.income, currency)}</span>
              {totals.transfer > 0 && (
                <>
                  {" · "}이체 <span className="font-medium text-foreground tabular-nums">{formatMoney(totals.transfer, currency)}</span>
                </>
              )}
              {totals.refund > 0 && (
                <>
                  {" · "}환불 <span className="font-medium text-foreground tabular-nums">{formatMoney(totals.refund, currency)}</span>
                </>
              )}
            </>
          )}
        </p>
        <Button className="ml-auto" onClick={save} disabled={pending || filled === 0}>
          {pending ? "저장 중…" : `${filled}건 저장`}
          <kbd className="ml-1 hidden rounded-sm bg-primary-foreground/15 px-1 font-mono text-[10px] sm:inline">Ctrl+Enter</kbd>
        </Button>
      </div>
    </div>
  );
}
