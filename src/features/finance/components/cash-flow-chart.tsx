"use client";

import { useEffect, useRef, useState } from "react";
import { formatCompact, formatMoney, formatSigned } from "../domain/money";

export type FlowBucket = { key: string; label: string; tick: string; income: number; expense: number; net: number };

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 48 };

/** 1, 2, 4, 6, 8 × 10^n ceiling: the max and its half are both round axis labels. */
function niceMax(value: number): number {
  if (value <= 0) return 100;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  const step = [1, 2, 4, 6, 8, 10].find((s) => f <= s)!;
  return step * exp;
}

/** Rounded at the data end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Income vs expense per day (monthly) or per month (yearly), side by side on one axis (spec §13, §15). Hover shows
 * the bucket's numbers; the table view below carries the same data for screen readers and exact values.
 */
export function CashFlowChart({
  buckets,
  currency,
  title,
  tickEvery = 1,
}: {
  buckets: FlowBucket[];
  currency: string;
  title: string;
  tickEvery?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...buckets.map((b) => Math.max(b.income, b.expense))));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = buckets.length ? plotW / buckets.length : 0;
  const gap = 2;
  const barW = Math.max(1, Math.min(18, (slot - 4) / 2 - gap / 2));
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / max) * plotH;
  const ticks = [0, max / 2, max];
  const active = hover !== null ? buckets[hover] : null;

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-income" />
            수입
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-expense" />
            지출
          </span>
        </span>
      </figcaption>
      <div ref={ref} className="relative" style={{ height: HEIGHT }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={`${title}: 수입과 지출 막대 그래프. 정확한 값은 아래 표에 있습니다.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                  {formatCompact(t, currency)}
                </text>
              </g>
            ))}
            {buckets.map((b, i) => {
              const cx = PAD.left + slot * i + slot / 2;
              const ix = cx - barW - gap / 2;
              const ex = cx + gap / 2;
              return (
                <g key={b.key} opacity={hover === null || hover === i ? 1 : 0.45}>
                  <path d={barPath(ix, y(b.income), barW, y(0) - y(b.income))} className="fill-income" />
                  <path d={barPath(ex, y(b.expense), barW, y(0) - y(b.expense))} className="fill-expense" />
                  {i % tickEvery === 0 && (
                    <text x={cx} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
                      {b.tick}
                    </text>
                  )}
                  <rect
                    x={PAD.left + slot * i}
                    y={PAD.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onClick={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {active && hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 w-40 rounded-md border border-border bg-popover p-2 text-xs shadow-md"
            style={{
              left: Math.min(Math.max(0, PAD.left + slot * hover + slot / 2 - 80), Math.max(0, width - 160)),
            }}
          >
            <p className="mb-1 font-medium">{active.label}</p>
            <p className="flex justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-[2px] bg-income" />
                수입
              </span>
              <span className="tabular-nums">{formatMoney(active.income, currency)}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-[2px] bg-expense" />
                지출
              </span>
              <span className="tabular-nums">{formatMoney(active.expense, currency)}</span>
            </p>
            <p className="mt-1 flex justify-between gap-2 border-t border-border pt-1">
              <span className="text-muted-foreground">순수입</span>
              <span className="tabular-nums">{formatSigned(active.net, currency)}</span>
            </p>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">표로 보기</summary>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-right text-xs tabular-nums">
            <thead className="sticky top-0 bg-background text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-1.5 text-left font-medium">기간</th>
                <th scope="col" className="px-3 py-1.5 font-medium">수입</th>
                <th scope="col" className="px-3 py-1.5 font-medium">지출</th>
                <th scope="col" className="px-3 py-1.5 font-medium">순수입</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {buckets
                .filter((b) => b.income !== 0 || b.expense !== 0)
                .map((b) => (
                  <tr key={b.key}>
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">{b.label}</th>
                    <td className="px-3 py-1.5">{formatMoney(b.income, currency)}</td>
                    <td className="px-3 py-1.5">{formatMoney(b.expense, currency)}</td>
                    <td className="px-3 py-1.5">{formatSigned(b.net, currency)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
