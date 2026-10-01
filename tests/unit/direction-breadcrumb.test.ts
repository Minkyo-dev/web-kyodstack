import { describe, expect, it } from "vitest";
import { buildBreadcrumb, effectiveMissionId } from "@/features/direction/domain/breadcrumb";

const mission = { id: "m1", title: "Launch MVP", status: "active" };
const path = { id: "p1", title: "MVP-First", status: "active" };

describe("buildBreadcrumb", () => {
  it("follows protocol → path → mission", () => {
    const b = buildBreadcrumb({ mission, protocol: { id: "pr1", title: "Calendar Foundation", path } });
    expect(b).toEqual({
      kind: "growth",
      crumbs: [
        { kind: "mission", id: "m1", label: "Launch MVP", note: null },
        { kind: "path", id: "p1", label: "MVP-First", note: null },
        { kind: "protocol", id: "pr1", label: "Calendar Foundation", note: null },
      ],
    });
  });

  it("uses a direct mission without protocol, adding the project when present", () => {
    const b = buildBreadcrumb({ mission, project: { id: "j1", name: "Scheduler", mission: null } });
    expect(b.kind === "growth" && b.crumbs.map((c) => c.kind)).toEqual(["mission", "project"]);
  });

  it("derives the mission from the project", () => {
    const b = buildBreadcrumb({ mission: null, project: { id: "j1", name: "Scheduler", mission } });
    expect(b.kind === "growth" && b.crumbs.map((c) => c.label)).toEqual(["Launch MVP", "Scheduler"]);
  });

  it("notes closed missions and retired paths", () => {
    const b = buildBreadcrumb({
      mission: { ...mission, status: "dropped" },
      protocol: { id: "pr1", title: "Shadowing", path: { ...path, status: "retired" } },
    });
    expect(b.kind === "growth" && b.crumbs.map((c) => c.note)).toEqual(["DROPPED", "RETIRED", null]);
  });

  it("is maintenance without any mission", () => {
    expect(buildBreadcrumb({})).toEqual({ kind: "maintenance" });
    expect(buildBreadcrumb({ project: { id: "j1", name: "Chores", mission: null } })).toEqual({ kind: "maintenance" });
  });
});

describe("effectiveMissionId", () => {
  it("prefers the task's own mission", () => {
    expect(effectiveMissionId({ mission, project: { id: "j", name: "x", mission: { ...mission, id: "m2" } } })).toBe("m1");
    expect(effectiveMissionId({ project: { id: "j", name: "x", mission } })).toBe("m1");
    expect(effectiveMissionId({})).toBeNull();
  });
});
