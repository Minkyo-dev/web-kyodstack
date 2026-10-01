import { describe, expect, it } from "vitest";
import { setProjectArchivedSchema } from "@/features/projects/schemas/project.schema";
import { splitArchived } from "@/features/projects/utils/progress";

describe("project archive", () => {
  it("validates the archive toggle", () => {
    const projectId = "00000000-0000-4000-a000-000000000001";
    expect(setProjectArchivedSchema.safeParse({ projectId, archived: true }).success).toBe(true);
    expect(setProjectArchivedSchema.safeParse({ projectId, archived: "yes" }).success).toBe(false);
    expect(setProjectArchivedSchema.safeParse({ projectId: "x", archived: false }).success).toBe(false);
  });

  it("splits projects into the main list and the archive, newest archived first", () => {
    const p = (id: string, archived_at: string | null) => ({ id, archived_at });
    const { current, archived } = splitArchived([p("a", null), p("b", "2026-09-01T00:00:00Z"), p("c", "2026-09-20T00:00:00Z"), p("d", null)]);
    expect(current.map((x) => x.id)).toEqual(["a", "d"]);
    expect(archived.map((x) => x.id)).toEqual(["c", "b"]);
  });
});
