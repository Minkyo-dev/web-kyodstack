import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { josa, termsFor } from "@/lib/terms";
import { getPlayerProfile } from "@/features/gamification/queries/xp.queries";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { todayLocalDate } from "@/features/scheduler/utils/timezone";
import { DueBadge } from "@/features/projects/components/due-badge";
import { DirectiveHeader } from "@/features/direction/components/directive-header";
import { MissionCreateForm, MissionSettingsForm } from "@/features/direction/components/mission-forms";
import { CriteriaList } from "@/features/direction/components/criteria-list";
import { PathPanel } from "@/features/direction/components/path-panel";
import { ProtocolList } from "@/features/direction/components/protocol-list";
import { MISSION_STATUS_LABEL, type MissionSummary } from "@/features/direction/domain/direction.types";
import { getMissionDetail, listMissionOptions, loadDirective } from "@/features/direction/queries/direction.queries";
import { listHabits } from "@/features/direction/queries/habit.queries";
import { HabitSection } from "@/features/direction/components/habit-section";

export const metadata: Metadata = { title: "방향", robots: { index: false } };

/** Purpose and identities on top; missions on the left; the selected mission (?mission=) on the right. */
export default async function DirectivePage({ searchParams }: { searchParams: Promise<{ mission?: string }> }) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const [profile, context, view, habits, missionOptions] = await Promise.all([
    getPlayerProfile(supabase, user.id),
    getSchedulerContext(supabase, user.id),
    loadDirective(supabase, user.id),
    listHabits(supabase, user.id),
    listMissionOptions(supabase, user.id),
  ]);
  const terms = termsFor(!!profile?.gamification_enabled && !!profile.quest_terminology);
  const today = todayLocalDate(context.timezone);
  const { mission: missionParam } = await searchParams;
  const selectedId = missionParam && z.uuid().safeParse(missionParam).success ? missionParam : null;
  const detail = selectedId ? await getMissionDetail(supabase, user.id, selectedId) : null;
  const identityName = Object.fromEntries(view.identities.map((i) => [i.id, i.name]));
  const active = view.missions.filter((m) => m.status === "active");
  const closedMissions = view.missions.filter((m) => m.status !== "active");
  const closed = detail ? detail.mission.status !== "active" : false;

  const card = (m: MissionSummary) => (
    <li key={m.id}>
      <Link
        href={`/scheduler/directive?mission=${m.id}#mission-detail`}
        aria-current={m.id === detail?.mission.id ? "page" : undefined}
        className={cn("block space-y-1 px-4 py-3 hover:bg-muted/50", m.id === detail?.mission.id && "bg-muted")}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">{m.title}</span>
          <span className="flex items-center gap-2">
            <DueBadge today={today} target={m.deadline} closed={m.status !== "active"} />
            <span className="rounded-sm border border-border px-1.5 text-xs text-muted-foreground">{MISSION_STATUS_LABEL[m.status]}</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {m.criteriaTotal > 0 && `기준 ${m.criteriaMet}/${m.criteriaTotal}`}
          {m.identityIds.length > 0 && ` · ${m.identityIds.map((id) => identityName[id]).filter(Boolean).join(", ")}`}
        </p>
      </Link>
    </li>
  );

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh">
      <div className="space-y-3 border-b border-border p-4">
        <h1 className="text-lg font-semibold">{terms.directiveNav}</h1>
        <DirectiveHeader purpose={view.purpose} identities={view.identities} />
        <HabitSection habits={habits} options={missionOptions} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside aria-label={`${terms.mission} 목록`} className="flex shrink-0 flex-col border-b border-border md:w-80 md:border-r md:border-b-0">
          <div className="border-b border-border p-4">
            <MissionCreateForm />
          </div>
          {view.missions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{`아직 ${josa(terms.mission, "이/가")} 없습니다.`}</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul className="divide-y divide-border">{active.map(card)}</ul>
              {closedMissions.length > 0 && (
                <details className="border-t border-border">
                  <summary className="cursor-pointer px-4 py-2 text-xs text-muted-foreground">달성·중단 ({closedMissions.length})</summary>
                  <ul className="divide-y divide-border">{closedMissions.map(card)}</ul>
                </details>
              )}
            </div>
          )}
        </aside>
        <section id="mission-detail" aria-label={`${terms.mission} 상세`} className="min-w-0 flex-1 space-y-5 overflow-y-auto p-6">
          {detail ? (
            <>
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.mission}</p>
                <h2 className="text-2xl font-semibold">{detail.mission.title}</h2>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded-sm border border-border px-1.5 text-xs">{MISSION_STATUS_LABEL[detail.mission.status]}</span>
                  <DueBadge today={today} target={detail.mission.deadline} closed={closed} />
                </p>
                {detail.mission.outcome && <p className="text-sm whitespace-pre-line">{detail.mission.outcome}</p>}
              </div>
              <CriteriaList missionId={detail.mission.id} criteria={detail.criteria} closed={closed} />
              <PathPanel missionId={detail.mission.id} activePath={detail.activePath} retiredPaths={detail.retiredPaths} closed={closed} timezone={context.timezone} />
              {detail.activePath && <ProtocolList pathId={detail.activePath.id} protocols={detail.protocols} closed={closed} habits={habits} />}
              {detail.projects.length > 0 && (
                <section aria-label={`연결된 ${terms.project}`} className="space-y-2 border-t border-border pt-4">
                  <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{`연결된 ${terms.project}`}</h3>
                  <ul className="space-y-1 text-sm">
                    {detail.projects.map((p) => (
                      <li key={p.id}>
                        <Link className="underline-offset-2 hover:underline" href={`/scheduler/projects?project=${p.id}#project-detail`}>
                          {p.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <MissionSettingsForm key={detail.mission.id} detail={detail} identities={view.identities} />
            </>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {selectedId ? `${josa(terms.mission, "을/를")} 찾을 수 없습니다. ` : ""}
              {`왼쪽에서 ${josa(terms.mission, "을/를")} 선택하거나 새로 만드세요.`}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
