import type { Cefr } from "./word-mapping";

/** One rubric for the practice prompt and the level picker (spec §9.3): a Korean label and the English rule. */
export const CEFR_RUBRIC: Record<Cefr, { label: string; rule: string }> = {
  A1: { label: "아주 짧은 일상 문장 · 현재형", rule: "At most 8 English words; present simple, can, have; everyday objects and routines." },
  A2: { label: "일상·쇼핑·여행 · 과거형, 비교", rule: "At most 12 English words; past simple, going to, comparatives; daily life, shopping and travel." },
  B1: { label: "일상·업무 · 접속사로 이어진 문장", rule: "At most 18 English words; present perfect, simple conditionals, because/although; work and opinions." },
  B2: { label: "추상·업무 주제 · 수동태, 관계절", rule: "At most 25 English words; passive voice, relative clauses, modals of deduction; abstract and work topics." },
  C1: { label: "뉘앙스·격식 · 혼합 조건문, 도치", rule: "At most 30 English words; mixed conditionals, inversion, hedging; nuance and register matter." },
  C2: { label: "관용·함축 · 격식 전환", rule: "No length limit; idiomatic and implicit meaning, shifts between formal and informal register." },
};
