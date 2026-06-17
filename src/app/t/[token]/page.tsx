"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useVoiceAgent } from "@/contexts/VoiceAgentContext";

/**
 * Table QR landing. A guest scans the tent card → lands here with the table's
 * token. We resolve it to the table/zone, bind the voice session to that table
 * (dine-in mode), and hand off to the voice ordering screen. No login, no
 * table-number guessing — the agent already knows where they're sitting.
 */
export default function TableLandingPage() {
  const params = useParams();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const router = useRouter();
  const { setTableContext } = useVoiceAgent();
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(true);
  const ran = useRef(false);

  const runResolve = useCallback(async () => {
    if (!token) return;
    setResolving(true);
    setError("");
    try {
      const t = await api.resolveTable(token);
      setTableContext({
        token,
        label: t.label,
        zoneName: t.zone_name,
        isAc: t.is_ac,
      });
      router.replace("/chat");
    } catch {
      setError(
        "We couldn't find that table. Please scan the QR on your table again, or order for delivery instead.",
      );
      setResolving(false);
    }
  }, [token, setTableContext, router]);

  // Resolve once on mount; the "Try again" button re-invokes runResolve directly.
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    runResolve();
  }, [runResolve]);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center text-center px-6 ember-glow">
      <div className="flex items-center gap-2.5 mb-8">
        <span
          className="material-symbols-outlined text-primary text-[28px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          local_fire_department
        </span>
        <span className="font-headline font-semibold text-on-surface text-xl tracking-tight">
          Saffron <span className="text-primary">&amp;</span> Smoke
        </span>
      </div>

      {error ? (
        <div className="max-w-sm flex flex-col items-center">
          <span className="material-symbols-outlined text-error text-4xl mb-3">
            error
          </span>
          <p className="text-on-surface-variant text-sm leading-relaxed mb-6">{error}</p>
          <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
            <button
              onClick={runResolve}
              disabled={resolving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-tertiary text-on-primary px-5 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              {resolving ? "Trying…" : "Try again"}
            </button>
            <button
              onClick={() => { setTableContext(null); router.replace("/chat"); }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 text-on-surface px-5 py-2.5 text-sm font-semibold hover:bg-white/5 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">local_shipping</span>
              Order for delivery instead
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="w-12 h-12 border-2 border-white/10 border-t-primary rounded-full animate-spin mb-5" />
          <p className="text-on-surface font-headline text-lg">Seating you…</p>
          <p className="text-on-surface-variant text-sm mt-1">
            Getting your table ready to order
          </p>
        </>
      )}
    </main>
  );
}
