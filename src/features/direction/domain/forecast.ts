/** Deadline forecast `forecast-v1` (ADR 0044). Pure and linear; dates are local yyyy-MM-dd strings. */
export const FORECAST_VERSION = "forecast-v1";
const MIN_AGE_DAYS = 14;
const RECENT_DAYS = 28;
const FAR_DAYS = 730;

export type ForecastBasis = "recent" | "average";
export type Forecast =
  | { state: "none" }
  | { state: "done" }
  | { state: "collecting"; ageDays: number }
  | { state: "stalled"; basis: ForecastBasis }
  | { state: "far"; basis: ForecastBasis }
  | { state: "eta"; basis: ForecastBasis; date: string; daysLate: number | null };

const dayNumber = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
const fromDayNumber = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

export function forecast(i: {
  ratio: number | null;
  ratioBefore: number | null;
  createdDate: string;
  deadline: string | null;
  today: string;
  /** A numeric criterion not yet met: its past partial value is unknown, so the 28-day delta is not trusted. */
  openNumeric: boolean;
}): Forecast {
  if (i.ratio === null) return { state: "none" };
  if (i.ratio >= 1) return { state: "done" };
  const age = dayNumber(i.today) - dayNumber(i.createdDate);
  if (age < MIN_AGE_DAYS) return { state: "collecting", ageDays: Math.max(age, 0) };
  const recent = age >= RECENT_DAYS && !i.openNumeric && i.ratioBefore !== null;
  const basis: ForecastBasis = recent ? "recent" : "average";
  const rate = recent ? (i.ratio - i.ratioBefore!) / RECENT_DAYS : i.ratio / age;
  if (!(rate > 0)) return { state: "stalled", basis };
  const days = Math.ceil((1 - i.ratio) / rate);
  if (days > FAR_DAYS) return { state: "far", basis };
  const eta = dayNumber(i.today) + days;
  return { state: "eta", basis, date: fromDayNumber(eta), daysLate: i.deadline ? eta - dayNumber(i.deadline) : null };
}

const BASIS_TEXT: Record<ForecastBasis, string> = { recent: "최근 4주 속도", average: "시작 이후 평균 속도" };
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

/** One neutral sentence, or null when there is nothing to say. */
export function forecastText(f: Forecast): string | null {
  switch (f.state) {
    case "none":
    case "done":
      return null;
    case "collecting":
      return `시작한 지 ${f.ageDays}일 — 2주가 지나면 달성일을 예측해요.`;
    case "stalled":
      return `${BASIS_TEXT[f.basis]}로는 진척이 없어 달성일을 예측할 수 없어요.`;
    case "far":
      return `${BASIS_TEXT[f.basis]}로는 2년 넘게 걸려요.`;
    case "eta": {
      const base = `${BASIS_TEXT[f.basis]}면 ${md(f.date)}쯤 달성`;
      if (f.daysLate === null) return `${base}.`;
      if (f.daysLate > 0) return `${base} · 마감보다 ${f.daysLate}일 늦어요.`;
      if (f.daysLate < 0) return `${base} · 마감보다 ${-f.daysLate}일 여유.`;
      return `${base} · 마감 당일.`;
    }
  }
}
