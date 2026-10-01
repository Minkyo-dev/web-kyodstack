/** Quest terminology (E2 spec §4): a label layer only. Code and DB always say task/project. */
export type Terms = { task: string; project: string };
export const PLAIN_TERMS: Terms = { task: "할 일", project: "프로젝트" };
export const QUEST_TERMS: Terms = { task: "퀘스트", project: "메인 퀘스트" };

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
