import type { dueBuckets, forecast } from "../domain/stats";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (date: string, i: number) => (i === 0 ? "오늘" : WEEKDAY[new Date(`${date}T12:00:00Z`).getUTCDay()]);

/**
 * Home (spec §8.1): cumulative due buckets as text, and a 7-day forecast as one-series bars (single hue, direct
 * labels, a title tooltip per bar, and a table for screen readers).
 */
export function DueOutlook({ buckets, days }: { buckets: ReturnType<typeof dueBuckets>; days: ReturnType<typeof forecast> }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">복습 예정</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          오늘 {buckets.today} · 1일 내 {buckets.d1} · 3일 내 {buckets.d3} · 7일 내 {buckets.d7}
        </p>
      </div>
      <div className="grid h-28 grid-cols-7 items-end gap-2" aria-hidden>
        {days.map((d, i) => (
          <div key={d.date} className="flex h-full flex-col items-center justify-end gap-1" title={`${d.date} · ${d.count}장`}>
            <span className="text-xs text-muted-foreground tabular-nums">{d.count}</span>
            <div className="w-full max-w-10 rounded-t-[4px] bg-primary" style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 72)}px`, opacity: d.count ? 1 : 0.25 }} />
            <span className={i === 0 ? "text-xs font-medium" : "text-xs text-muted-foreground"}>{dayLabel(d.date, i)}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>앞으로 7일 복습 예정</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d.count}장</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
