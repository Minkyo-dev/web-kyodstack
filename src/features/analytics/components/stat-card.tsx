import { TASK_TYPE_LABEL, type TaskType } from "@/features/classification/domain/classification.types";
import { STAT_LABEL, type StatType, type StatValue, type Stats } from "../domain/stats.types";
import type { SnapshotRow } from "../queries/snapshots.queries";

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

/** Factual bias copy (D2 spec §2): never a judgment. */
export function biasText(bias: number | null, typicalError: number | null): string {
  if (bias === null) return "편향 계산 전";
  const head = Math.abs(bias) <= 0.05 ? "±5% 이내" : bias > 0 ? `보통 ${pct(bias)} 더 걸려요` : `보통 ${pct(bias)} 덜 걸려요`;
  return typicalError !== null ? `${head} · 오차 ±${pct(typicalError)}` : head;
}

export function StatCard({
  type,
  stat,
  detail,
  series,
}: {
  type: StatType;
  stat: StatValue;
  detail: string;
  series: SnapshotRow[];
}) {
  const id = `stat-${type}`;
  const label = STAT_LABEL[type];
  return (
    <article aria-labelledby={id} className="space-y-1.5 rounded-lg border border-border p-3">
      <h3 id={id} className="text-sm font-semibold">
        {label.name}
      </h3>
      <p className="text-xs text-muted-foreground">{label.meaning}</p>
      {stat.value !== null ? (
        <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
      ) : (
        <p className="py-1.5 text-sm text-muted-foreground">
          데이터 수집 중 · {stat.sampleCount}/{stat.need}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{detail}</p>
      <Sparkline points={series} />
    </article>
  );
}

/** 8-week trend. The line breaks at missing values and at formula version changes. */
export function Sparkline({ points }: { points: SnapshotRow[] }) {
  const values = points.filter((p) => p.value !== null);
  if (values.length < 2) {
    return <p className="text-[11px] text-muted-foreground">추이 데이터가 아직 없습니다.</p>;
  }
  const W = 120;
  const H = 32;
  const n = points.length;
  const x = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / 100) * H;
  const segments: string[][] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    const broken = p.value === null || (i > 0 && points[i - 1].formula_version !== p.formula_version);
    if (broken && cur.length) {
      segments.push(cur);
      cur = [];
    }
    if (p.value !== null) cur.push(`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  });
  if (cur.length) segments.push(cur);
  const first = values[0].value!;
  const last = values[values.length - 1].value!;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`최근 추이: ${Math.round(first)} → ${Math.round(last)}`}
      className="text-foreground/70"
    >
      {segments.map((s, i) =>
        s.length > 1 ? (
          <polyline key={i} points={s.join(" ")} fill="none" stroke="currentColor" strokeWidth={1.5} />
        ) : (
          <circle key={i} cx={s[0].split(",")[0]} cy={s[0].split(",")[1]} r={1.5} fill="currentColor" />
        ),
      )}
    </svg>
  );
}

export function CalibrationByType({ byType }: { byType: Stats["calibration"]["byType"] }) {
  const rows = (Object.entries(byType) as [TaskType, NonNullable<(typeof byType)[TaskType]>][]).filter(
    ([, v]) => v.value !== null,
  );
  if (rows.length === 0) return null;
  return (
    <table className="w-full max-w-lg text-sm">
      <caption className="pb-1 text-left text-xs text-muted-foreground">유형별 예상 정확도</caption>
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="font-normal">유형</th>
          <th className="font-normal">점수</th>
          <th className="font-normal">편향</th>
          <th className="font-normal">표본</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([type, v]) => (
          <tr key={type} className="border-t border-border">
            <td className="py-1">{TASK_TYPE_LABEL[type]}</td>
            <td className="tabular-nums">{v.value}</td>
            <td>{biasText(v.bias, null)}</td>
            <td className="tabular-nums">{v.sampleCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
