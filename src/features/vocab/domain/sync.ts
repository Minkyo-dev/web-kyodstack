/** Notion rounds last_edited_time to the minute, so incremental pulls re-read a 2-minute overlap (spec §6.2). */
export const PULL_OVERLAP_MS = 2 * 60_000;
/** Page entry pulls only when the last pull is older than this. */
export const PULL_STALE_MS = 5 * 60_000;

export function pullSince(lastPulledAt: string | null): string | null {
  return lastPulledAt ? new Date(new Date(lastPulledAt).getTime() - PULL_OVERLAP_MS).toISOString() : null;
}

export function isPullStale(lastPulledAt: string | null, now = new Date()): boolean {
  return !lastPulledAt || now.getTime() - new Date(lastPulledAt).getTime() > PULL_STALE_MS;
}

/**
 * Reconcile (spec §6.5): live mirror rows whose page is no longer live in Notion. Pages that came back from the
 * trash need nothing here: the full pull upserts them, which clears deleted_at.
 */
export function missingFromNotion(mirror: { id: string; notionPageId: string; deleted: boolean }[], liveIds: Set<string>): string[] {
  return mirror.filter((w) => !w.deleted && !liveIds.has(w.notionPageId)).map((w) => w.id);
}
