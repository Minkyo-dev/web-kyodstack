import type { VocabStats } from "../services/stats.service";

const LEVEL_OPACITY = [0, 0.3, 0.5, 0.75, 1];
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** 통계 (spec §8.3): tiles, a 12-week review heatmap (one hue, legend, tooltips, table), card and topic counts. */
export function StatsView({ stats }: { stats: VocabStats }) {
  const active = stats.heatmap.flat().filter((c) => c.reviews > 0);
  return (
    <div className="max-w-5xl space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="연속 학습" value={`${stats.streak.current}일`} hint={`최고 ${stats.streak.best}일`} />
        <Tile label="오늘 복습" value={`${stats.todayReviews}장`} hint={`한도 복습 ${stats.limits.reviewsPerDay} · 새 단어 ${stats.limits.newPerDay}`} />
        <Tile label="30일 기억률" value={stats.recall30 === null ? "—" : `${Math.round(stats.recall30 * 100)}%`} hint="복습 단계 카드 중 '다시'가 아닌 비율" />
        <Tile label="30일 복습" value={`${stats.reviews30}장`} />
      </div>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">최근 12주</h2>
          <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-hidden>
            적음
            {LEVEL_OPACITY.map((o, i) => (
              <span key={i} className={i === 0 ? "size-3 rounded-[2px] bg-muted" : "size-3 rounded-[2px] bg-primary"} style={i === 0 ? undefined : { opacity: o }} />
            ))}
            많음
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto" aria-hidden>
          <div className="grid grid-rows-7 gap-[3px] pt-0 text-[10px] text-muted-foreground">
            {WEEKDAY.map((d, i) => (
              <span key={d} className="h-3 leading-3">{i % 2 === 1 ? d : ""}</span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {stats.heatmap.map((week, w) => (
              <div key={w} className="grid grid-rows-7 gap-[3px]">
                {week.map((cell) => (
                  <span
                    key={cell.date}
                    title={cell.future ? undefined : `${cell.date} · ${cell.reviews}장`}
                    className={cell.future ? "size-3" : cell.level === 0 ? "size-3 rounded-[2px] bg-muted" : "size-3 rounded-[2px] bg-primary"}
                    style={cell.future || cell.level === 0 ? undefined : { opacity: LEVEL_OPACITY[cell.level] }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">표로 보기</summary>
          {active.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">최근 12주 동안 복습 기록이 없어요.</p>
          ) : (
            <table className="mt-2 text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-6 font-medium">날짜</th>
                  <th className="font-medium">복습</th>
                </tr>
              </thead>
              <tbody>
                {active.reverse().map((c) => (
                  <tr key={c.date}>
                    <td className="pr-6 tabular-nums">{c.date}</td>
                    <td className="tabular-nums">{c.reviews}장</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="space-y-2 rounded-lg border bg-card p-5 text-sm">
          <h2 className="font-semibold">카드 상태</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 tabular-nums">
            <dt>새 카드</dt>
            <dd>{stats.cards.fresh}</dd>
            <dt>학습 중</dt>
            <dd>{stats.cards.learning}</dd>
            <dt>숙련 (3주 이상)</dt>
            <dd>{stats.cards.mature}</dd>
            <dt>학습 완료</dt>
            <dd>{stats.cards.learned}</dd>
          </dl>
        </section>
        <section className="space-y-2 rounded-lg border bg-card p-5 text-sm">
          <h2 className="font-semibold">주제별 단어</h2>
          {stats.topics.length === 0 ? (
            <p className="text-muted-foreground">주제가 아직 없어요.</p>
          ) : (
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 tabular-nums">
              {stats.topics.map((t) => (
                <div key={t.name} className="contents">
                  <dt className="truncate">{t.name}</dt>
                  <dd>{t.count}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
