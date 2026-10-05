/**
 * Per-key spacing for Notion requests (about 3/s per token, spec §5.4). In-process only: parallel serverless
 * instances can still exceed it, so the SDK's 429 retries remain the backstop.
 */
export function createThrottle(
  intervalMs: number,
  clock: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): (key: string) => Promise<void> {
  const nextAt = new Map<string, number>();
  return async (key) => {
    const now = clock();
    const at = Math.max(now, nextAt.get(key) ?? 0);
    nextAt.set(key, at + intervalMs);
    if (at > now) await sleep(at - now);
  };
}
