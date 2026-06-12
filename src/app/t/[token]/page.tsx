"use client";

import { useEffect, useRef, useState } from "react";
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
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;
    (async () => {
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
          "We couldn't find that table. Please scan the QR on your table again, or ask a staff member for help.",
        );
      }
    })();
  }, [token, setTableContext, router]);

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
        <div className="max-w-sm">
          <span className="material-symbols-outlined text-error text-4xl mb-3">
            error
          </span>
          <p className="text-on-surface-variant text-sm leading-relaxed">{error}</p>
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
