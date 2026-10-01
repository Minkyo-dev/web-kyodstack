import { XP_RULE_LABEL, XP_RULES, type XpRule } from "../domain/xp.types";
import { QUEST_META } from "../domain/quest.types";
import { TITLES } from "../utils/achievements";
import { levelFor } from "../utils/level";
import type { QuestView } from "../utils/quest-view";
import { GamificationSettingsDialog } from "./gamification-settings-dialog";
import type { PlayerProfile } from "../queries/xp.queries";

export function PlayerSection({
  profile,
  week,
  quests,
}: {
  profile: PlayerProfile;
  week: Record<XpRule, number>;
  quests: QuestView[];
}) {
  const lv = levelFor(profile.total_xp);
  return (
    <section aria-labelledby="player-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="player-heading" className="text-lg font-semibold">플레이어</h2>
        <GamificationSettingsDialog profile={profile} />
      </div>
      <div className="max-w-lg space-y-1">
        <p className="flex items-baseline gap-3">
          <span className="font-mono text-2xl font-semibold">Lv.{lv.level}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{lv.into} / {lv.need} XP · 누적 {profile.total_xp} XP</span>
        </p>
        {profile.equipped_title && (
          <p className="font-mono text-xs tracking-widest text-muted-foreground">{TITLES[profile.equipped_title] ?? profile.equipped_title}</p>
        )}
        <div className="h-1.5 rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(lv.into / lv.need) * 100}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">XP는 능력이 아니라 활동량입니다.</p>
      </div>
      <dl aria-label="최근 7일 XP" className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {XP_RULES.map((r) => (
          <div key={r} className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{XP_RULE_LABEL[r]}</dt>
            <dd className="font-medium tabular-nums">{week[r]} XP</dd>
          </div>
        ))}
      </dl>
      {quests.length > 0 && (
        <ul aria-label="진행 중인 퀘스트" className="space-y-0.5 text-xs">
          {quests.map((q) => (
            <li key={q.id} className="flex gap-1.5">
              <span className="font-mono tracking-wider">{QUEST_META[q.type].label}</span>
              <span className="text-muted-foreground">· {q.title}</span>
              <span className="tabular-nums">
                · {q.status === "cleared" ? "CLEARED" : `${q.objectives.filter((o) => o.done).length}/${q.objectives.length}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
