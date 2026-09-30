import type { Progress } from "../utils/progress";
import { formatMinutes } from "@/features/scheduler/utils/duration";

/** Bar + explicit numbers, so progress is never conveyed by color or length alone. */
export function ProgressBar({ progress, label }: { progress: Progress; label: string }) {
  const pct = Math.round(progress.ratio * 100);
  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${progress.completed}/${progress.total} 완료`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
        <span>
          완료 {progress.completed}/{progress.total}
        </span>
        <span>남은 예상 {formatMinutes(progress.remainingMinutes)}</span>
        <span>실제 {formatMinutes(progress.actualMinutes)}</span>
      </p>
    </div>
  );
}
