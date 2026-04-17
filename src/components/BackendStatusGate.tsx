"use client";

/**
 * Backend "waking up" gate for Render's free plan (free containers snooze
 * after ~15 min of inactivity; first hit takes ~50 s to cold-start).
 *
 * When enabled via `NEXT_PUBLIC_SHOW_WAKE_UP_GATE=1`, this polls `GET /health`
 * and shows a full-screen wake-up UI with a countdown if the backend isn't
 * responding yet. Delete this component + env var + mount point once the
 * backend is on an always-on plan.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ENABLED = process.env.NEXT_PUBLIC_SHOW_WAKE_UP_GATE === "1";

const GRACE_MS = 2000; // don't flash the gate for warm backends
const PING_INTERVAL_MS = 3000;
const COUNTDOWN_SECONDS = 55; // Render cold-start ≈ 30–50 s on free tier
const PING_TIMEOUT_MS = 8000;

export function BackendStatusGate({ children }: { children: React.ReactNode }) {
  // If the flag is off, the gate is a no-op wrapper — children render freely.
  if (!ENABLED) return <>{children}</>;
  return <GateInner>{children}</GateInner>;
}

function GateInner({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [attempts, setAttempts] = useState(0);
  const cancelledRef = useRef(false);

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

  // Polling loop
  useEffect(() => {
    cancelledRef.current = false;

    const run = async () => {
      // First shot right away.
      setAttempts((n) => n + 1);
      if (await ping()) {
        if (!cancelledRef.current) setReady(true);
        return;
      }
      // Show the gate after the grace period if still not ready.
      const graceTimer = window.setTimeout(() => {
        if (!cancelledRef.current && !ready) setShowGate(true);
      }, GRACE_MS);

      // Keep retrying.
      const interval = window.setInterval(async () => {
        if (cancelledRef.current) return;
        setAttempts((n) => n + 1);
        if (await ping()) {
          if (!cancelledRef.current) {
            setReady(true);
            setShowGate(false);
          }
          window.clearInterval(interval);
          window.clearTimeout(graceTimer);
        }
      }, PING_INTERVAL_MS);

      // Cleanup handles
      cleanupRef.current = () => {
        window.clearTimeout(graceTimer);
        window.clearInterval(interval);
      };
    };

    const cleanupRef = { current: () => {} };
    run();
    return () => {
      cancelledRef.current = true;
      cleanupRef.current();
    };
  }, [ping, ready]);

  // Countdown ticks only while the gate is visible and we're not ready.
  useEffect(() => {
    if (!showGate || ready) return;
    const tick = window.setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [showGate, ready]);

  // Manual retry: reset the countdown and force an immediate ping.
  const retryNow = useCallback(async () => {
    setCountdown(COUNTDOWN_SECONDS);
    setAttempts((n) => n + 1);
    if (await ping()) {
      setReady(true);
      setShowGate(false);
    }
  }, [ping]);

  return (
    <>
      {children}
      {showGate && !ready && (
        <WakeUpOverlay
          countdown={countdown}
          attempts={attempts}
          onRetry={retryNow}
        />
      )}
    </>
  );
}

function WakeUpOverlay({
  countdown,
  attempts,
  onRetry,
}: {
  countdown: number;
  attempts: number;
  onRetry: () => void;
}) {
  const overdue = countdown === 0;
  const progress = 1 - countdown / COUNTDOWN_SECONDS;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex items-center justify-center p-6">
      {/* ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[300px] rounded-full bg-secondary/10 blur-[100px]" />
      </div>

      <div className="relative max-w-md w-full text-center">
        {/* Brand mark */}
        <div className="inline-flex items-center gap-2 mb-8">
          <span className="material-symbols-outlined text-primary text-2xl">
            restaurant
          </span>
          <span className="font-headline font-extrabold text-white text-xl">
            Saffron & Smoke
          </span>
        </div>

        {/* Circular countdown */}
        <div className="relative w-40 h-40 mx-auto mb-6">
          <svg
            className="w-full h-full -rotate-90"
            viewBox="0 0 100 100"
            fill="none"
          >
            <circle
              cx="50"
              cy="50"
              r="45"
              strokeWidth="6"
              className="stroke-white/10"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              strokeWidth="6"
              strokeLinecap="round"
              className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
              style={{
                strokeDasharray: 2 * Math.PI * 45,
                strokeDashoffset: 2 * Math.PI * 45 * (1 - progress),
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {overdue ? (
              <span
                className="material-symbols-outlined text-primary text-4xl animate-pulse"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                hourglass
              </span>
            ) : (
              <>
                <span className="font-headline font-extrabold text-white text-4xl tabular-nums">
                  {countdown}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mt-1">
                  seconds
                </span>
              </>
            )}
          </div>
        </div>

        <h1 className="font-headline font-extrabold text-white text-2xl mb-2">
          {overdue ? "Still waking up…" : "Waking up the kitchen"}
        </h1>
        <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
          The backend is hosted on{" "}
          <span className="text-white">Render's free plan</span> and takes
          a minute or so to spin up after a nap. We'll drop you in as soon
          as it answers — no action needed.
        </p>

        {/* Live status strip */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant font-headline">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400" />
          </span>
          Retrying · attempt {attempts}
        </div>

        <div className="mt-8">
          <button
            onClick={onRetry}
            className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-white transition-colors"
          >
            Retry now
          </button>
        </div>

        <p className="mt-10 text-[10px] text-on-surface-variant/60 italic">
          This screen disappears when the project moves off the free tier.
        </p>
      </div>
    </div>
  );
}
