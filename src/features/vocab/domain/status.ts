import { toLocalDate } from "@/features/scheduler/utils/timezone";
import type { StudyStatus } from "./word-mapping";
import type { FsrsState } from "./srs";

export type CardSnapshot = { fsrsState: FsrsState; due: string; suspended: boolean; scheduledDays: number };

/** spec §7.5: every card suspended → 학습 완료; every card new → 새 단어; otherwise 학습 중. */
export function deriveStatus(cards: CardSnapshot[]): StudyStatus {
  if (cards.length > 0 && cards.every((c) => c.suspended)) return "학습 완료";
  if (cards.every((c) => c.fsrsState === "new")) return "새 단어";
  return "학습 중";
}

/** Local date of the earliest due among active, already-studied cards; null when there is none. */
export function nextReviewDate(cards: CardSnapshot[], timezone: string): string | null {
  const dues = cards.filter((c) => !c.suspended && c.fsrsState !== "new").map((c) => c.due).sort();
  return dues.length ? toLocalDate(dues[0], timezone) : null;
}

/** "숙련" hint: every active card already waits three weeks or more. Never switches anything by itself. */
export function isMature(cards: CardSnapshot[]): boolean {
  const active = cards.filter((c) => !c.suspended);
  return active.length > 0 && active.every((c) => c.scheduledDays >= 21);
}

/** What Notion's 상태 / 다음 복습 should say for this word (spec §6.4). */
export function writebackFor(cards: CardSnapshot[], timezone: string): { status: StudyStatus; nextReview: string | null } {
  return { status: deriveStatus(cards), nextReview: nextReviewDate(cards, timezone) };
}
