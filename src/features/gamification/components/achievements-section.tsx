import { toLocalDate } from "@/features/scheduler/utils/timezone";
import { ACHIEVEMENTS, type AchievementFacts } from "../utils/achievements";

/** Achievement cards (E2 spec §5): locked shows the condition and progress, unlocked the date. */
export function AchievementsSection({
  facts,
  unlocked,
  timezone,
}: {
  facts: AchievementFacts;
  unlocked: { key: string; unlocked_at: string }[];
  timezone: string;
}) {
  const at = new Map(unlocked.map((u) => [u.key, u.unlocked_at]));
  const keys = new Set(at.keys());
  return (
    <section aria-labelledby="achievements-heading" className="space-y-2">
      <h2 id="achievements-heading" className="text-lg font-semibold">
        업적
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ACHIEVEMENTS.map((a) => {
          const date = at.get(a.key);
          const p = a.progress(facts, keys);
          return (
            <li key={a.key} className="rounded-md border border-border p-3 text-sm">
              <p className="flex items-center gap-2 font-mono text-xs tracking-wider">
                <span aria-hidden>{date ? "☑" : "☐"}</span>
                <span className="sr-only">{date ? "달성" : "미달성"}</span>
                {a.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
              <p className="mt-1 text-xs tabular-nums">
                {date ? `달성 · ${toLocalDate(date, timezone)}` : `${Math.min(p.current, p.target)} / ${p.target}`}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
