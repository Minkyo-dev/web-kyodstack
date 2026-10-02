/**
 * Chat assistant `chat-v1` (ADR 0042). Pure: the snapshot text the model reads, its output schema, and the
 * normaliser that turns model proposals into safe `create_task` payloads.
 */
import { z } from "zod";

export const CHAT_VERSION = "chat-v1";
export const CHAT_HISTORY = 10;
export const CHAT_MAX_PROPOSALS = 3;
const CONTEXT_MAX = 6000;

export type ChatSnapshot = {
  now: { date: string; time: string; weekday: string; phase: string };
  tasks: { id: string; title: string; priority: number; due: string | null; scheduledAt: string | null; change: string | null }[];
  habits: { title: string; done: boolean }[];
  yesterday: { win: string | null; blocker: string | null } | null;
  changes: { id: string; title: string; criteria: string; nextStep: string | null; deadline: string | null; signals: string[] }[];
  projects: { name: string; progress: number | null; targetDate: string | null }[];
  week: { plannedMinutes: number; actualMinutes: number; completed: number; focus: string | null };
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Compact, bounded JSON of the snapshot (the only data the model may use). */
export function chatContextText(s: ChatSnapshot): string {
  const trimmed: ChatSnapshot = {
    ...s,
    tasks: s.tasks.slice(0, 30).map((t) => ({ ...t, title: clip(t.title, 80) })),
    habits: s.habits.slice(0, 15).map((h) => ({ ...h, title: clip(h.title, 60) })),
    changes: s.changes.slice(0, 5).map((c) => ({ ...c, title: clip(c.title, 80) })),
    projects: s.projects.slice(0, 10).map((p) => ({ ...p, name: clip(p.name, 60) })),
  };
  let text = JSON.stringify(trimmed);
  // Still too long: drop tasks from the end until it fits (they are ordered most relevant first).
  while (text.length > CONTEXT_MAX && trimmed.tasks.length > 0) {
    trimmed.tasks.pop();
    text = JSON.stringify(trimmed);
  }
  return text;
}

export const CreateTaskPayload = z.object({
  title: z.string().trim().min(1).max(200),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  estimateMinutes: z.number().int().min(5).max(600).nullable(),
  missionId: z.uuid().nullable(),
});
export type CreateTaskProposal = z.infer<typeof CreateTaskPayload>;

export const ChatOutputSchema = z.object({
  reply: z.string().trim().min(1).max(1200),
  proposals: z
    .array(
      z.object({
        kind: z.literal("create_task"),
        title: z.string().trim().min(1).max(200),
        targetDate: z.string().nullable(),
        estimateMinutes: z.number().nullable(),
        changeId: z.string().nullable(),
        why: z.string().trim().min(1).max(120),
      }),
    )
    .max(CHAT_MAX_PROPOSALS),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

/** Model proposals → safe payloads: unknown change ids dropped, past/invalid dates cleared, duplicates removed. */
export function normalizeChatProposals(
  proposals: ChatOutput["proposals"],
  opts: { today: string; changeIds: Set<string> },
): { payload: CreateTaskProposal; why: string }[] {
  const seen = new Set<string>();
  const out: { payload: CreateTaskProposal; why: string }[] = [];
  for (const p of proposals) {
    const key = p.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const date = p.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(p.targetDate) && p.targetDate >= opts.today ? p.targetDate : null;
    const minutes = p.estimateMinutes === null ? null : Math.round(p.estimateMinutes);
    out.push({
      payload: {
        title: p.title.trim(),
        targetDate: date,
        estimateMinutes: minutes !== null && minutes >= 5 && minutes <= 600 ? minutes : null,
        missionId: p.changeId && opts.changeIds.has(p.changeId) ? p.changeId : null,
      },
      why: p.why,
    });
  }
  return out.slice(0, CHAT_MAX_PROPOSALS);
}
