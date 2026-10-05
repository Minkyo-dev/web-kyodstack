import { commitments } from "@/features/analytics/utils/stats";
import { focusStats } from "@/features/scheduler/utils/focus";
import { toLocalDate } from "@/features/scheduler/utils/timezone";
import type { DayFacts, XpRaw } from "../domain/xp.types";

/** Per-day facts for the XP rules. Kept commitments only: early skips/cancels are not "kept" (plan ruling). */
export function buildDayFacts(raw: XpRaw, dates: string[]): DayFacts[] {
  const tz = raw.timezone;
  const byDate = new Map<string, DayFacts>(dates.map((d) => [d, { date: d, sessions: [], completions: [], commitments: [], habitChecks: [], vocabReviews: null }]));

  for (const s of raw.sessions) {
    if (!s.ended_at) continue;
    const f = byDate.get(toLocalDate(s.ended_at, tz));
    if (!f) continue;
    f.sessions.push({
      id: s.id,
      source: s.source === "manual" ? "manual" : "timer",
      endedAt: s.ended_at,
      focusedMinutes: focusStats(s, s.pauses).focusedMs / 60_000,
    });
  }
  for (const t of raw.completedTasks) {
    const f = byDate.get(toLocalDate(t.completed_at, tz));
    if (f) f.completions.push({ taskId: t.id, completedAt: t.completed_at, focusedMinutes: raw.taskFocus[t.id] ?? 0 });
  }
  const status = new Map(raw.blocks.map((b) => [b.id, b.status]));
  const resolved = commitments({
    now: raw.now,
    settings: raw.settings,
    blocks: raw.blocks,
    revisions: raw.revisions,
    sessions: raw.sessions.map((s) => ({ ...s, focus_score: null })),
  });
  for (const c of resolved) {
    if (c.kind !== "final") continue;
    const st = status.get(c.blockId);
    if (st === "skipped" || st === "cancelled") continue;
    const f = byDate.get(toLocalDate(c.resolvedAt, tz));
    if (f) f.commitments.push({ blockId: c.blockId, resolvedAt: c.resolvedAt, score: c.score });
  }
  for (const c of raw.habitChecks) byDate.get(c.local_date)?.habitChecks.push({ id: c.id, createdAt: c.created_at });
  for (const r of [...raw.vocabReviews].sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at))) {
    const f = byDate.get(toLocalDate(r.reviewed_at, tz));
    if (!f) continue;
    if (f.vocabReviews) f.vocabReviews.count += 1;
    else f.vocabReviews = { firstId: r.id, at: r.reviewed_at, count: 1 };
  }
  return dates.map((d) => byDate.get(d)!);
}
