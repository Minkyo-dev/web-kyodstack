import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { PageHelp } from "@/components/layout/page-help";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { josa, TERMS } from "@/lib/terms";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { todayLocalDate } from "@/features/scheduler/utils/timezone";
import { DueBadge } from "@/features/projects/components/due-badge";
import { IdentityBoard } from "@/features/direction/components/identity-board";
import { ChangeWizard } from "@/features/direction/components/change-wizard";
import { ChangeStep } from "@/features/direction/components/change-step";
import { CriteriaList } from "@/features/direction/components/criteria-list";
import { PathPanel } from "@/features/direction/components/path-panel";
import { RuleList } from "@/features/direction/components/rule-list";
import { HabitCreateForm, HabitList } from "@/features/direction/components/habit-forms";
import { StepShell } from "@/features/direction/components/blueprint-ui";
import { MISSION_STATUS_LABEL, type MissionSummary } from "@/features/direction/domain/direction.types";
import { planDone, planSteps, PLAN_STEPS } from "@/features/direction/domain/plan";
import { getMissionDetail, loadDirective } from "@/features/direction/queries/direction.queries";
import { listHabits } from "@/features/direction/queries/habit.queries";

export const metadata: Metadata = { title: "습관", robots: { index: false } };

/**
 * 습관 (ADR 0038): who you want to be on top; the changes on the left with their setup progress; the selected change
 * (?mission=, else the first active one) as a five-step blueprint on the right; stand-alone habits under the list.
 */
export default async function HabitsPage({ searchParams }: { searchParams: Promise<{ mission?: string }> }) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const [context, view, habits] = await Promise.all([
    getSchedulerContext(supabase, user.id),
    loadDirective(supabase, user.id),
    listHabits(supabase, user.id),
  ]);
  const today = todayLocalDate(context.timezone);
  const { mission: missionParam } = await searchParams;
  const active = view.missions.filter((m) => m.status === "active");
  const closedMissions = view.missions.filter((m) => m.status !== "active");
  const requested = missionParam && z.uuid().safeParse(missionParam).success ? missionParam : null;
  const selectedId = requested ?? active[0]?.id ?? null;
  const detail = selectedId ? await getMissionDetail(supabase, user.id, selectedId) : null;
  const identityName = Object.fromEntries(view.identities.map((i) => [i.id, i.name]));
  const roles = view.identities.filter((i) => i.status === "active").map((i) => ({ id: i.id, name: i.name }));
  const habitsOf = (missionId: string) => habits.filter((h) => h.mission_id === missionId);
  const activeHabitCount = (missionId: string) => habitsOf(missionId).filter((h) => h.status === "active").length;
  const standalone = habits.filter((h) => !h.protocol_id);

  const card = (m: MissionSummary) => {
    const counts = { criteria: m.criteriaTotal, hasPath: m.hasPath, rules: m.ruleCount, habits: activeHabitCount(m.id) };
    const selected = m.id === detail?.mission.id;
    return (
      <li key={m.id}>
        <Link
          href={`/scheduler/directive?mission=${m.id}#mission-detail`}
          aria-current={selected ? "page" : undefined}
          className={cn("block space-y-1.5 rounded-md border px-3 py-2.5 hover:bg-muted/50", selected ? "border-foreground bg-muted" : "border-border")}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">{m.title}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <DueBadge today={today} target={m.deadline} closed={m.status !== "active"} />
              {m.status !== "active" && <span className="rounded-sm border border-border px-1.5 text-xs text-muted-foreground">{MISSION_STATUS_LABEL[m.status]}</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span aria-hidden className="flex gap-0.5">
              {PLAN_STEPS.map((s) => (
                <span key={s} className={cn("h-1 w-4 rounded-full", planSteps(counts)[s] === "done" ? "bg-foreground" : "bg-border")} />
              ))}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{`설계 ${planDone(counts)}/${PLAN_STEPS.length} 단계`}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {[
              m.criteriaTotal > 0 && `기준 ${m.criteriaMet}/${m.criteriaTotal}`,
              counts.habits > 0 && `${TERMS.habit} ${counts.habits}개`,
              m.identityIds.map((id) => identityName[id]).filter(Boolean).join(", "),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </Link>
      </li>
    );
  };

  const closed = detail ? detail.mission.status !== "active" : false;
  const steps = detail
    ? planSteps({ criteria: detail.criteria.length, hasPath: !!detail.activePath, rules: detail.protocols.length, habits: activeHabitCount(detail.mission.id) })
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-1">
          <h2 className="text-2xl font-semibold">{TERMS.directiveNav}</h2>
          <PageHelp page="directive" />
        </div>
        <p className="text-sm text-muted-foreground">
          {`${TERMS.identity} → ${TERMS.mission} → ${TERMS.criteria} → ${TERMS.path} → ${TERMS.protocol} → ${TERMS.habit}. 프로젝트는 끝나는 일, ${josa(TERMS.mission, "은/는")} 반복해서 내가 되는 일입니다.`}
        </p>
      </header>

      <IdentityBoard purpose={view.purpose} identities={view.identities} />

      <div className="grid gap-6 md:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section aria-label={`${TERMS.mission} 목록`} className="space-y-2">
            <h2 className="text-sm font-semibold">{`${TERMS.mission} (${active.length})`}</h2>
            <ChangeWizard roles={roles} />
            {view.missions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                {`아직 ${josa(TERMS.mission, "이/가")} 없습니다. 만들고 싶은 ${josa(TERMS.mission, "을/를")} 하나만 골라 시작하세요.`}
              </p>
            ) : (
              <>
                <ul className="space-y-2">{active.map(card)}</ul>
                {closedMissions.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">달성·중단 ({closedMissions.length})</summary>
                    <ul className="mt-2 space-y-2">{closedMissions.map(card)}</ul>
                  </details>
                )}
              </>
            )}
          </section>

          <section aria-label={`다른 ${TERMS.habit}`} className="space-y-2">
            <h2 className="text-sm font-semibold">{`다른 ${TERMS.habit}`}</h2>
            <p className="text-xs text-muted-foreground">{`어떤 ${TERMS.mission}에도 속하지 않는 생활 ${TERMS.habit}입니다 (${TERMS.maintenance}).`}</p>
            <HabitList habits={standalone} />
            <HabitCreateForm idPrefix="habit-other" />
          </section>
        </aside>

        <section id="mission-detail" aria-label={`${TERMS.mission} 상세`} className="min-w-0 scroll-mt-4">
          {detail && steps ? (
            <div className="space-y-5">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground">습관 설계도</p>
                <h2 className="text-2xl font-semibold">{detail.mission.title}</h2>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded-sm border border-border px-1.5 text-xs">{MISSION_STATUS_LABEL[detail.mission.status]}</span>
                  <DueBadge today={today} target={detail.mission.deadline} closed={closed} />
                  <span className="text-xs tabular-nums">{`설계 ${Object.values(steps).filter((s) => s === "done").length}/${PLAN_STEPS.length} 단계`}</span>
                </p>
              </div>
              <div>
                <ChangeStep key={detail.mission.id} detail={detail} identities={view.identities} n={1} />
                <CriteriaList missionId={detail.mission.id} criteria={detail.criteria} closed={closed} n={2} state={steps.criteria} />
                <PathPanel
                  key={`path-${detail.activePath?.id ?? "none"}`}
                  missionId={detail.mission.id}
                  activePath={detail.activePath}
                  retiredPaths={detail.retiredPaths}
                  closed={closed}
                  timezone={context.timezone}
                  n={3}
                  state={steps.path}
                />
                <RuleList pathId={detail.activePath?.id ?? null} protocols={detail.protocols} habits={habits} closed={closed} n={4} state={steps.rules} />
                <StepShell n={5} title={TERMS.habit} question={`매일 무엇을 체크하나요? ${josa(TERMS.protocol, "을/를")} 반복하는 작은 행동을 정합니다. 두 번 연속 놓치지 않는 것이 핵심입니다.`} state={steps.habits}>
                  <HabitList habits={habitsOf(detail.mission.id)} showRule />
                  {!closed && <HabitCreateForm key={detail.protocols.map((p) => p.id).join()} protocols={detail.protocols} idPrefix="habit-change" />}
                </StepShell>
              </div>
              <section aria-label={`이 ${josa(TERMS.mission, "을/를")} 위한 ${TERMS.project}`} className="space-y-2 rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold">{`이 ${josa(TERMS.mission, "을/를")} 위한 ${TERMS.project}`}</h3>
                <p className="text-xs text-muted-foreground">{`끝내야 하는 일은 ${josa(TERMS.project, "으로/로")} 만들고 이 ${TERMS.mission}에 연결하세요. 연결된 작업은 ${TERMS.growth} 시간으로 집계됩니다.`}</p>
                {detail.projects.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {detail.projects.map((p) => (
                      <li key={p.id}>
                        <Link className="underline-offset-2 hover:underline" href={`/scheduler/projects?project=${p.id}#project-detail`}>
                          {p.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    연결된 {TERMS.project} 없음 ·{" "}
                    <Link href="/scheduler/projects" className="underline underline-offset-2">
                      {`${TERMS.project} 탭에서 연결`}
                    </Link>
                  </p>
                )}
              </section>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {requested ? `${josa(TERMS.mission, "을/를")} 찾을 수 없습니다. ` : ""}
              {`'새 ${TERMS.mission}'로 첫 습관 설계를 시작하세요. ${TERMS.mission} → ${TERMS.criteria} → ${TERMS.path} → ${TERMS.protocol} → ${TERMS.habit} 순서로 안내합니다.`}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
