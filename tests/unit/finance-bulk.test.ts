import { describe, expect, it } from "vitest";
import {
  checkRow,
  filterOptions,
  formatLooseDate,
  isBlankRow,
  parseClipboardGrid,
  parseLooseDate,
  resolveOption,
  type BulkLookups,
  type BulkRow,
} from "@/features/finance/domain/bulk-entry";
import { createTransactionsSchema } from "@/features/finance/schemas/finance.schema";

const today = "2026-10-15";

describe("formatLooseDate", () => {
  it("shows M/D in the current year, the full date otherwise, and parses back the same", () => {
    expect(formatLooseDate("2026-10-03", today)).toBe("10/3");
    expect(formatLooseDate("2099-01-20", today)).toBe("2099-01-20");
    for (const iso of ["2026-01-09", "2025-12-31"]) expect(parseLooseDate(formatLooseDate(iso, today), today)).toBe(iso);
  });
});

describe("parseLooseDate", () => {
  it.each([
    ["2026-10-03", "2026-10-03"],
    ["2026.9.3", "2026-09-03"],
    ["10/3", "2026-10-03"],
    ["9-30", "2026-09-30"],
    ["10월 3일", "2026-10-03"],
    ["3", "2026-10-03"],
    ["3일", "2026-10-03"],
    ["오늘", "2026-10-15"],
    ["어제", "2026-10-14"],
  ])("%s → %s", (input, expected) => {
    expect(parseLooseDate(input, today)).toBe(expected);
  });

  it("rejects impossible or unknown dates", () => {
    expect(parseLooseDate("2/30", today)).toBeNull();
    expect(parseLooseDate("13/1", today)).toBeNull();
    expect(parseLooseDate("내일모레", today)).toBeNull();
    expect(parseLooseDate("", today)).toBeNull();
  });

  it("어제 crosses a month boundary", () => {
    expect(parseLooseDate("어제", "2026-03-01")).toBe("2026-02-28");
  });
});

const options = [
  { id: "food", label: "식비" },
  { id: "groc", label: "식비 > 장보기", aliases: ["장보기"] },
  { id: "cafe", label: "식비 > 카페", aliases: ["카페"] },
  { id: "home", label: "주거" },
];

describe("option matching", () => {
  it("filters by prefix first, then substring, ignoring spaces and >", () => {
    expect(filterOptions("식비", options).map((o) => o.id)).toEqual(["food", "groc", "cafe"]);
    expect(filterOptions("장", options).map((o) => o.id)).toEqual(["groc"]);
    expect(filterOptions("", options)).toHaveLength(4);
  });

  it("resolves an exact label or alias, else a unique match", () => {
    expect(resolveOption("식비", options)?.id).toBe("food");
    expect(resolveOption("장보기", options)?.id).toBe("groc");
    expect(resolveOption("식비>카페", options)?.id).toBe("cafe");
    expect(resolveOption("주", options)?.id).toBe("home");
    expect(resolveOption("식", options)).toBeNull();
    expect(resolveOption("없음", options)).toBeNull();
  });
});

describe("parseClipboardGrid", () => {
  it("splits spreadsheet rows and cells, dropping the trailing newline", () => {
    expect(parseClipboardGrid("10/1\t지출\t12.5\r\n10/2\t수입\t100\r\n")).toEqual([
      ["10/1", "지출", "12.5"],
      ["10/2", "수입", "100"],
    ]);
    expect(parseClipboardGrid("hello")).toEqual([["hello"]]);
  });
});

const lookups: BulkLookups = {
  today,
  types: [
    { id: "EXPENSE", label: "지출", aliases: ["-"] },
    { id: "INCOME", label: "수입", aliases: ["+"] },
    { id: "TRANSFER", label: "이체" },
  ],
  categories: { EXPENSE: options, INCOME: [{ id: "salary", label: "급여" }] },
  accounts: [
    { id: "a1", label: "TD Debit" },
    { id: "a2", label: "AMEX" },
  ],
  members: [{ id: "u1", label: "MK" }],
};
const row = (over: Partial<BulkRow> = {}): BulkRow => ({
  key: "k",
  date: "10/3",
  type: "지출",
  amount: "1,234.50",
  category: "장보기",
  account: "TD",
  merchant: " Loblaws ",
  payer: "MK",
  note: "",
  ...over,
});

describe("checkRow", () => {
  it("builds a payload from loose text", () => {
    expect(checkRow(row(), lookups)).toEqual({
      payload: {
        type: "EXPENSE",
        amount: 1234.5,
        accountId: "a1",
        categoryId: "groc",
        transferAccountId: null,
        date: "2026-10-03",
        merchantName: "Loblaws",
        paidByUserId: "u1",
        note: "",
      },
      errors: null,
    });
  });

  it("checks the category against the row's type", () => {
    expect(checkRow(row({ type: "+", category: "급여" }), lookups).payload?.categoryId).toBe("salary");
    expect(checkRow(row({ type: "수입" }), lookups).errors).toEqual({ category: "카테고리를 찾을 수 없습니다." });
  });

  it("a transfer row takes the receiving account in the category cell", () => {
    const result = checkRow(row({ type: "이체", category: "AMEX" }), lookups);
    expect(result.payload).toMatchObject({ type: "TRANSFER", accountId: "a1", transferAccountId: "a2", categoryId: null });
    expect(checkRow(row({ type: "이체", category: "TD Debit" }), lookups).errors).toEqual({
      category: "보내는 계좌와 받는 계좌가 같습니다.",
    });
    expect(checkRow(row({ type: "이체", category: "장보기" }), lookups).errors).toEqual({
      category: "받는 계좌를 찾을 수 없습니다.",
    });
  });

  it("reports every bad cell", () => {
    const result = checkRow(row({ date: "x", amount: "0", account: "", payer: "누구" }), lookups);
    expect(Object.keys(result.errors ?? {}).sort()).toEqual(["account", "amount", "date", "payer"]);
  });

  it("an empty payer means nobody", () => {
    expect(checkRow(row({ payer: "" }), lookups).payload?.paidByUserId).toBeNull();
  });

  it("a row with only defaults is blank", () => {
    expect(isBlankRow(row({ amount: "", category: "", merchant: "", note: "" }))).toBe(true);
    expect(isBlankRow(row())).toBe(false);
  });
});

describe("createTransactionsSchema", () => {
  const base = { type: "EXPENSE", amount: "10", accountId: crypto.randomUUID(), categoryId: crypto.randomUUID(), date: "2026-10-03" };
  it("accepts expense, income and transfer rows", () => {
    const transfer = { ...base, type: "TRANSFER", transferAccountId: crypto.randomUUID(), categoryId: null };
    expect(createTransactionsSchema.safeParse({ rows: [base, { ...base, type: "INCOME" }, transfer] }).success).toBe(true);
  });
  it("rejects a transfer without a receiving account, an empty batch and more than 200 rows", () => {
    expect(createTransactionsSchema.safeParse({ rows: [{ ...base, type: "TRANSFER", categoryId: null }] }).success).toBe(false);
    expect(createTransactionsSchema.safeParse({ rows: [] }).success).toBe(false);
    expect(createTransactionsSchema.safeParse({ rows: Array(201).fill(base) }).success).toBe(false);
  });
});
