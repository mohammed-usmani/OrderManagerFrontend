/** Delay before voice-queue retry `attempt` (0-based): exponential from
 *  `baseMs`, capped at `capMs`, with ±20% jitter so queued callers don't all
 *  retry in lockstep. */
export function queueRetryDelay(
  attempt: number,
  rand: () => number = Math.random,
  baseMs = 3000,
  capMs = 20000,
): number {
  const d = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.round(d * (0.8 + 0.4 * rand()));
}

/** Close code 4003 means both "all lines busy" (worth waiting for) and
 *  per-client refusals (retrying won't help). Only the former is retried. */
export function isLinesBusy(reason: string): boolean {
  return !reason || /busy/i.test(reason);
}
