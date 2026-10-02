/** 성취 로그 (ADR 0037 §7): derived on every load from work records and, while gamification is on, the ledger. */
import { routineStreaks } from "@/features/direction/domain/habits";
import { toLocalDate } from "@/features/scheduler/utils/timezone";
import { QUEST_META, type QuestType } from "../domain/quest.types";
import { ACHIEVEMENTS } from "./achievements";
import { levelFor } from "./level";

export type WorkRecords = {
  milestones: { id: string; name: string; completed_at: string; projectName: string | null }[];
  projects: { id: string; name: string; completed_at: string }[];
  goals: { id: string; title: string; closed_at: string }[];
  routines: { id: string; title: string; weekdays: number[]; checks: { local_date: string; created_at: string }[] }[];
};
export type TrackingRecords = {
  xp: { xp: number; local_date: string; created_at: string }[];
  quests: { id: string; type: string; title: string; cleared_at: string }[];
  achievements: { key: string; unlocked_at: string }[];
};

export type LogKind = "goal" | "project" | "milestone" | "routine" | "quest" | "achievement" | "level";
export type LogEntry = { key: string; kind: LogKind; tag: string; text: string; date: string; at: string };

/** Newest first. `tracking` is null while gamification is off: work entries only. */
export function buildAchievementLog(work: WorkRecords, tracking: TrackingRecords | null, timezone: string): LogEntry[] {
  const day = (ts: string) => toLocalDate(ts, timezone);
  const out: LogEntry[] = [
    ...work.goals.map((g): LogEntry => ({ key: `goal:${g.id}`, kind: "goal", tag: "CHANGE ACHIEVED", text: g.title, date: day(g.closed_at), at: g.closed_at })),
    ...work.projects.map((p): LogEntry => ({ key: `project:${p.id}`, kind: "project", tag: "PROJECT CLEAR", text: p.name, date: day(p.completed_at), at: p.completed_at })),
    ...work.milestones.map((m): LogEntry => ({
      key: `milestone:${m.id}`,
      kind: "milestone",
      tag: "MILESTONE",
      text: m.projectName ? `${m.projectName} · ${m.name}` : m.name,
      date: day(m.completed_at),
      at: m.completed_at,
    })),
    ...work.routines.flatMap((r) =>
      routineStreaks(r.weekdays, r.checks).marks.map((s): LogEntry => ({
        key: `routine:${r.id}:${s.localDate}`,
        kind: "routine",
        tag: `STREAK x${s.count}`,
        text: `${r.title} ${s.count}번 연속`,
        date: s.localDate,
        at: s.at,
      })),
    ),
  ];
  if (tracking) {
    for (const q of tracking.quests) {
      const meta = QUEST_META[q.type as QuestType];
      out.push({ key: `quest:${q.id}`, kind: "quest", tag: `${meta?.label ?? "QUEST"} CLEAR`, text: q.title, date: day(q.cleared_at), at: q.cleared_at });
    }
    for (const a of tracking.achievements) {
      const name = ACHIEVEMENTS.find((x) => x.key === a.key)?.name ?? a.key;
      out.push({ key: `achievement:${a.key}`, kind: "achievement", tag: "ACHIEVEMENT", text: name, date: day(a.unlocked_at), at: a.unlocked_at });
    }
    out.push(...levelUps(tracking.xp));
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
}

/** One entry per day the running total crossed into a higher level (several levels in a day → the highest). */
export function levelUps(xp: TrackingRecords["xp"]): LogEntry[] {
  const sorted = [...xp].sort((a, b) => a.local_date.localeCompare(b.local_date) || a.created_at.localeCompare(b.created_at));
  const byDay = new Map<string, LogEntry>();
  let total = 0;
  let level = 1;
  for (const e of sorted) {
    total += e.xp;
    const next = levelFor(total).level;
    if (next > level) {
      level = next;
      byDay.set(e.local_date, { key: `level:${next}`, kind: "level", tag: "LEVEL UP", text: `Lv.${next}`, date: e.local_date, at: e.created_at });
    }
  }
  return [...byDay.values()];
}
