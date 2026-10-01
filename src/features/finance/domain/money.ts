/**
 * Money math and formatting. Amounts arrive from Postgres numeric(14,2) as JS numbers; sums go through integer cents so
 * 0.1 + 0.2 never shows up as $0.30000000000000004.
 */
export const toCents = (amount: number | string): number => Math.round(Number(amount) * 100);
export const fromCents = (cents: number): number => cents / 100;

export function sumAmounts(values: (number | string)[]): number {
  return fromCents(values.reduce<number>((acc, v) => acc + toCents(v), 0));
}

/** Net = income − expense, in cents to avoid float drift. */
export const netOf = (income: number, expense: number): number => fromCents(toCents(income) - toCents(expense));

/** Savings rate = net / income (spec §11). Null when there is no income (no divide-by-zero). */
export function savingRate(income: number, expense: number): number | null {
  if (toCents(income) <= 0) return null;
  return netOf(income, expense) / income;
}

/**
 * Relative change from the previous period. Null when the previous value is 0 (no meaningful percentage).
 * The denominator is |previous| so a net that goes from −100 to −50 reads as an improvement (+50%).
 */
export function percentChange(current: number, previous: number): number | null {
  const prev = toCents(previous);
  if (prev === 0) return null;
  return (toCents(current) - prev) / Math.abs(prev);
}

const formatters = new Map<string, Intl.NumberFormat>();
function formatter(currency: string, cents: boolean) {
  const key = `${currency}:${cents}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: 2,
    });
    formatters.set(key, f);
  }
  return f;
}

/** "$1,234" or "$73.12": cents only when there are cents. Always unsigned. */
export function formatMoney(amount: number, currency = "CAD"): string {
  const abs = Math.abs(amount);
  return formatter(currency, toCents(abs) % 100 !== 0).format(abs);
}

/** "+$4,200" / "-$138": the sign is always shown so color is never the only cue (spec §37). Zero has no sign. */
export function formatSigned(amount: number, currency = "CAD"): string {
  const cents = toCents(amount);
  if (cents === 0) return formatMoney(0, currency);
  return `${cents > 0 ? "+" : "-"}${formatMoney(amount, currency)}`;
}

const symbols = new Map<string, string>();
function currencySymbol(currency: string): string {
  let symbol = symbols.get(currency);
  if (!symbol) {
    symbol = formatter(currency, false).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
    symbols.set(currency, symbol);
  }
  return symbol;
}

/**
 * Compact label for axes and small calendar cells: "$950", "$4.2K", "$1.5M". Hand-rolled because Intl's compact
 * notation differs between Node's and the browser's ICU ("$30" vs "$30.0"), which breaks hydration.
 */
export function formatCompact(amount: number, currency = "CAD"): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const one = (v: number) => (Math.round(v * 10) / 10).toString();
  let body: string;
  if (abs < 1000) body = String(Math.round(abs));
  else if (abs < 999_950) body = `${one(abs / 1000)}K`;
  else body = `${one(abs / 1_000_000)}M`;
  return `${sign}${currencySymbol(currency)}${body}`;
}

/** "36.7%"; one decimal. */
export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** Parses a user-typed amount ("1,234.5", "$12") into a positive number with at most two decimals, or null. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 && value < 1e12 ? value : null;
}
