"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { coalesce } from "@/lib/coalesce";

/**
 * Keep a board fresh: runs `load` now (and whenever `load` changes), polls every
 * `intervalMs` while the tab is visible, and refetches once when it becomes
 * visible again. Returns a coalesced trigger (one in flight + one queued) —
 * pass it to useOrderStream so an SSE burst can't stack up requests.
 * `enabled=false` pauses the automatic loads (e.g. mid-edit).
 */
export function useLiveRefresh(
  load: () => Promise<unknown>,
  intervalMs: number,
  enabled = true,
): () => void {
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const [run] = useState(() => coalesce());
  const refresh = useCallback(() => run(() => loadRef.current()), [run]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const t = setInterval(() => { if (!document.hidden) refresh(); }, intervalMs);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, enabled, intervalMs, refresh]);

  return refresh;
}
