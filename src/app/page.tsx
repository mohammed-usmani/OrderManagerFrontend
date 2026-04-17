"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(user?.is_admin ? "/admin" : "/chat");
    }
  }, [isAuthenticated, user, router]);

  return (
    <main className="min-h-dvh flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 w-full fixed top-0 z-50 bg-black/20 backdrop-blur-2xl border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-2xl">restaurant</span>
          <h1 className="font-headline tracking-tight font-extrabold text-xl text-white">
            Saffron & Smoke
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/auth/signin")}
            className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest text-on-surface-variant border border-white/10 hover:text-white hover:border-white/20 transition-all"
          >
            Sign In
          </button>
          <button
            onClick={() => router.push("/auth/signup")}
            className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest bg-primary text-on-primary shadow-lg shadow-primary/20 hover:brightness-110 transition-all"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-28 pb-20 text-center relative overflow-hidden">
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[300px] rounded-full bg-secondary/5 blur-[100px]" />
        </div>

        {/* Badge */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-panel border-primary/20 mb-8">
          <span
            className="material-symbols-outlined text-primary text-[16px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary font-headline">
            AI-Powered Dining Experience
          </span>
        </div>

        <h2 className="font-headline font-extrabold text-5xl md:text-7xl text-white leading-tight mb-6 max-w-3xl">
          Your table at{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-tertiary">
            Saffron & Smoke
          </span>
        </h2>

        <p className="text-on-surface-variant text-lg md:text-xl max-w-xl leading-relaxed mb-12">
          Modern Indian in Bandra West, Mumbai. Meet Arjun — our AI front-of-
          house manager who takes your order, answers every question about the
          menu, and walks you through checkout, all by voice.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => router.push("/auth/signup")}
            className="px-8 py-4 rounded-full bg-primary text-on-primary font-headline font-bold text-sm tracking-widest uppercase shadow-2xl shadow-primary/30 hover:brightness-110 active:scale-95 transition-all"
          >
            Begin Your Experience
          </button>
          <button
            onClick={() => router.push("/auth/signin")}
            className="px-8 py-4 rounded-full glass-panel text-white font-headline font-bold text-sm tracking-widest uppercase hover:border-white/20 active:scale-95 transition-all"
          >
            Sign In
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-24 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: "mic",
              title: "Voice Ordering",
              description:
                "Speak naturally to place orders, ask about dishes, or request modifications.",
            },
            {
              icon: "restaurant_menu",
              title: "Menu Concierge",
              description:
                "Ask about spice levels, dietary tags, or get suggestions — Arjun knows every dish.",
            },
            {
              icon: "receipt_long",
              title: "Seamless Checkout",
              description:
                "Confirm your order by voice. Service charge and GST are included on the bill.",
            },
          ].map(({ icon, title, description }) => (
            <div key={title} className="glass-panel rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-primary text-xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {icon}
                </span>
              </div>
              <h3 className="font-headline font-bold text-white">{title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
