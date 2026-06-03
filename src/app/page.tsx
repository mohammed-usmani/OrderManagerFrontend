"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

// Public-facing delivery zone (mirrors the seeded service areas).
const DELIVERY_AREAS = [
  "Bandra West", "Pali Hill", "Carter Road", "Bandstand", "Khar West",
  "Santacruz West", "Bandra East", "BKC",
];

const STEPS = [
  {
    icon: "mic",
    kicker: "01",
    title: "Tap & talk",
    description:
      "No app to learn, no forms. Press the mic and tell Arjun what you’re craving — in plain words.",
  },
  {
    icon: "confirmation_number",
    kicker: "02",
    title: "He remembers you",
    description:
      "First time? Arjun saves your address and gives you a 4-digit code. Next time, just say the code.",
  },
  {
    icon: "local_shipping",
    kicker: "03",
    title: "Hot to your door",
    description:
      "Straight off the tandoor and out for delivery across Bandra — usually in 30–40 minutes.",
  },
];

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  // Only staff get redirected to the back-office; the public stays on the
  // landing and orders without any account.
  useEffect(() => {
    if (isAuthenticated && user?.is_admin) router.replace("/admin");
  }, [isAuthenticated, user, router]);

  return (
    <main className="min-h-dvh flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center px-5 md:px-8 py-4 w-full fixed top-0 z-50 bg-[#14100c]/40 backdrop-blur-2xl border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <span
            className="material-symbols-outlined text-primary text-[26px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            local_fire_department
          </span>
          <span className="font-headline font-semibold text-on-surface text-lg tracking-tight">
            Saffron <span className="text-primary">&amp;</span> Smoke
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/auth/signin")}
            className="px-3.5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Staff
          </button>
          <button
            onClick={() => router.push("/chat")}
            className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] bg-primary text-on-primary shadow-[0_10px_30px_-10px_rgba(255,106,26,0.7)] hover:brightness-110 active:scale-95 transition-all"
          >
            Order now
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-32 pb-16 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[12%] left-1/2 -translate-x-1/2 w-[680px] max-w-[90vw] h-[420px] rounded-full bg-primary/10 blur-[130px]" />
          <div className="absolute bottom-[8%] left-[18%] w-[420px] h-[300px] rounded-full bg-tertiary/8 blur-[110px]" />
        </div>

        <div className="reveal flex items-center gap-2 px-3.5 py-1.5 rounded-full ember-card mb-8" style={{ animationDelay: "40ms" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-tertiary">
            Parcel delivery · Bandra West
          </span>
        </div>

        <h1
          className="reveal font-headline font-light text-on-surface text-5xl md:text-7xl leading-[1.04] mb-6 max-w-3xl"
          style={{ animationDelay: "100ms" }}
        >
          Order dinner by just{" "}
          <span className="italic font-semibold text-primary">talking.</span>
        </h1>

        <p
          className="reveal text-on-surface-variant text-base md:text-lg max-w-xl leading-relaxed mb-10"
          style={{ animationDelay: "180ms" }}
        >
          Meet <span className="text-on-surface font-medium">Arjun</span> — the voice of
          our kitchen. He’ll talk you through the menu, take your order, and remember
          you by a simple 4-digit code. No app, no sign-up.
        </p>

        <div className="reveal flex flex-col sm:flex-row gap-3" style={{ animationDelay: "260ms" }}>
          <button
            onClick={() => router.push("/chat")}
            className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-primary text-on-primary font-headline font-semibold text-sm tracking-wide shadow-[0_18px_50px_-15px_rgba(255,106,26,0.7)] hover:brightness-110 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              mic
            </span>
            Start your order
          </button>
        </div>
      </section>

      {/* Delivery-area marquee */}
      <div className="relative overflow-hidden border-y border-white/5 bg-white/[0.02] py-3">
        <div className="marquee-track">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex items-center gap-8 px-4" aria-hidden={dup === 1}>
              <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-on-surface-variant/70 shrink-0">
                Now delivering to
              </span>
              {DELIVERY_AREAS.map((a) => (
                <span key={`${dup}-${a}`} className="flex items-center gap-8 shrink-0">
                  <span className="font-headline italic text-on-surface text-lg">{a}</span>
                  <span className="text-primary/60">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section className="px-6 py-20 max-w-5xl mx-auto w-full">
        <h2 className="font-headline font-semibold text-on-surface text-3xl md:text-4xl text-center mb-3">
          Three steps to dinner
        </h2>
        <p className="text-on-surface-variant text-sm text-center max-w-md mx-auto mb-12">
          The fastest way to order from Saffron &amp; Smoke is to simply speak.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map(({ icon, kicker, title, description }, i) => (
            <div
              key={title}
              className="reveal ember-card rounded-2xl p-6 relative overflow-hidden"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="absolute -top-3 -right-1 font-headline italic text-7xl text-primary/10 select-none">
                {kicker}
              </span>
              <div className="w-11 h-11 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-4">
                <span
                  className="material-symbols-outlined text-primary text-[22px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {icon}
                </span>
              </div>
              <h3 className="font-headline font-semibold text-on-surface text-lg mb-2">{title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-12">
          <button
            onClick={() => router.push("/chat")}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-on-primary font-headline font-semibold text-sm hover:brightness-110 active:scale-95 transition-all shadow-[0_14px_40px_-15px_rgba(255,106,26,0.7)]"
          >
            <span className="material-symbols-outlined text-[19px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              mic
            </span>
            Talk to Arjun
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-white/5 text-center">
        <p className="text-on-surface-variant text-xs">
          Saffron &amp; Smoke · 14 Hill Road, Bandra West, Mumbai · Lunch 11–3, Dinner 6–11 (closed Mondays)
        </p>
      </footer>
    </main>
  );
}
