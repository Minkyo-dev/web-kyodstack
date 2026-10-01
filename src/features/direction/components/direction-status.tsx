import Link from "next/link";
import type { Terms } from "@/lib/terms";
import { formatMinutes } from "@/features/scheduler/utils/duration";
import { DueBadge } from "@/features/projects/components/due-badge";
import { STATUS_TEXT } from "../domain/status-text";
import { DiagnosisQuestion } from "./diagnosis-question";
import type { DirectionStatus as Status, MissionStatusView } from "../queries/status.queries";

const MIN_ACTIVE_MINUTES = 180;
const PACE_NOTE_GAP = 0.25;

function Bar({ ratio, label }: { ratio: number; label: string }) {
  const pct = Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full bg-success" style={{ width: `${pct}%` }} />
    </div>
  );
}

function MissionCard({ m, today, weekStart }: { m: MissionStatusView; today: string; weekStart: string }) {
  const { progress: p } = m;
  const pct = p.ratio === null ? null : Math.round(p.ratio * 100);
  const basis =
    p.kind === "criteria" ? `기준 ${p.basis!.done}/${p.basis!.total}` : p.kind === "projects" ? `프로젝트 작업 ${p.basis!.done}/${p.basis!.total}` : null;
  return (
    <article aria-label={m.title} className="space-y-1.5 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/scheduler/directive?mission=${m.id}#mission-detail`} className="font-medium hover:underline">
          {m.title}
        </Link>
        <DueBadge today={today} target={m.deadline} closed={false} />
      </div>
      {pct !== null && <Bar ratio={p.ratio!} label={`${m.title} 진행률`} />}
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
        {pct !== null && <span className="font-medium text-foreground">{pct}%</span>}
        {basis && <span>{basis}</span>}
        <span>최근 28일 집중 {formatMinutes(p.focusMinutes)}</span>
      </p>
      {m.pace !== null && m.pace >= PACE_NOTE_GAP && m.diagnosis.suspected !== "goal" && (
        <p className="text-xs text-muted-foreground">{STATUS_TEXT.paceBehind}</p>
      )}
      <DiagnosisQuestion missionId={m.id} diagnosis={m.diagnosis} weekStart={weekStart} />
    </article>
  );
}

/** ACTIVE MISSION · SELECTED PATH · THIS WEEK · identity evidence (G3, ADR 0022). Numbers first, no judgment. */
export function DirectionStatus({ status, terms }: { status: Status; terms: Terms }) {
  const { week } = status;
  const path = status.missions[0]?.path ?? null;
  const ratio = week.activeMinutes > 0 ? Math.round((week.alignedMinutes / week.activeMinutes) * 100) : 0;
  return (
    <section aria-label={`${terms.mission} 현황`} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.mission}</h2>
        {status.missions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {STATUS_TEXT.noMission}{" "}
            <Link href="/scheduler/directive" className="underline-offset-2 hover:underline">
              {terms.directiveNav}
            </Link>
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-3">
            {status.missions.map((m) => (
              <MissionCard key={m.id} m={m} today={status.today} weekStart={status.weekStart} />
            ))}
          </div>
        )}
      </div>

      {path && (
        <div className="space-y-1 border-t border-border pt-3">
          <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.path}</h2>
          <p className="font-medium">{path.title}</p>
          <p className="line-clamp-1 text-sm text-muted-foreground">{path.approach}</p>
        </div>
      )}

      <div aria-label="이번 주" role="region" className="space-y-2 border-t border-border pt-3">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">이번 주</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">집중 시간</dt>
            <dd className="tabular-nums">{formatMinutes(week.activeMinutes)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{`${terms.mission} 연결 시간`}</dt>
            {week.activeMinutes < MIN_ACTIVE_MINUTES ? (
              <dd className="text-muted-foreground">{STATUS_TEXT.collecting}</dd>
            ) : (
              <dd className="tabular-nums" title={`${ratio}%`}>
                {formatMinutes(week.alignedMinutes)}
                {week.offPathMinutes > 0 && (
                  <span className="block text-xs text-muted-foreground">{STATUS_TEXT.offPath(formatMinutes(week.offPathMinutes))}</span>
                )}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{`완료한 ${terms.task}`}</dt>
            <dd className="tabular-nums">
              {week.tasksDone}/{week.tasksTotal}
            </dd>
          </div>
          {week.habitsScheduled > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">{terms.habits}</dt>
              <dd className="tabular-nums">
                {week.habitsDone}/{week.habitsScheduled} ({Math.round((week.habitsDone / week.habitsScheduled) * 100)}%)
              </dd>
            </div>
          )}
        </dl>
        {status.identities.length > 0 && (
          <ul aria-label={`${terms.identity} 근거`} className="space-y-1 text-sm">
            {status.identities.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{i.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  세션 {i.sessions}
                  {i.scheduled > 0 && ` · ${terms.habit} ${i.done}/${i.scheduled}`}
                </span>
                {i.sentence && <span className="text-xs">{i.sentence}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
