import { formatMinutes } from "@/features/scheduler/utils/duration";
import { practiceLevel } from "@/features/gamification/utils/level";
import type { Terms } from "@/lib/terms";
import type { Stats } from "../domain/stats.types";

/** Practice time per domain; parents include their children (D2 spec §2). Practice levels when gamification is on (E1). */
export function DomainBars({
  domains,
  practice = false,
  terms,
}: {
  domains: Stats["domains"];
  practice?: boolean;
  terms: Terms;
}) {
  const top = domains.slice(0, 8);
  const max = Math.max(1, ...top.map((d) => d.recentMinutes));
  return (
    <section aria-labelledby="domains-heading" className="space-y-2">
      <h2 id="domains-heading" className="text-lg font-semibold">
        연습 영역
      </h2>
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">{terms.task}에 영역(@영역)을 붙이면 영역별 연습 시간이 쌓입니다.</p>
      ) : (
        <ul className="max-w-lg space-y-2">
          {top.map((d) => (
            <li key={d.id} className="space-y-1">
              <div className="flex justify-between gap-2 text-sm">
                <span className={d.parentId ? "pl-3" : undefined}>{d.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {practice && `Practice Lv.${practiceLevel(d.totalMinutes)} · `}
                  최근 4주 {formatMinutes(d.recentMinutes)} · 전체 {formatMinutes(d.totalMinutes)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(d.recentMinutes / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
