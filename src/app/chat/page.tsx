"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  useVoiceAgent,
  type AgentStatus,
} from "@/contexts/VoiceAgentContext";
import { AppShell } from "@/components/AppShell";
import { Canvas } from "@/components/Canvas";

const STATUS_LABEL: Record<AgentStatus, string> = {
  disconnected: "Tap the mic to start",
  connecting: "Connecting…",
  connected: "Ready — say anything",
  listening: "Listening…",
  speaking: "Arjun is speaking",
};

const SUGGESTIONS = [
  { icon: "restaurant_menu", text: "Show me the menu" },
  { icon: "local_fire_department", text: "What's spicy?" },
  { icon: "eco", text: "Vegetarian mains" },
  { icon: "receipt_long", text: "My past orders" },
];

export default function ChatPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/signin");
    } else if (user?.is_admin) {
      router.replace("/admin");
    }
  }, [isAuthenticated, user, router]);

  const {
    status,
    canvas,
    isVoiceActive,
    toggleVoice,
  } = useVoiceAgent();

  if (!isAuthenticated) return null;

  const isConnecting = status === "connecting";
  const isIdle = canvas.kind === "idle";

  const micIcon = isVoiceActive
    ? "mic"
    : isConnecting
      ? "progress_activity"
      : "mic_none";

  return (
    <AppShell>
      {/* Desktop top bar */}
      <div className="hidden md:flex items-center justify-between px-8 py-4 border-b border-white/5">
        <div>
          <h1 className="font-headline font-extrabold text-white text-xl">
            Saffron & Smoke
          </h1>
          <p className="text-on-surface-variant text-xs">
            Welcome{user ? `, ${user.email.split("@")[0]}` : ""}. Talk to Arjun about the menu or your orders.
          </p>
        </div>
      </div>

      {/* Content area — Canvas or an inviting idle state */}
      <main className="flex-1 overflow-y-auto pt-16 md:pt-0 pb-48 md:pb-40">
        <div className="px-4 md:px-8 py-2 md:py-6 max-w-[1400px] mx-auto w-full">
          {isIdle ? <IdleHero /> : <Canvas canvas={canvas} />}
        </div>
      </main>

      {/* Mic zone. On mobile sits ABOVE the BottomNav (which is ~96 px tall)
          so the mic + the nav are both fully visible.
          Tap the mic to end the call — it's the only control. */}
      <div className="fixed bottom-24 md:bottom-0 left-0 md:left-64 right-0 z-[70] pointer-events-none">
        <div className="relative pointer-events-auto">
          {/* Soft fade so the mic detaches from content behind it */}
          <div className="absolute inset-x-0 -top-16 h-16 bg-gradient-to-t from-background via-background/85 to-transparent pointer-events-none" />

          <div className="flex justify-center py-3 md:py-5 bg-background/85 backdrop-blur-xl border-t border-white/5">
            <button
              onClick={toggleVoice}
              disabled={isConnecting}
              aria-label={STATUS_LABEL[status]}
              className={`
                relative flex items-center justify-center
                w-[84px] h-[84px] rounded-full
                shadow-2xl transition-all active:scale-95 focus:outline-none
                ${
                  isVoiceActive
                    ? "bg-primary text-on-primary shadow-primary/50"
                    : status === "speaking"
                      ? "bg-secondary text-on-secondary shadow-secondary/40"
                      : isConnecting
                        ? "bg-yellow-500/20 text-yellow-300 shadow-yellow-500/20"
                        : "bg-gradient-to-br from-primary to-tertiary text-on-primary shadow-primary/30"
                }
                disabled:cursor-wait
              `}
            >
              {/* Pulsing halo while active */}
              {(isVoiceActive || status === "speaking") && (
                <>
                  <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
                  <span className="absolute -inset-3 rounded-full bg-primary/10 blur-xl" />
                </>
              )}
              <span
                className={`material-symbols-outlined text-[36px] relative z-10 ${
                  isConnecting ? "animate-spin" : ""
                }`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {micIcon}
              </span>
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function IdleHero() {
  const { toggleVoice, status } = useVoiceAgent();
  const isConnecting = status === "connecting";

  return (
    <section className="flex flex-col items-center text-center py-12 md:py-20 max-w-xl mx-auto">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-primary/15 blur-3xl -z-10" />
        <div className="w-20 h-20 rounded-full glass-panel flex items-center justify-center ring-1 ring-primary/20">
          <span
            className="material-symbols-outlined text-primary text-4xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
        </div>
      </div>

      <h2 className="font-headline font-extrabold text-white text-2xl mb-2">
        Talk to Arjun
      </h2>
      <p className="text-on-surface-variant text-sm max-w-sm leading-relaxed mb-8">
        Ask about the menu, place an order, or check your history. Everything
        you say will show up as cards right here.
      </p>

      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant mb-3">
        Try saying
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-md px-4">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.text}
            onClick={toggleVoice}
            disabled={isConnecting}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left hover:border-primary/30 hover:bg-primary/5 active:scale-95 transition-all disabled:opacity-50"
          >
            <span
              className="material-symbols-outlined text-primary text-[18px] shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {s.icon}
            </span>
            <span className="text-white text-xs font-medium leading-tight">
              {s.text}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

