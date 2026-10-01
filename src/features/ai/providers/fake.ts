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
