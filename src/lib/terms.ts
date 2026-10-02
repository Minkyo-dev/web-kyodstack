/**
 * Planner labels (ADR 0037, 0038): one work vocabulary for the structure; Solo Leveling words are kept for tracking only.
 * A label layer only — code and DB use the domain names. The Atomic Habits idea under each label is in the comments.
 */
export const TERMS = {
  task: "할 일",
  project: "프로젝트",
  milestone: "마일스톤",
  /** purpose — belief: why you work */
  directive: "비전",
  /** the directive page tab (ADR 0038) */
  directiveNav: "습관",
  /** identity — identity-based habits: "나는 ~하는 사람" */
  identity: "역할",
  className: "주 역할",
  /** mission — outcome; "a change you keep doing", never a deliverable (that is a project) — ADR 0038 */
  mission: "변화",
  /** mission criteria — how you know the change happened */
  criteria: "달성 기준",
  /** path — system: the repeated process that produces the result */
  path: "프로세스",
  /** protocol — implementation intention (when · where · what) */
  protocol: "실행 규칙",
  growth: "성장",
  maintenance: "유지",
  /** habit — a small repeated action */
  habit: "습관",
  habits: "습관",
  /** the rule-generated daily quest (tracking layer) */
  systemQuest: "일일 퀘스트",
  systemQuests: "일일 퀘스트",
} as const;
export type Terms = typeof TERMS;

type Pair = "을/를" | "이/가" | "은/는" | "과/와" | "으로/로";

/** Final consonant index of the last Hangul syllable (0 = none); non-Hangul counts as none. */
function finalConsonant(word: string): number {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return 0;
  return (c - 0xac00) % 28;
}

export function josa(word: string, pair: Pair): string {
  const [withFinal, withoutFinal] = pair.split("/");
  const jong = finalConsonant(word);
  if (pair === "으로/로") return word + (jong !== 0 && jong !== 8 ? withFinal : withoutFinal); // ㄹ(8) takes 로
  return word + (jong !== 0 ? withFinal : withoutFinal);
}
