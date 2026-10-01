import { isLocalDateString } from "@/features/scheduler/utils/timezone";
import { parseAmount } from "./money";

/**
 * Bulk entry grid (ADR 0027): pure helpers. Every cell is free text, the way a spreadsheet works; picker cells
 * (type, category, account, payer) resolve their text to an option when the row is saved.
 */

export const BULK_COLUMNS = ["date", "type", "amount", "category", "account", "merchant", "payer", "note"] as const;
export type BulkColumn = (typeof BULK_COLUMNS)[number];
export type BulkRow = Record<BulkColumn, string> & { key: string };

export type BulkType = "EXPENSE" | "INCOME" | "TRANSFER";
export const BULK_TYPE_LABEL: Record<BulkType, string> = { EXPENSE: "지출", INCOME: "수입", TRANSFER: "이체" };

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  const value = `${y}-${pad(m)}-${pad(d)}`;
  if (!isLocalDateString(value)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : null;
}

/**
 * Loose date input, relative to `today` (yyyy-MM-dd): "2026-10-03", "2026.10.3", "10/3", "10-3", "10월 3일", "3"
 * (day of this month), "오늘", "어제". Returns yyyy-MM-dd or null.
 */
export function parseLooseDate(input: string, today: string): string | null {
  const text = input.trim();
  const [ty, tm, td] = today.split("-").map(Number);
  if (!text) return null;
  if (text === "오늘") return today;
  if (text === "어제") {
    const d = new Date(Date.UTC(ty, tm - 1, td - 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  let m = text.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = text.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/);
  if (m) return validDate(ty, Number(m[1]), Number(m[2]));
  m = text.match(/^(\d{1,2})\s*일?$/);
  if (m) return validDate(ty, tm, Number(m[1]));
  return null;
}

/** How a parsed date shows in a cell: "10/3" in the current year (it parses back the same), else yyyy-MM-dd. */
export function formatLooseDate(iso: string, today: string): string {
  if (iso.slice(0, 4) !== today.slice(0, 4)) return iso;
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}

export type PickOption = { id: string; label: string; aliases?: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[\s>›/]+/g, "");

/** Options whose label (or an alias) contains the query; prefix matches first. An empty query returns everything. */
export function filterOptions<T extends PickOption>(query: string, options: T[]): T[] {
  const q = norm(query);
  if (!q) return options;
  const keys = (o: T) => [o.label, ...(o.aliases ?? [])].map(norm);
  const starts = options.filter((o) => keys(o).some((k) => k.startsWith(q)));
  const contains = options.filter((o) => !starts.includes(o) && keys(o).some((k) => k.includes(q)));
  return [...starts, ...contains];
}

/** Resolves typed text to one option: an exact label/alias match, else the only option that matches. */
export function resolveOption<T extends PickOption>(query: string, options: T[]): T | null {
  const q = norm(query);
  if (!q) return null;
  const exact = options.filter((o) => [o.label, ...(o.aliases ?? [])].some((k) => norm(k) === q));
  if (exact.length === 1) return exact[0];
  const matches = filterOptions(query, options);
  return matches.length === 1 ? matches[0] : null;
}

/** Tab-separated rows from a spreadsheet copy. A trailing newline does not make an extra row. */
export function parseClipboardGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => line.split("\t"));
}

/** A row the user has not typed anything into (defaults such as date, type and account do not count). */
export function isBlankRow(row: BulkRow): boolean {
  return !row.amount.trim() && !row.category.trim() && !row.merchant.trim() && !row.note.trim();
}

export type BulkLookups = {
  today: string;
  types: PickOption[];
  categories: Record<Exclude<BulkType, "TRANSFER">, PickOption[]>;
  accounts: PickOption[];
  members: PickOption[];
};

export type BulkPayload = {
  type: BulkType;
  amount: number;
  accountId: string;
  /** Income/expense only. */
  categoryId: string | null;
  /** Transfer only: the receiving account. */
  transferAccountId: string | null;
  date: string;
  merchantName: string;
  paidByUserId: string | null;
  note: string;
};

export type RowCheck = { payload: BulkPayload; errors: null } | { payload: null; errors: Partial<Record<BulkColumn, string>> };

/**
 * Turns one grid row into a create payload, or per-cell error messages. On a transfer row the category cell holds the
 * receiving account and the account cell the sending one (spec §22: a transfer has no category).
 */
export function checkRow(row: BulkRow, lookups: BulkLookups): RowCheck {
  const errors: Partial<Record<BulkColumn, string>> = {};
  const date = parseLooseDate(row.date, lookups.today);
  if (!date) errors.date = "날짜를 알 수 없습니다. 예: 2026-10-03, 10/3, 3";
  const type = resolveOption(row.type, lookups.types)?.id as BulkType | undefined;
  if (!type) errors.type = "지출, 수입, 이체 중 하나를 입력하세요.";
  const amount = parseAmount(row.amount);
  if (amount === null) errors.amount = "0보다 큰 금액(소수점 둘째 자리까지)을 입력하세요.";
  const account = resolveOption(row.account, lookups.accounts);
  if (!account) errors.account = row.account.trim() ? "계좌를 찾을 수 없습니다." : "계좌를 입력하세요.";
  let category: PickOption | null = null;
  let target: PickOption | null = null;
  if (type === "TRANSFER") {
    target = resolveOption(row.category, lookups.accounts);
    if (!target) errors.category = row.category.trim() ? "받는 계좌를 찾을 수 없습니다." : "받는 계좌를 입력하세요.";
    else if (account && target.id === account.id) errors.category = "보내는 계좌와 받는 계좌가 같습니다.";
  } else if (type) {
    category = resolveOption(row.category, lookups.categories[type]);
    if (!category) errors.category = row.category.trim() ? "카테고리를 찾을 수 없습니다." : "카테고리를 입력하세요.";
  }
  const payer = row.payer.trim() ? resolveOption(row.payer, lookups.members) : null;
  if (row.payer.trim() && !payer) errors.payer = "가계 구성원이 아닙니다.";
  if (row.merchant.length > 150) errors.merchant = "150자까지 입력할 수 있습니다.";
  if (row.note.length > 2000) errors.note = "2000자까지 입력할 수 있습니다.";

  if (Object.keys(errors).length > 0) return { payload: null, errors };
  return {
    payload: {
      type: type!,
      amount: amount!,
      accountId: account!.id,
      categoryId: category?.id ?? null,
      transferAccountId: target?.id ?? null,
      date: date!,
      merchantName: row.merchant.trim(),
      paidByUserId: payer?.id ?? null,
      note: row.note.trim(),
    },
    errors: null,
  };
}
