import { describe, expect, it } from "vitest";
import { proposalRows, validateClassification } from "@/features/ai/utils/classify";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

describe("validateClassification", () => {
  const ctx = { taskIds: new Set([id(1), id(2)]), domainIds: new Set([id(9)]) };
  it("drops unknown tasks, types and foreign domains; normalizes skills", () => {
    const items = validateClassification(
      { items: [
        { taskId: id(1), taskType: "debugging", domainId: id(9), complexity: 4, skills: [" Airflow", "dbt", "airflow", "x".repeat(31), "a", "b", "c", "d"], confidence: 0.88 },
        { taskId: id(2), taskType: "dancing" as never, domainId: id(8), complexity: 9 as never, skills: [], confidence: 0.5 },
        { taskId: id(3), taskType: "coding", skills: [], confidence: 1 },
      ] },
      ctx,
    );
    expect(items).toEqual([
      { taskId: id(1), taskType: "debugging", domainId: id(9), complexity: 4, skills: ["airflow", "dbt", "a", "b", "c"], confidence: 0.88 },
      { taskId: id(2), taskType: null, domainId: null, complexity: null, skills: [], confidence: 0.5 },
    ]);
  });
});

describe("proposalRows", () => {
  const item = { taskId: id(1), taskType: "debugging" as const, domainId: id(9), complexity: 4, skills: ["airflow", "dbt"], confidence: 0.9 };
  it("proposes only empty fields, changed complexity and new skills", () => {
    expect(proposalRows(item, { task_type: null, practice_domain_id: null, complexity: 3, tagNames: ["dbt"], rejected: new Set() })).toEqual([
      { feature_type: "task_type", feature_value: "debugging" },
      { feature_type: "domain", feature_value: id(9) },
      { feature_type: "complexity", feature_value: 4 },
      { feature_type: "skills", feature_value: ["airflow"] },
    ]);
  });
  it("skips filled fields, rejected types, same complexity and known skills", () => {
    expect(proposalRows(item, { task_type: "coding", practice_domain_id: null, complexity: 4, tagNames: ["airflow", "dbt"], rejected: new Set(["domain"]) })).toEqual([]);
  });
});
