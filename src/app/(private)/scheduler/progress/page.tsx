import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadStatInput } from "@/features/analytics/queries/stat-input.queries";
import { listSnapshots } from "@/features/analytics/queries/snapshots.queries";
import { computeStats } from "@/features/analytics/utils/stats";
import type { StatType } from "@/features/analytics/domain/stats.types";
import { biasText, CalibrationByType, StatCard } from "@/features/analytics/components/stat-card";
import { PatternList } from "@/features/analytics/components/pattern-list";
import { DomainBars } from "@/features/analytics/components/domain-bars";
import { WorkStandardsDialog } from "@/features/analytics/components/work-standards-dialog";
import { addLocalDays, toLocalDate } from "@/features/scheduler/utils/timezone";
import { getPlayerProfile, xpByRuleSince } from "@/features/gamification/queries/xp.queries";
import { EnableCard } from "@/features/gamification/components/enable-card";
import { PlayerSection } from "@/features/gamification/components/player-section";
import { AchievementsSection } from "@/features/gamification/components/achievements-section";
import { TitleList } from "@/features/gamification/components/title-list";
import { listUnlocked, loadAchievementFacts } from "@/features/gamification/services/achievement.service";
import { listQuests } from "@/features/gamification/queries/quest.queries";
import { toQuestViews } from "@/features/gamification/utils/quest-view";
import { termsFor } from "@/lib/terms";

export const metadata: Metadata = { title: "진행", robots: { index: false } };

/** Live stats (always current) with 8-week trends from nightly snapshots (D2 spec §3). */
export default async function ProgressPage() {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const now = new Date();
  const input = await loadStatInput(supabase, user.id, now);
  const stats = computeStats(input);
  const today = toLocalDate(now, input.timezone);
  const snapshots = await listSnapshots(supabase, user.id, addLocalDays(today, -56, input.timezone));
  const profile = await getPlayerProfile(supabase, user.id);
  const week = profile?.gamification_enabled
    ? await xpByRuleSince(supabase, user.id, addLocalDays(today, -6, input.timezone))
    : null;
  const on = !!profile?.gamification_enabled;
  const terms = termsFor(on && !!profile?.quest_terminology);
  const [unlocked, achievementFacts, questRows] = on
    ? await Promise.all([
        listUnlocked(supabase, user.id),
        loadAchievementFacts(supabase, user.id, now),
        listQuests(supabase, user.id, { visibleOn: today }),
      ])
    : [null, null, []];
  const series = (type: StatType) => snapshots.filter((r) => r.stat_type === type && r.scope === "overall");

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">진행</h1>
        <WorkStandardsDialog settings={input.settings} />
      </header>

      {on && profile && week ? (
        <PlayerSection profile={profile} week={week} quests={toQuestViews(questRows, {})} />
      ) : (
        <EnableCard />
      )}

      <section aria-labelledby="stats-heading" className="space-y-3">
        <h2 id="stats-heading" className="text-lg font-semibold">
          행동 지표
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            type="calibration"
            stat={stats.calibration}
            detail={
              biasText(stats.calibration.bias, stats.calibration.typicalError) +
              (stats.calibration.blockerCount > 0 ? ` · 외부 방해 ${stats.calibration.blockerCount}건은 가중치 0.3` : "")
            }
            series={series("calibration")}
          />
          <StatCard
            type="reliability"
            stat={stats.reliability}
            detail={`약속 블록 ${stats.reliability.sampleCount}개`}
            series={series("reliability")}
          />
          <StatCard
            type="consistency"
            stat={stats.consistency}
            detail={`근무일 ${stats.consistency.successDays}/${stats.consistency.workDays}일`}
            series={series("consistency")}
          />
          <StatCard
            type="recovery"
            stat={stats.recovery}
            detail={`회복 사건 ${stats.recovery.sampleCount}건`}
            series={series("recovery")}
          />
        </div>
        <CalibrationByType byType={stats.calibration.byType} />
      </section>

      <PatternList patterns={stats.patterns} calibrationBias={stats.calibration.bias} terms={terms} />
      <DomainBars domains={stats.domains} practice={on} terms={terms} />
      {on && unlocked && achievementFacts && (
        <>
          <AchievementsSection facts={achievementFacts} unlocked={unlocked.achievements} timezone={input.timezone} />
          <TitleList titles={unlocked.titles} equipped={profile?.equipped_title ?? null} />
        </>
      )}
    </div>
  );
}
