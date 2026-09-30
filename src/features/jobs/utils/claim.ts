/**
 * Ledger decision for one (job, user, run_key) (spec §47). Pure so it can be tested.
 * - no row           → insert a new "running" row
 * - succeeded/skipped→ done, never rerun
 * - running (fresh)  → another invocation is on it
 * - failed / stale running → retry, up to MAX_ATTEMPTS
 */
export const STALE_RUNNING_MS = 30 * 60_000;
export const MAX_ATTEMPTS = 3;

export type LedgerRow = { status: string; attempts: number; started_at: string };
export type ClaimDecision = "insert" | "retry" | "skip";

export function decideClaim(row: LedgerRow | null, now: Date): ClaimDecision {
  if (!row) return "insert";
  if (row.status === "succeeded" || row.status === "skipped") return "skip";
  if (row.attempts >= MAX_ATTEMPTS) return "skip";
  if (row.status === "failed") return "retry";
  const stale = now.getTime() - new Date(row.started_at).getTime() > STALE_RUNNING_MS;
  return row.status === "running" && stale ? "retry" : "skip";
}
