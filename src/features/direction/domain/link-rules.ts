/** Task ↔ project mission agreement (ADR 0020). Unset on either side never conflicts. */
export function missionConflict(taskMissionId: string | null, projectMissionId: string | null): boolean {
  return taskMissionId !== null && projectMissionId !== null && taskMissionId !== projectMissionId;
}

/** Tasks of a project whose explicit mission would disagree with the project's new mission. */
export function countProjectConflicts(newMissionId: string | null, taskMissionIds: (string | null)[]): number {
  if (newMissionId === null) return 0;
  return taskMissionIds.filter((m) => m !== null && m !== newMissionId).length;
}

/** A link is new when it points somewhere other than the current one; only new links must be active. */
export function isNewLink(next: string | null | undefined, current: string | null | undefined): boolean {
  return !!next && next !== (current ?? null);
}
