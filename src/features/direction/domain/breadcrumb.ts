import type { DirectionRef } from "./direction.types";

export type BreadcrumbInput = {
  mission?: DirectionRef | null;
  protocol?: { id: string; title: string; path: DirectionRef | null } | null;
  project?: { id: string; name: string; mission?: DirectionRef | null } | null;
};

export type Crumb = { kind: "mission" | "path" | "protocol" | "project"; id: string; label: string; note: string | null };
export type Breadcrumb = { kind: "growth"; crumbs: Crumb[] } | { kind: "maintenance" };

const NOTE: Record<string, string> = { achieved: "ACHIEVED", dropped: "DROPPED", retired: "RETIRED" };
const note = (status: string) => NOTE[status] ?? null;

/** Effective mission (ADR 0020): the task's own (or its protocol's) mission, else its project's. */
export function effectiveMissionId(t: BreadcrumbInput): string | null {
  return t.mission?.id ?? t.project?.mission?.id ?? null;
}

/** "Why am I doing this?" — Mission › Path › Protocol, or Mission › Project; no mission = maintenance. */
export function buildBreadcrumb(t: BreadcrumbInput): Breadcrumb {
  const mission = t.mission ?? t.project?.mission ?? null;
  if (!mission) return { kind: "maintenance" };
  const crumbs: Crumb[] = [{ kind: "mission", id: mission.id, label: mission.title, note: note(mission.status) }];
  if (t.protocol) {
    const path = t.protocol.path;
    if (path) crumbs.push({ kind: "path", id: path.id, label: path.title, note: note(path.status) });
    crumbs.push({ kind: "protocol", id: t.protocol.id, label: t.protocol.title, note: null });
  } else if (t.project) {
    crumbs.push({ kind: "project", id: t.project.id, label: t.project.name, note: null });
  }
  return { kind: "growth", crumbs };
}
