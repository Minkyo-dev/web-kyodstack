/** Achievement catalog v1 (E2 spec §3). Recognition only: no XP; never re-locked. Names are original. */
export const ACHIEVEMENTS_VERSION = "ach-v2";

export type AchievementFacts = {
  sessionFocus: number[]; // focused minutes of each ended timer session
  calibrationErrors: number[]; // |actual/estimate − 1| of completed tasks with an estimate
  perfectCommitments: number; // final commitments with score 1
  weeklyCleared: number;
  recoveryCleared: number;
  /** ach-v2 (ADR 0037 §10): work structure. */
  milestonesCompleted: number;
  projectsCompleted: number;
  goalsAchieved: number;
  bestRoutineStreak: number;
};
export type Achievement = {
  key: string;
  name: string;
  description: string;
  titleKey: string | null;
  progress: (f: AchievementFacts, unlocked: Set<string>) => { current: number; target: number };
};

export const TITLES: Record<string, string> = {
  builder: "BUILDER",
  deep_worker: "DEEP WORKER",
  reliable_planner: "RELIABLE PLANNER",
  early_starter: "EARLY STARTER",
  consistent_operator: "CONSISTENT OPERATOR",
  system_thinker: "SYSTEM THINKER",
  pathfinder: "PATHFINDER",
  finisher: "FINISHER",
  achiever: "ACHIEVER",
  iron_routine: "IRON ROUTINE",
};

const count = (xs: number[], ok: (x: number) => boolean) => xs.filter(ok).length;

export const ACHIEVEMENTS: Achievement[] = [
  { key: "first_step", name: "FIRST STEP", description: "처음으로 10분 이상 집중한 타이머 세션", titleKey: "builder",
    progress: (f) => ({ current: Math.min(1, count(f.sessionFocus, (m) => m >= 10)), target: 1 }) },
  { key: "deep_session", name: "DEEP SESSION", description: "60분 이상 집중한 세션 10번", titleKey: "deep_worker",
    progress: (f) => ({ current: count(f.sessionFocus, (m) => m >= 60), target: 10 }) },
  { key: "reliable_planner", name: "RELIABLE PLANNER", description: "예상 시간 ±10% 안에 끝낸 완료 10번", titleKey: "reliable_planner",
    progress: (f) => ({ current: count(f.calibrationErrors, (e) => e <= 0.1), target: 10 }) },
  { key: "early_starter", name: "EARLY STARTER", description: "약속 블록을 제시간에 시작한 10번", titleKey: "early_starter",
    progress: (f) => ({ current: f.perfectCommitments, target: 10 }) },
  { key: "consistent_builder", name: "CONSISTENT BUILDER", description: "주간 퀘스트 4번 달성", titleKey: "consistent_operator",
    progress: (f) => ({ current: f.weeklyCleared, target: 4 }) },
  { key: "comeback", name: "COMEBACK", description: "회복 퀘스트로 다시 시작", titleKey: null,
    progress: (f) => ({ current: Math.min(1, f.recoveryCleared), target: 1 }) },
  { key: "first_checkpoint", name: "FIRST CHECKPOINT", description: "처음으로 마일스톤 완료", titleKey: null,
    progress: (f) => ({ current: Math.min(1, f.milestonesCompleted), target: 1 }) },
  { key: "milestone_runner", name: "MILESTONE RUNNER", description: "마일스톤 10개 완료", titleKey: "pathfinder",
    progress: (f) => ({ current: f.milestonesCompleted, target: 10 }) },
  { key: "project_clear", name: "PROJECT CLEAR", description: "처음으로 프로젝트 완료", titleKey: "finisher",
    progress: (f) => ({ current: Math.min(1, f.projectsCompleted), target: 1 }) },
  { key: "goal_achieved", name: "CHANGE ACHIEVED", description: "처음으로 변화 달성", titleKey: "achiever",
    progress: (f) => ({ current: Math.min(1, f.goalsAchieved), target: 1 }) },
  { key: "routine_7", name: "ROUTINE x7", description: "습관 하나를 7번 연속 지키기", titleKey: null,
    progress: (f) => ({ current: Math.min(7, f.bestRoutineStreak), target: 7 }) },
  { key: "iron_routine", name: "IRON ROUTINE", description: "습관 하나를 30번 연속 지키기", titleKey: "iron_routine",
    progress: (f) => ({ current: Math.min(30, f.bestRoutineStreak), target: 30 }) },
  { key: "system_thinker", name: "SYSTEM THINKER", description: "다른 업적 5개 달성", titleKey: "system_thinker",
    progress: (_f, unlocked) => ({ current: [...unlocked].filter((k) => k !== "system_thinker").length, target: 5 }) },
];

export function newlyUnlocked(facts: AchievementFacts, unlocked: Set<string>): string[] {
  const all = new Set(unlocked);
  const out: string[] = [];
  // Two passes so system_thinker sees achievements unlocked in this evaluation.
  for (let pass = 0; pass < 2; pass++) {
    for (const a of ACHIEVEMENTS) {
      if (all.has(a.key)) continue;
      const p = a.progress(facts, all);
      if (p.current >= p.target) {
        all.add(a.key);
        out.push(a.key);
      }
    }
  }
  return out;
}
