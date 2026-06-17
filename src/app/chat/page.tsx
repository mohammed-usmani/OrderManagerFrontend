"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  useVoiceAgent,
  type AgentStatus,
  type TableContext,
} from "@/contexts/VoiceAgentContext";
import { AppShell } from "@/components/AppShell";
import { Canvas } from "@/components/Canvas";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/** Single source of the dine-in table chip — guards the binding once. */
function TableBadge({ ctx }: { ctx: TableContext }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
        table_restaurant
      </span>
      Table {ctx.label}
      {ctx.zoneName ? ` · ${ctx.zoneName}` : ""}
      {ctx.isAc ? " · AC" : ""}
    </span>
  );
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  disconnected: "Tap to talk to Arjun",
  connecting: "Connecting…",
  connected: "Ready — say anything",
  listening: "Listening…",
  speaking: "Arjun is speaking",
};

const SUGGESTIONS = [
  { icon: "restaurant_menu", text: "What's good tonight?" },
  { icon: "local_fire_department", text: "Something spicy" },
  { icon: "spa", text: "Vegetarian mains" },
  { icon: "confirmation_number", text: "My code is 4-2-8-1" },
];

const DINE_IN_SUGGESTIONS = [
  { icon: "restaurant_menu", text: "What's good tonight?" },
  { icon: "local_fire_department", text: "Something spicy" },
  { icon: "spa", text: "Vegetarian mains" },
  { icon: "receipt_long", text: "Bring the bill, please" },
];

export default function ChatPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  // Public ordering line — no login required. Only bounce logged-in staff to
  // their back-office so they don't land on the customer mic by mistake.
  useEffect(() => {
    if (isAuthenticated && user?.is_admin) {
      router.replace("/admin");
    }
  }, [isAuthenticated, user, router]);

  const { status, canvas, isVoiceActive, toggleVoice, warningSecondsLeft, queued, echoSuppressed, tableContext, setTableContext, transcript } =
    useVoiceAgent();
  const [showTranscript, setShowTranscript] = useState(false);

  const isConnecting = status === "connecting";
  const isIdle = canvas.kind === "idle";
  const live = isVoiceActive || status === "speaking";
  const statusText = queued
    ? "In queue — tap to cancel"
    : STATUS_LABEL[status];
  // Short, single-focus states read better vertically centered; lists/menus
  // stay top-aligned so they can scroll naturally.
  const centered =
    isIdle ||
    canvas.kind === "order_confirmed" ||
    canvas.kind === "customer_card" ||
    canvas.kind === "delivery_check" ||
    canvas.kind === "bill_requested" ||
    canvas.kind === "session_end";

  const micIcon = queued
    ? "hourglass_top"
    : isVoiceActive
      ? "mic"
      : isConnecting
        ? "progress_activity"
        : "mic_none";

  return (
    <AppShell>
      {/* Desktop status bar — the sidebar already carries the brand, so this
          stays a slim context strip, not a second wordmark. */}
      <div className="hidden md:flex items-center justify-between px-8 py-4 border-b border-white/5">
        <p className="text-on-surface-variant text-sm">
          {tableContext ? (
            <span className="inline-flex items-center gap-2 flex-wrap">
              <TableBadge ctx={tableContext} /> — tell Arjun what you’d like.
              <button
                onClick={() => setTableContext(null)}
                className="text-xs underline text-on-surface-variant/70 hover:text-on-surface"
              >
                Not at this table?
              </button>
            </span>
          ) : (
            "Parcel delivery across Bandra — tell Arjun what you’re craving."
          )}
        </p>
        <div className="flex items-center gap-3">
          {transcript.length > 0 && (
            <button
              onClick={() => setShowTranscript((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">subtitles</span>
              {showTranscript ? "Hide" : "Transcript"}
            </button>
          )}
        <div className={`flex items-center gap-2 ${live ? "text-primary" : "text-on-surface-variant"}`}>
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ fontVariationSettings: live ? "'FILL' 1" : undefined }}
          >
            graphic_eq
          </span>
          <span className="text-xs uppercase tracking-[0.18em]">{statusText}</span>
        </div>
        </div>
      </div>

      {/* Transcript drawer — accessible record of the conversation (matters for
          allergy / order accuracy). Toggled from the status bar. */}
      {showTranscript && transcript.length > 0 && (
        <div className="hidden md:block border-b border-white/5 bg-black/20 max-h-56 overflow-y-auto px-8 py-3">
          <ul className="space-y-1.5 max-w-[1400px] mx-auto">
            {transcript.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wider pt-0.5 ${t.role === "assistant" ? "text-primary" : "text-on-surface-variant"}`}>
                  {t.role === "assistant" ? "Arjun" : "You"}
                </span>
                <span className="text-on-surface">{t.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Content area — Canvas or an inviting idle state */}
      {/* Big bottom padding clears the floating mic + bottom nav so the last
          item is always reachable. Centering only on md+ (taller screens) —
          on mobile we top-align so tall content stays fully scrollable. */}
      <main className="flex-1 overflow-y-auto pt-16 md:pt-0 pb-[20rem] md:pb-48">
        <div
          className={`px-4 md:px-8 py-2 md:py-6 max-w-[1400px] mx-auto w-full ${
            centered ? "md:min-h-full md:flex md:flex-col md:justify-center" : ""
          }`}
        >
          {isIdle ? <IdleHero /> : (
            <ErrorBoundary resetKey={canvas.kind}>
              <Canvas canvas={canvas} />
            </ErrorBoundary>
          )}
        </div>
      </main>

      {/* Mic zone — the one control. On mobile it floats above the BottomNav. */}
      <div className="fixed bottom-24 md:bottom-0 left-0 md:left-64 right-0 z-[70] pointer-events-none">
        <div className="relative pointer-events-auto">
          <div className="absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-[#14100c] to-transparent pointer-events-none" />

          <div className="flex flex-col items-center gap-2 py-4 md:py-6 bg-[#14100c]/85 backdrop-blur-xl border-t border-white/5">
            {echoSuppressed && isVoiceActive && (
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-tertiary/30 bg-tertiary/10 px-3 py-1 text-[11px] font-medium text-tertiary reveal-sm">
                <span className="material-symbols-outlined text-[15px]">noise_control_off</span>
                Noisy line — let Arjun finish, then talk
              </div>
            )}
            {warningSecondsLeft !== null && (
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary reveal-sm">
                <span
                  className="material-symbols-outlined text-[15px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  timer
                </span>
                {warningSecondsLeft <= 0 ? (
                  "Wrapping up…"
                ) : (
                  <>
                    Call ends in{" "}
                    <span className="font-mono tabular-nums">
                      {Math.floor(warningSecondsLeft / 60)}:
                      {String(warningSecondsLeft % 60).padStart(2, "0")}
                    </span>
                  </>
                )}
              </div>
            )}
            <button
              onClick={toggleVoice}
              aria-label={statusText}
              className={`
                relative flex items-center justify-center
                w-[88px] h-[88px] rounded-full
                transition-all active:scale-95 focus:outline-none focus:ring-4 focus:ring-primary/30
                ${
                  isVoiceActive
                    ? "bg-primary text-on-primary animate-breathe"
                    : status === "speaking"
                      ? "bg-secondary text-on-secondary animate-breathe"
                      : isConnecting
                        ? "bg-tertiary/20 text-tertiary"
                        : "bg-gradient-to-br from-primary to-tertiary text-on-primary shadow-[0_14px_40px_-10px_rgba(255,106,26,0.6)] hover:brightness-110"
                }
              `}
            >
              {live && (
                <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
              )}
              <span
                className={`material-symbols-outlined text-[38px] relative z-10 ${isConnecting && !queued ? "animate-spin" : ""}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {micIcon}
              </span>
            </button>
            <span className="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant md:hidden">
              {statusText}
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function IdleHero() {
  const { tableContext } = useVoiceAgent();
  const dineIn = tableContext !== null;
  const suggestions = dineIn ? DINE_IN_SUGGESTIONS : SUGGESTIONS;

  return (
    <section className="flex flex-col items-center text-center py-12 md:py-20 max-w-xl mx-auto reveal">
      <div className="relative mb-7">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl -z-10" />
        <div className="w-24 h-24 rounded-full ember-card flex items-center justify-center ring-1 ring-primary/25">
          <span
            className="material-symbols-outlined text-primary text-5xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {dineIn ? "table_restaurant" : "local_fire_department"}
          </span>
        </div>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-tertiary mb-3">
        {tableContext
          ? `Table ${tableContext.label}${tableContext.zoneName ? ` · ${tableContext.zoneName}` : ""}${tableContext.isAc ? " · AC" : ""}`
          : "Saffron & Smoke · Bandra West"}
      </p>
      <h2 className="font-headline font-semibold text-on-surface text-3xl md:text-4xl mb-3 leading-[1.1]">
        {dineIn ? (
          <>
            Ready to order? Just{" "}
            <span className="italic text-primary">talk.</span>
          </>
        ) : (
          <>
            Order dinner by just{" "}
            <span className="italic text-primary">talking.</span>
          </>
        )}
      </h2>
      <p className="text-on-surface-variant text-sm max-w-sm leading-relaxed mb-9">
        {dineIn
          ? "Tap the mic and tell Arjun what you’d like — he already knows your table. Order as much as you like; pay at the end."
          : "Tap the mic and tell Arjun what you’re craving. New here? He’ll set you up with a 4-digit code so next time he remembers you instantly."}
      </p>

      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-on-surface-variant mb-3">
        Try saying
      </p>
      {/* Non-interactive examples — there's no text channel; the mic is the one
          control, so these are prompts to say out loud, not buttons. */}
      <ul className="grid grid-cols-2 gap-2.5 w-full max-w-md">
        {suggestions.map((s) => (
          <li
            key={s.text}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left"
          >
            <span
              className="material-symbols-outlined text-primary text-[19px] shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {s.icon}
            </span>
            <span className="text-on-surface text-xs font-medium leading-tight">
              &ldquo;{s.text}&rdquo;
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
