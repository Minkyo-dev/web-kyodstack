import { Flag, Medal, Milestone, Repeat, Swords, Target, TrendingUp } from "lucide-react";
import type { LogEntry, LogKind } from "../utils/achievement-log";

const ICON: Record<LogKind, typeof Flag> = {
  goal: Target,
  project: Flag,
  milestone: Milestone,
  routine: Repeat,
  quest: Swords,
  achievement: Medal,
  level: TrendingUp,
};

/** 성취 로그 (ADR 0037 §7): newest first; each row names its kind in text, never by icon or color alone. */
export function AchievementLog({ entries, limit = 40, tracking }: { entries: LogEntry[]; limit?: number; tracking: boolean }) {
  const shown = entries.slice(0, limit);
  return (
    <section aria-labelledby="log-heading" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="log-heading" className="text-lg font-semibold">
          성취 로그
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {entries.length > limit ? `최근 ${limit}개 / 전체 ${entries.length}개` : `${entries.length}개`}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          마일스톤·프로젝트를 완료하거나 변화를 달성하거나 습관을 7번 연속 지키면 여기에 기록됩니다.
        </p>
      ) : (
        <ol aria-label="성취 로그" className="max-w-2xl divide-y divide-border rounded-md border border-border">
          {shown.map((e) => {
            const Icon = ICON[e.kind];
            return (
              <li key={e.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="w-28 shrink-0 font-mono text-[11px] tracking-wider">{e.tag}</span>
                <span className="min-w-0 flex-1 truncate">{e.text}</span>
                <time dateTime={e.date} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {e.date}
                </time>
              </li>
            );
          })}
        </ol>
      )}
      {!tracking && <p className="text-xs text-muted-foreground">게임 요소를 켜면 레벨 업·퀘스트·업적도 함께 기록됩니다.</p>}
    </section>
  );
}
