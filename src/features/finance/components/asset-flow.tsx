"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ACCOUNT_GROUPS } from "../domain/account-groups";
import { forecastSeries, monthTable, netWorthSeries, type Charge, type DailyBalanceRow, type SeriesPoint } from "../domain/balances";
import { formatCompact, formatMoney, formatSigned, fromCents, sumAmounts, toCents } from "../domain/money";
import { formatShortDay } from "../domain/period";
import { useFinance } from "./finance-provider";

const HEIGHT = 180;
const PAD = { top: 12, right: 12, bottom: 22, left: 64 };

/** Rounded axis bounds that include every value and leave a little air above and below. */
function bounds(values: number[]): [number, number] {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= Math.max(100, Math.abs(lo) * 0.1);
    hi += Math.max(100, Math.abs(hi) * 0.1);
  }
  const pad = (hi - lo) * 0.1;
  return [lo - pad, hi + pad];
}

type Props = {
  rows: DailyBalanceRow[];
  openingDay: string;
  monthStart: string;
  monthEnd: string;
  charges: Charge[];
  selected: string | null;
  onSelect: (date: string) => void;
};

/**
 * The month's asset flow under the calendar (ADR 0032): daily net worth (solid to today, dashed forecast after it from
 * the subscription charges) and, per account, the opening balance, the month's in / out / adjustments and the latest
 * balance. Clicking a day on the chart selects it like a calendar cell.
 */
export function AssetFlow({ rows, openingDay, monthStart, monthEnd, charges, selected, onSelect }: Props) {
  const f = useFinance();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { actual, forecast, opening, latest } = useMemo(() => {
    const series = netWorthSeries(rows);
    const opening = series.find((p) => p.day === openingDay)?.value ?? 0;
    const actual = series.filter((p) => p.day >= monthStart);
    const last = series.at(-1) ?? { day: openingDay, value: opening, change: 0 };
    let forecast: SeriesPoint[] = [];
    if (last.day < monthEnd) {
      // Charges between the last loaded day and the month start (a future month) lower the starting value.
      const before = sumAmounts(charges.filter((c) => c.date <= last.day).map((c) => c.amount));
      forecast = forecastSeries(fromCents(toCents(last.value) - toCents(before)), last.day, monthEnd, charges).filter(
        (p) => p.day >= monthStart || p.day === last.day,
      );
    }
    return { actual, forecast, opening, latest: last };
  }, [rows, openingDay, monthStart, monthEnd, charges]);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = new Date(`${monthStart}T00:00:00Z`); d.toISOString().slice(0, 10) <= monthEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }, [monthStart, monthEnd]);

  const points = new Map<string, { value: number; change: number; projected: boolean }>();
  for (const p of actual) points.set(p.day, { value: p.value, change: p.change, projected: false });
  for (const p of forecast) if (!points.has(p.day)) points.set(p.day, { value: p.value, change: p.change, projected: true });

  const values = [...points.values()].map((p) => p.value);
  const [lo, hi] = bounds(values.length ? values : [opening]);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = days.length ? plotW / days.length : 0;
  const x = (day: string) => PAD.left + slot * days.indexOf(day) + slot / 2;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const path = (pts: SeriesPoint[]) =>
    pts
      .filter((p) => days.includes(p.day))
      .map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join("");
  // The dashed line starts where the solid one ends so the two connect.
  const forecastPts = forecast.filter((p) => days.includes(p.day));
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
  // A small change on a large balance makes every compact label the same ("$39.8K"); show exact amounts then.
  const compact = new Set(ticks.map((t) => formatCompact(t, f.currency))).size === ticks.length;
  const tickLabel = (t: number) => (compact ? formatCompact(t, f.currency) : formatMoney(Math.round(t), f.currency));
  const active = hover ? points.get(hover) : null;
  const change = fromCents(toCents(latest.value) - toCents(opening));

  const table = monthTable(rows, openingDay);
  const byAccount = new Map(table.map((r) => [r.accountId, r]));
  const visible = f.accounts.filter((a) => {
    const r = byAccount.get(a.id);
    return a.is_active || (r && (r.start !== 0 || r.end !== 0 || r.inflow !== 0 || r.outflow !== 0 || r.adjustment !== 0));
  });
  const hasAdjustments = table.some((r) => r.adjustment !== 0);
  const endLabel = latest.day >= monthEnd ? "월말" : "오늘";
  const totalStart = sumAmounts(visible.map((a) => byAccount.get(a.id)?.start ?? 0));
  const totalEnd = sumAmounts(visible.map((a) => byAccount.get(a.id)?.end ?? 0));

  return (
    <section aria-labelledby="asset-flow" className="@container space-y-3 rounded-lg border border-border p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="asset-flow" className="text-sm font-medium">
          자산 흐름
        </h3>
        <p className="text-sm tabular-nums">
          순자산 <span className="font-semibold">{formatSigned(latest.value, f.currency)}</span>
          <span className="ml-2 text-xs text-muted-foreground">월초 대비 {formatSigned(change, f.currency)}</span>
        </p>
      </header>

      <div ref={ref} className="relative" style={{ height: HEIGHT }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`일별 순자산 선 그래프. 월초 ${formatSigned(opening, f.currency)}, ${endLabel} ${formatSigned(latest.value, f.currency)}. 계좌별 값은 아래 표에 있습니다.`}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                  {tickLabel(t)}
                </text>
              </g>
            ))}
            {days.map((d, i) =>
              i % 5 === 0 || i === days.length - 1 ? (
                <text key={d} x={x(d)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
                  {Number(d.slice(8))}
                </text>
              ) : null,
            )}
            {selected && days.includes(selected) && (
              <line x1={x(selected)} x2={x(selected)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-ring" strokeWidth={1.5} />
            )}
            {actual.length > 0 && <path d={path(actual)} fill="none" className="stroke-primary" strokeWidth={2} />}
            {forecastPts.length > 1 && (
              <path d={path(forecastPts)} fill="none" className="stroke-primary/70" strokeWidth={2} strokeDasharray="4 4" />
            )}
            {actual
              .filter((p) => days.includes(p.day))
              .map((p) => (
                <circle key={p.day} cx={x(p.day)} cy={y(p.value)} r={2.5} className="fill-primary" />
              ))}
            {hover && points.has(hover) && (
              <circle cx={x(hover)} cy={y(points.get(hover)!.value)} r={3.5} className="fill-background stroke-primary" strokeWidth={2} />
            )}
            {days.map((d) => (
              <rect
                key={d}
                data-flow-day={d}
                x={PAD.left + slot * days.indexOf(d)}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHover(d)}
                onClick={() => onSelect(d)}
              >
                <title>{formatShortDay(d)}</title>
              </rect>
            ))}
          </svg>
        )}
        {active && hover && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-md border border-border bg-popover p-2 text-xs shadow-md"
            style={{ left: Math.min(Math.max(0, x(hover) - 88), Math.max(0, width - 176)) }}
          >
            <p className="mb-1 font-medium">
              {formatShortDay(hover)}
              {active.projected && <span className="ml-1 font-normal text-muted-foreground">(예정)</span>}
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-muted-foreground">순자산</span>
              <span className="tabular-nums">{formatSigned(active.value, f.currency)}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-muted-foreground">그날 변화</span>
              <span className="tabular-nums">{formatSigned(active.change, f.currency)}</span>
            </p>
          </div>
        )}
      </div>
      <p className="flex gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-primary" />
          실제
        </span>
        {forecastPts.length > 1 && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-primary/70" />
            예정 (정기 결제 반영)
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        <table aria-label="계좌별 자산 흐름" className="w-full text-right text-xs tabular-nums">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-1.5 pr-2 text-left font-medium">계좌</th>
              <th scope="col" className="px-2 py-1.5 font-medium">월초</th>
              <th scope="col" className="hidden px-2 py-1.5 font-medium @xl:table-cell">들어옴</th>
              <th scope="col" className="hidden px-2 py-1.5 font-medium @xl:table-cell">나감</th>
              {hasAdjustments && <th scope="col" className="hidden px-2 py-1.5 font-medium @xl:table-cell">조정</th>}
              <th scope="col" className="hidden px-2 py-1.5 font-medium @sm:table-cell @xl:hidden">증감</th>
              <th scope="col" className="py-1.5 pl-2 font-medium">{endLabel}</th>
            </tr>
          </thead>
          {ACCOUNT_GROUPS.map((g) => {
            const items = visible.filter(g.match);
            if (items.length === 0) return null;
            return (
              <tbody key={g.label} className="border-b border-border">
                <tr>
                  <th scope="rowgroup" colSpan={7} className="pt-2 pb-0.5 text-left text-[10px] font-semibold tracking-widest text-muted-foreground">
                    {g.label}
                  </th>
                </tr>
                {items.map((a) => {
                  const r = byAccount.get(a.id);
                  return (
                    <tr key={a.id}>
                      <th scope="row" className="max-w-40 py-1 pr-2 text-left font-normal">
                        <span className="block truncate">{a.name}</span>
                        {!a.reconciled_on && <span className="block text-[10px] text-muted-foreground">맞춘 적 없음</span>}
                      </th>
                      <td className="px-2 py-1">{formatSigned(r?.start ?? 0, f.currency)}</td>
                      <td className="hidden px-2 py-1 @xl:table-cell">{r?.inflow ? `+${formatMoney(r.inflow, f.currency)}` : "—"}</td>
                      <td className="hidden px-2 py-1 @xl:table-cell">{r?.outflow ? `-${formatMoney(r.outflow, f.currency)}` : "—"}</td>
                      {hasAdjustments && (
                        <td className="hidden px-2 py-1 @xl:table-cell">{r?.adjustment ? formatSigned(r.adjustment, f.currency) : "—"}</td>
                      )}
                      <td className="hidden px-2 py-1 @sm:table-cell @xl:hidden">{formatSigned(fromCents(toCents(r?.end ?? 0) - toCents(r?.start ?? 0)), f.currency)}</td>
                      <td className="py-1 pl-2 font-medium">{formatSigned(r?.end ?? 0, f.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
          <tfoot>
            <tr className="font-medium">
              <th scope="row" className="py-1.5 pr-2 text-left">순자산</th>
              <td className="px-2 py-1.5">{formatSigned(totalStart, f.currency)}</td>
              <td colSpan={hasAdjustments ? 3 : 2} className="hidden px-2 py-1.5 text-muted-foreground @xl:table-cell">
                {formatSigned(fromCents(toCents(totalEnd) - toCents(totalStart)), f.currency)}
              </td>
              <td className="hidden px-2 py-1.5 text-muted-foreground @sm:table-cell @xl:hidden">
                {formatSigned(fromCents(toCents(totalEnd) - toCents(totalStart)), f.currency)}
              </td>
              <td className="py-1.5 pl-2">{formatSigned(totalEnd, f.currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
