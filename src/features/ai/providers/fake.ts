import "server-only";
import { AppError } from "@/lib/errors";
import type { AiProvider, StructuredRequest, StructuredResult } from "../services/provider";

/**
 * Deterministic provider for tests and offline development (AI_PROVIDER=fake).
 * It returns a canned response per task and still validates it against the real schema.
 */
export class FakeProvider implements AiProvider {
  readonly name = "fake";

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const canned = FAKE_OUTPUTS[req.task]?.(req.prompt);
    const checked = req.schema.safeParse(canned);
    if (!checked.success) throw new AppError("AI_OUTPUT_INVALID");
    return { data: checked.data, provider: this.name, model: "fake-1" };
  }
}

const FAKE_OUTPUTS: Record<string, (prompt: string) => unknown> = {
  vocab_practice_generate: (prompt) => {
    const input = JSON.parse(prompt.slice(prompt.indexOf("{"))) as { words: { ref: string; meaning: string }[] };
    return { items: input.words.map((w, i) => ({ target_refs: [w.ref], prompt_ko: `연습 문장 ${i + 1}: ${w.meaning || "단어"}을(를) 써 보세요.`, hint_ko: i === 0 ? "현재형" : "" })) };
  },
  vocab_practice_feedback: (prompt) => {
    const input = JSON.parse(prompt.slice(prompt.indexOf("{"))) as { answer: string; targets: { term: string }[] };
    const hasError = /\bgoes\b/.test(input.answer);
    const corrected = input.answer.replace(/\bgoes\b/, "go");
    return {
      verdict: hasError ? "minor_issues" : "correct",
      target_usage: { used: input.answer.includes(input.targets[0]?.term ?? ""), correct: true, note_ko: "목표 표현을 확인했어요." },
      corrections: hasError ? [{ original: "goes", corrected: "go", category: "grammar", explanation_ko: "주어가 I일 때는 go를 써요." }] : [],
      corrected_sentence: corrected,
      natural_sentence: "These days, smartphones are everywhere.",
      alternatives: [{ sentence: "Smartphones are all over the place now.", register: "casual", nuance_ko: "더 구어적인 표현이에요." }],
    };
  },
  vocab_enrich: (prompt) => {
    const terms = JSON.parse(prompt.slice(prompt.indexOf("["))) as string[];
    return {
      items: terms.map((term) => ({ term, meaning_ko: `${term}의 뜻`, pos: "명사", ipa: "/fake/", example_en: `This is ${term}.`, synonyms: [], cefr: "B1" })),
    };
  },
  brief_line: () => ({ line: "오늘의 한 가지부터 25분만 시작해 봐요." }),
  assistant_chat: (prompt) => {
    const wantsTask = /잡아|추가|만들어/.test(prompt.slice(prompt.lastIndexOf("OWNER NOW:")));
    return {
      reply: wantsTask ? "할 일 제안을 만들었어요. 아래 카드에서 적용할 수 있어요." : "오늘은 가장 위의 할 일부터 25분만 시작해 봐요.",
      proposals: wantsTask ? [{ kind: "create_task", title: "보고서 초안 쓰기", targetDate: null, estimateMinutes: 120, changeId: null, why: "요청하신 작업이에요" }] : [],
    };
  },
  quest_picker: (prompt) => {
    const input = JSON.parse(prompt.slice(prompt.indexOf("{"))) as { candidates: { key: string }[] };
    return { picks: input.candidates.slice(0, 3).map((c) => c.key), title: "집중의 날", reason: "오늘 계획에 맞춘 목표예요" };
  },
  weekly_analysis: (prompt) => {
    const input = JSON.parse(prompt.slice(prompt.indexOf("{"))) as { stats: { calibration: { now: number | null; weekAgo: number | null } } };
    const c = input.stats.calibration;
    return {
      explanations: [
        c.now !== null && c.weekAgo !== null
          ? { stat: "calibration", headline: `예상 정확도 ${c.weekAgo} → ${c.now}`, detail: "지난주와 비교한 변화입니다.", evidence: [] }
          : { stat: "calibration", headline: "예상 정확도 데이터를 모으는 중이에요", detail: "완료한 작업이 더 쌓이면 변화를 설명할게요.", evidence: [] },
      ],
      assessment: { planningTendency: "조금 낙관적", workStyle: "긴 집중 세션", currentRisk: null, strongPattern: "오전 실행이 안정적" },
    };
  },
  interpret_worklog: () => ({ delayReason: "environment_issue", scopeChanged: false, unexpectedBlocker: true, blockerType: "technical", confidence: 0.91 }),
  classify_tasks: (prompt) => {
    const input = JSON.parse(prompt.slice(prompt.indexOf("{"))) as { tasks: { id: string }[]; domains: { id: string }[] };
    return {
      items: input.tasks.map((t) => ({ taskId: t.id, taskType: "debugging", domainId: input.domains[0]?.id ?? null, complexity: 4, skills: ["airflow", "dbt"], confidence: 0.88 })),
    };
  },
  weekly_review: () => ({
    summary: "테스트용 주간 리뷰입니다.",
    positives: ["계획한 작업을 꾸준히 기록했습니다."],
    issues: ["예상보다 오래 걸린 작업이 있었습니다."],
    recommendations: [{ title: "예상 시간 보정", reason: "실제 시간이 더 길었습니다.", action: "비슷한 작업의 예상을 늘리세요." }],
  }),
  task_recommendations: (prompt) => {
    // Echo back the first milestone in the input so the ids are always valid.
    const input = JSON.parse(prompt.slice(prompt.indexOf("{"))) as {
      projects: { id: string; milestones: { id: string; name: string }[] }[];
    };
    const p = input.projects[0];
    const m = p?.milestones[0];
    return {
      recommendations: p
        ? [
            {
              title: `${m?.name ?? "프로젝트"} 다음 단계 정리`,
              description: null,
              estimatedMinutes: 45,
              priority: 2,
              rationale: "테스트용 추천입니다.",
              projectId: p.id,
              milestoneId: m?.id ?? null,
            },
          ]
        : [],
    };
  },
};
