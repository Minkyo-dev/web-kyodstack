/** Daily AI call pools per local day (ADR 0018; ADR 0046 adds the 단어장 pool). */
export const AI_POOL_CAPS = { default: 30, vocab: 60 } as const;
export type AiPool = keyof typeof AI_POOL_CAPS;

const VOCAB_PREFIX = "vocab.";

export function poolOf(kind: string): AiPool {
  return kind.startsWith(VOCAB_PREFIX) ? "vocab" : "default";
}
