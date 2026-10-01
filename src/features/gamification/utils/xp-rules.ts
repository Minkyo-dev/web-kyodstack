/** XP rules v1 (E1 spec §2, umbrella §10). Pure; the same code runs after actions, nightly and in the backfill. */
import type { DayFacts, ExistingXp, NewXpEvent, XpRule } from "../domain/xp.types";

export const XP_RULES_VERSION = "xp-v1";
const FOCUS_MIN_MINUTES = 10;
const FOCUS_SESSION_CAP = 30;
const COMPLETION_XP = 20;
const COMMITMENT_XP = 10;
const COMMITMENT_MIN_SCORE = 0.75;
const DAY_CAP: Record<XpRule, number | null> = { focus: 120, completion: 5 * COMPLETION_XP, commitment: null, quest: null };

export function focusXp(minutes: number): number {
  if (minutes < FOCUS_MIN_MINUTES) return 0;
  const raw =
    0.5 * Math.min(minutes, 30) + 0.2 * Math.min(Math.max(minutes - 30, 0), 60) + 0.05 * Math.max(minutes - 90, 0);
  return Math.min(FOCUS_SESSION_CAP, Math.floor(raw));
}

type Candidate = Omit<NewXpEvent, "localDate"> & { at: string };

/** New events for one local day. Skips sources already in the ledger; daily caps count what is already there. */
export function evaluateDay(facts: DayFacts, existing: ExistingXp[]): NewXpEvent[] {
  const have = new Set(existing.map((e) => `${e.rule}:${e.sourceId}`));
  const used: Record<XpRule, number> = { focus: 0, completion: 0, commitment: 0, quest: 0 };
  for (const e of existing) used[e.rule] += e.xp;

  const candidates: Candidate[] = [
    ...facts.sessions
      .filter((s) => s.source === "timer")
      .map((s): Candidate => ({
        rule: "focus",
        sourceType: "work_session",
        sourceId: s.id,
        at: s.endedAt,
        xp: focusXp(s.focusedMinutes),
        metadata: { focusedMinutes: Math.round(s.focusedMinutes) },
      })),
    ...facts.completions
      .filter((c) => c.focusedMinutes >= FOCUS_MIN_MINUTES)
      .map((c): Candidate => ({ rule: "completion", sourceType: "task", sourceId: c.taskId, at: c.completedAt, xp: COMPLETION_XP, metadata: {} })),
    ...facts.commitments
      .filter((c) => c.score >= COMMITMENT_MIN_SCORE)
      .map((c): Candidate => ({
        rule: "commitment",
        sourceType: "schedule_block",
        sourceId: c.blockId,
        at: c.resolvedAt,
        xp: COMMITMENT_XP,
        metadata: { score: c.score },
      })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.sourceId.localeCompare(b.sourceId));

  const out: NewXpEvent[] = [];
  for (const c of candidates) {
    if (c.xp <= 0 || have.has(`${c.rule}:${c.sourceId}`)) continue;
    const cap = DAY_CAP[c.rule];
    const xp = cap === null ? c.xp : Math.min(c.xp, cap - used[c.rule]);
    if (xp <= 0) continue;
    used[c.rule] += xp;
    out.push({ rule: c.rule, sourceType: c.sourceType, sourceId: c.sourceId, localDate: facts.date, xp, metadata: c.metadata });
  }
  return out;
}
