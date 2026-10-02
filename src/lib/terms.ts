/**
 * Quest terminology (E2 spec §4, G umbrella §2): a label layer only. Code and DB use domain names.
 * Labels follow Atomic Habits (ADR 0036): belief/identity → outcome → system → implementation intention → habit.
 */
export type Terms = {
  task: string;
  project: string;
  directive: string;
  directiveNav: string;
  identity: string;
  className: string;
  mission: string;
  path: string;
  protocol: string;
  growth: string;
  maintenance: string;
  habit: string;
  habits: string;
  systemQuest: string;
  systemQuests: string;
};
export const PLAIN_TERMS: Terms = {
  task: "할 일",
  project: "프로젝트",
  directive: "신념",
  directiveNav: "정체성",
  identity: "정체성",
  className: "핵심 정체성",
  mission: "결과 목표",
  path: "시스템",
  protocol: "실행 의도",
  growth: "성장",
  maintenance: "유지",
  habit: "습관",
  habits: "습관",
  systemQuest: "오늘의 1%",
  systemQuests: "오늘의 1%",
};
export const QUEST_TERMS: Terms = {
  task: "퀘스트",
  project: "메인 퀘스트",
  directive: "CORE BELIEF",
  directiveNav: "IDENTITY",
  identity: "IDENTITY",
  className: "CORE IDENTITY",
  mission: "OUTCOME",
  path: "SYSTEM",
  protocol: "INTENTION",
  growth: "GROWTH",
  maintenance: "MAINTENANCE",
  habit: "DAILY QUEST",
  habits: "DAILY QUESTS",
  systemQuest: "1% QUEST",
  systemQuests: "1% QUESTS",
};

export function termsFor(questTerminology: boolean): Terms {
  return questTerminology ? QUEST_TERMS : PLAIN_TERMS;
}

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
