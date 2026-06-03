"use client";

/**
 * Backend "waking up" gate for scale-to-zero hosting (Cloud Run with
 * min-instances=0). When no one's been calling, the container sleeps; the first
 * request cold-starts it (a few seconds for this AI image). This polls
 * `GET /health` from page load — which also *warms* the container while the
 * visitor reads the page — and shows a calm overlay only if it isn't up yet.
 *
 * Enable with `NEXT_PUBLIC_SHOW_WAKE_UP_GATE=1`. Leave off locally (the Docker
 * backend is always up).
 */

import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ENABLED = process.env.NEXT_PUBLIC_SHOW_WAKE_UP_GATE === "1";

const GRACE_MS = 1800; // a warm backend answers well under this → no flash
const PING_INTERVAL_MS = 2500;
const PING_TIMEOUT_MS = 10000; // a cold start may take several seconds

export function BackendStatusGate({ children }: { children: React.ReactNode }) {
  // If the flag is off, the gate is a no-op wrapper — children render freely.
  if (!ENABLED) return <>{children}</>;
  return <GateInner>{children}</GateInner>;
}

function GateInner({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const readyRef = useRef(false);

  const ping = useCallback(async (): Promise<boolean> => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_URL}/health`, {
        cache: "no-store",
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }, []);

  const markReady = useCallback(() => {
    readyRef.current = true;
    setReady(true);
    setShowGate(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const attempt = async () => {
      if (cancelled || readyRef.current) return;
      setAttempts((n) => n + 1);
      const ok = await ping();
      if (!cancelled && ok) markReady();
    };

    // Grace timer + polling both start NOW (not after the first ping resolves),
    // so a cold start is covered the whole time and a warm backend never flashes
    // the gate.
    const grace = window.setTimeout(() => {
      if (!cancelled && !readyRef.current) setShowGate(true);
    }, GRACE_MS);

    attempt(); // fire immediately (also warms the container)
    const interval = window.setInterval(attempt, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(grace);
      window.clearInterval(interval);
    };
  }, [ping, markReady]);

  const retryNow = useCallback(async () => {
    setAttempts((n) => n + 1);
    if (await ping()) markReady();
  }, [ping, markReady]);

  return (
    <>
      {children}
      {showGate && !ready && (
        <WakeUpOverlay attempts={attempts} onRetry={retryNow} />
      )}
    </>
  );
}

function WakeUpOverlay({
  attempts,
  onRetry,
}: {
  attempts: number;
  onRetry: () => void;
}) {
  const slow = attempts > 6; // unusually long → reassure

  return (
    <div className="fixed inset-0 z-[100] bg-[#14100c]/95 backdrop-blur-xl flex items-center justify-center p-6">
      {/* ambient ember glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] max-w-[90vw] h-[400px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[300px] rounded-full bg-tertiary/8 blur-[100px]" />
      </div>

      <div className="relative max-w-md w-full text-center reveal">
        <div className="inline-flex items-center gap-2 mb-8">
          <span
            className="material-symbols-outlined text-primary text-2xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            local_fire_department
          </span>
          <span className="font-headline font-semibold text-on-surface text-xl tracking-tight">
            Saffron <span className="text-primary">&amp;</span> Smoke
          </span>
        </div>

        {/* Indeterminate warming spinner with an ember at its heart */}
        <div className="relative w-28 h-28 mx-auto mb-7">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="material-symbols-outlined text-primary text-4xl animate-pulse"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              local_fire_department
            </span>
          </div>
        </div>

        <h1 className="font-headline font-semibold text-on-surface text-2xl mb-2">
          {slow ? "Almost there…" : "Warming up the kitchen"}
        </h1>
        <p className="text-on-surface-variant text-sm leading-relaxed mb-6 max-w-sm mx-auto">
          The server naps when no one&apos;s around to keep this demo free to run.
          Your visit is waking it — just a few seconds. We&apos;ll drop you in
          automatically, no action needed.
        </p>

        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Connecting · attempt {attempts}
        </div>

        <div className="mt-8">
          <button
            onClick={onRetry}
            className="text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Retry now
          </button>
        </div>
      </div>
    </div>
  );
}
