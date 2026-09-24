/** Returns a runner that keeps at most one async refresh in flight and at most
 *  one queued behind it (the most recently passed fn) — a burst of triggers
 *  collapses into a single rerun. */
export function coalesce(): (fn: () => Promise<unknown>) => void {
  let inFlight = false;
  let next: (() => Promise<unknown>) | null = null;
  const run = (fn: () => Promise<unknown>): void => {
    if (inFlight) {
      next = fn;
      return;
    }
    inFlight = true;
    fn()
      .catch(() => {})
      .finally(() => {
        inFlight = false;
        const queued = next;
        next = null;
        if (queued) run(queued);
      });
  };
  return run;
}
