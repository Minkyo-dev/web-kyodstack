import { describe, expect, it } from "vitest";
import { chatContextText, ChatOutputSchema, CreateTaskPayload, normalizeChatProposals, type ChatSnapshot } from "@/features/assistant/domain/chat";
import { chatPrompt } from "@/features/ai/prompts/chat.prompt";

const C = "2d9e0c5a-7b3f-4e4c-9a8d-3f4b5c6d7e8f";
const p = (over: Partial<Parameters<typeof normalizeChatProposals>[0][number]> = {}) => ({
  kind: "create_task" as const,
  title: "보고서 초안",
  targetDate: "2026-10-03",
  estimateMinutes: 120,
  changeId: null,
  why: "요청",
  ...over,
});

describe("normalizeChatProposals", () => {
  const opts = { today: "2026-10-02", changeIds: new Set([C]) };
  it("keeps valid fields and known changes", () => {
    const [x] = normalizeChatProposals([p({ changeId: C })], opts);
    expect(x).toEqual({ payload: { title: "보고서 초안", targetDate: "2026-10-03", estimateMinutes: 120, missionId: C }, why: "요청" });
    expect(CreateTaskPayload.safeParse(x.payload).success).toBe(true);
  });
  it("drops unknown change ids, past or malformed dates and out-of-range minutes", () => {
    const [x] = normalizeChatProposals([p({ changeId: "made-up", targetDate: "2026-10-01", estimateMinutes: 900 })], opts);
    expect(x.payload).toMatchObject({ missionId: null, targetDate: null, estimateMinutes: null });
    expect(normalizeChatProposals([p({ targetDate: "내일" })], opts)[0].payload.targetDate).toBeNull();
    expect(normalizeChatProposals([p({ estimateMinutes: 24.6 })], opts)[0].payload.estimateMinutes).toBe(25);
  });
  it("removes duplicate titles and caps at 3", () => {
    const out = normalizeChatProposals([p(), p({ title: " 보고서 초안 " }), p({ title: "a" }), p({ title: "b" }), p({ title: "c" })], opts);
    expect(out.map((x) => x.payload.title)).toEqual(["보고서 초안", "a", "b"]);
  });
});

describe("chat output schema", () => {
  it("bounds the reply and the proposals", () => {
    expect(ChatOutputSchema.safeParse({ reply: "네", proposals: [] }).success).toBe(true);
    expect(ChatOutputSchema.safeParse({ reply: "", proposals: [] }).success).toBe(false);
    expect(ChatOutputSchema.safeParse({ reply: "네", proposals: [p(), p(), p(), p()] }).success).toBe(false);
  });
});

describe("chatContextText", () => {
  const snap = (n: number): ChatSnapshot => ({
    now: { date: "2026-10-02", time: "09:00", weekday: "금", phase: "아침 브리핑" },
    tasks: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: "가".repeat(200), priority: 3, due: null, scheduledAt: null, change: null })),
    habits: [],
    yesterday: null,
    changes: [],
    projects: [],
    week: { plannedMinutes: 0, actualMinutes: 0, completed: 0, focus: null },
  });
  it("clips titles, caps lists and stays within the size bound", () => {
    const text = chatContextText(snap(60));
    expect(text.length).toBeLessThanOrEqual(6000);
    const parsed = JSON.parse(text) as ChatSnapshot;
    expect(parsed.tasks.length).toBeLessThanOrEqual(30);
    expect(parsed.tasks[0].title.length).toBe(80);
  });
  it("the prompt carries snapshot, history and the new message", () => {
    const prompt = chatPrompt({ snapshot: "{}", history: [{ role: "user", content: "안녕" }, { role: "assistant", content: "네" }], message: "오늘 뭐 해?" });
    expect(prompt).toContain("owner: 안녕");
    expect(prompt).toContain("assistant: 네");
    expect(prompt.endsWith("OWNER NOW: 오늘 뭐 해?")).toBe(true);
  });
});
