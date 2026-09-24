"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type MenuItemAPI } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { defaultRouteForRole, isStaffRole } from "@/lib/adminRoutes";
import { SpiceCosmos } from "@/components/SpiceCosmos";

// Public-facing delivery zone (mirrors the seeded service areas).
const DELIVERY_AREAS = [
  "Bandra West", "Pali Hill", "Carter Road", "Bandstand", "Khar West",
  "Santacruz West", "Bandra East", "BKC",
];

// Normalized card shape used by the "A taste of tonight" strip. `image` is the
// live Cloudinary photo when available; `accent` is the warm gradient fallback.
type Dish = { name: string; blurb: string; tag: string; heat: number; image: string | null; accent: string };

const ACCENTS = [
  "from-orange-700/55 to-red-900/40",
  "from-amber-800/50 to-stone-800/40",
  "from-yellow-700/50 to-amber-900/40",
  "from-rose-700/50 to-amber-800/35",
];

// Curated fallback — shown only if the live menu can't be reached or has no
// photographed dishes yet. No hard prices so it never drifts from the menu.
const FALLBACK_DISHES: Dish[] = [
  { name: "Butter Chicken", blurb: "Silky tomato-butter gravy — our all-time #1.", tag: "Mains", heat: 1, image: null, accent: ACCENTS[0] },
  { name: "Dal Makhani", blurb: "Black lentils slow-cooked overnight till velvety.", tag: "Mains", heat: 0, image: null, accent: ACCENTS[1] },
  { name: "Chicken Dum Biryani", blurb: "Sealed and steamed over saffron rice.", tag: "Rice", heat: 2, image: null, accent: ACCENTS[2] },
  { name: "Paneer Tikka", blurb: "Charred in the tandoor — smoky and soft.", tag: "Starters", heat: 2, image: null, accent: ACCENTS[3] },
];

function heatFromSpice(level: string | null | undefined): number {
  switch ((level || "").toLowerCase()) {
    case "hot":
    case "very hot":
    case "fiery":
      return 3;
    case "medium":
    case "spicy":
      return 2;
    case "mild":
      return 1;
    default:
      return 0;
  }
}

// Pick the most enticing photographed dishes from the live menu.
function toFeatured(menu: MenuItemAPI[]): Dish[] {
  const withPhotos = menu
    .filter((m) => m.available && m.image_url)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 4);
  if (withPhotos.length === 0) return FALLBACK_DISHES;
  return withPhotos.map((m, i) => ({
    name: m.name,
    blurb: (m.taste_profile || m.description || "").trim() || "A house favourite.",
    tag: m.category,
    heat: heatFromSpice(m.spice_level),
    image: m.image_url,
    accent: ACCENTS[i % ACCENTS.length],
  }));
}

const STEPS = [
  { icon: "mic", kicker: "01", title: "Tap & talk", description: "No app, no forms. Press the mic and tell Arjun what you’re craving — in plain words." },
  { icon: "confirmation_number", kicker: "02", title: "He remembers you", description: "First time? Arjun saves your address and gives you a 4-digit code. Next time, just say it." },
  { icon: "local_shipping", kicker: "03", title: "Hot to your door", description: "Straight off the tandoor and out for delivery across Bandra — usually 30–40 minutes." },
];

type OpenState = { open: boolean; label: string };

function computeOpenState(): OpenState {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(); // 0 Sun … 1 Mon
  const h = ist.getHours();
  if (day === 1) return { open: false, label: "Closed today · open Tuesday 11 AM" };
  if (h >= 11 && h < 15) return { open: true, label: "Open now · lunch till 3 PM" };
  if (h >= 18 && h < 23) return { open: true, label: "Open now · dinner till 11 PM" };
  if (h < 11) return { open: false, label: "Opens at 11 AM" };
  if (h >= 15 && h < 18) return { open: false, label: "Reopens at 6 PM" };
  return { open: false, label: day === 0 ? "Opens Tuesday 11 AM" : "Opens 11 AM tomorrow" };
}

/** A clock that ticks once a minute. On the server it reads null, so the status
 *  renders after hydration instead of baking the build time into the page. */
function subscribeToMinute(onTick: () => void) {
  const timer = setInterval(onTick, 60_000);
  return () => clearInterval(timer);
}
const currentMinute = () => Math.floor(Date.now() / 60_000);

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const minute = useSyncExternalStore(subscribeToMinute, currentMinute, () => null);
  // Live "open / closed" status in IST, refreshed each minute.
  const openState = useMemo<OpenState | null>(
    () => (minute === null ? null : computeOpenState()),
    [minute],
  );
  const [dishes, setDishes] = useState<Dish[]>(FALLBACK_DISHES);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Only staff get redirected to the back-office (each to their home station).
  useEffect(() => {
    if (isAuthenticated && isStaffRole(user?.role)) {
      router.replace(defaultRouteForRole(user?.role));
    }
  }, [isAuthenticated, user, router]);

  // Live photographed dishes from the menu (Cloudinary); keep fallback on error.
  useEffect(() => {
    let alive = true;
    api.getMenu().then((menu) => { if (alive) setDishes(toFeatured(menu)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const goChat = () => router.push("/chat");
  const scrollToMenu = () =>
    document.getElementById("menu")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Staff are being redirected — don't flash the customer landing.
  if (isAuthenticated && isStaffRole(user?.role)) return null;

  return (
    <main className="relative min-h-dvh overflow-x-hidden">
      {/* Spice Cosmos — fixed WebGL field behind everything */}
      <SpiceCosmos />
      <div className="cosmos-scrim" aria-hidden="true" />

      {/* Header */}
      <header className={`flex justify-between items-center px-5 md:px-10 py-4 w-full fixed top-0 z-50 border-b transition-all duration-300 ${scrolled ? "bg-[#14100c]/85 backdrop-blur-2xl border-white/8 shadow-lg shadow-black/20" : "bg-transparent backdrop-blur-0 border-white/0"}`}>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-primary text-[26px] drop-shadow-[0_0_12px_rgba(255,106,26,0.6)]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
          <span className="font-headline font-medium text-on-surface text-xl tracking-tight">Saffron <span className="text-primary">&amp;</span> Smoke</span>
        </button>
        <nav className="flex items-center gap-5 md:gap-8">
          <button onClick={scrollToMenu} className="hidden sm:inline text-[13px] font-medium text-on-surface-variant hover:text-on-surface transition-colors tracking-wide">Menu</button>
          <button onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })} className="hidden md:inline text-[13px] font-medium text-on-surface-variant hover:text-on-surface transition-colors tracking-wide">How it works</button>
          <button onClick={() => router.push("/auth/signin")} className="hidden sm:inline text-[13px] font-medium text-on-surface-variant hover:text-on-surface transition-colors tracking-wide">Staff</button>
          <button onClick={goChat} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-on-primary font-bold text-[13px] tracking-wide shadow-[0_6px_26px_rgba(255,106,26,0.35)] hover:-translate-y-0.5 hover:shadow-[0_10px_34px_rgba(255,106,26,0.5)] transition-all">
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span> Order now
          </button>
        </nav>
      </header>

      {/* HERO — editorial, kinetic, left-aligned over the cosmos */}
      <section className="relative z-10 min-h-[100svh] flex flex-col justify-center max-w-[1240px] mx-auto w-full px-6 md:px-10 pt-28 pb-14">
        <span className="reveal self-start inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-[12.5px] font-semibold uppercase tracking-[0.06em] text-tertiary border border-tertiary/30 bg-tertiary/10 backdrop-blur-md">
          <span className={`w-2 h-2 rounded-full ${openState?.open ? "bg-emerald-400 animate-pulse" : "bg-on-surface-variant"}`} />
          {openState ? openState.label : "Bandra West · voice ordering"}
        </span>

        <h1 className="reveal font-headline font-light text-on-surface mt-7 leading-[0.98] tracking-[-0.015em] text-[clamp(3rem,9vw,8.5rem)] max-w-[14ch]" style={{ animationDelay: "80ms" }}>
          Order dinner by <span className="italic font-semibold text-primary drop-shadow-[0_0_48px_rgba(255,106,26,0.35)]">just talking.</span>
        </h1>

        <p className="reveal text-on-surface-variant mt-7 max-w-[52ch] text-[clamp(0.95rem,1.5vw,1.18rem)] leading-[1.62]" style={{ animationDelay: "160ms" }}>
          Meet <b className="text-on-surface font-semibold">Arjun</b>, the voice of our kitchen. He’ll walk you
          through the menu, take your order, and remember you by a simple <b className="text-on-surface font-semibold">4-digit code</b>. No app, no sign-up.
        </p>

        <div className="reveal flex flex-wrap items-center gap-4 mt-10" style={{ animationDelay: "240ms" }}>
          <button onClick={goChat} className="inline-flex items-center gap-2.5 px-7 py-4 rounded-full bg-gradient-to-br from-primary to-[#e85d12] text-on-primary font-bold text-base shadow-[0_10px_40px_rgba(255,106,26,0.4)] hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_16px_52px_rgba(255,106,26,0.58)] transition-all">
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span> Start your order
          </button>
          <button onClick={scrollToMenu} className="inline-flex items-center gap-2 px-6 py-4 rounded-full border border-outline/70 text-on-surface font-semibold text-[15px] bg-white/[0.02] hover:border-primary/50 hover:text-primary transition-all">
            <span className="material-symbols-outlined text-[20px]">restaurant_menu</span> See the menu
          </button>
        </div>

        <div className="reveal mt-auto pt-14 flex flex-wrap items-baseline gap-x-10 gap-y-3 text-[12.5px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant" style={{ animationDelay: "320ms" }}>
          <span><b className="text-on-surface">Modern Indian</b> · Bandra West</span>
          <span className="text-outline">/</span>
          <span>Delivery in <b className="text-on-surface">30–40 min</b></span>
          <span className="text-outline">/</span>
          <span>Voice-first · <b className="text-on-surface">say it, eat it</b></span>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 flex flex-col items-center gap-2 text-on-surface-variant/70 text-[11px] uppercase tracking-[0.22em]">
          scroll
          <span className="cosmos-dropline w-px h-8 bg-gradient-to-b from-primary to-transparent" />
        </div>
      </section>

      {/* Delivery-area marquee */}
      <div className="relative z-10 overflow-hidden border-y border-outline/30 bg-[#120e09]/50 backdrop-blur-md py-5">
        <div className="marquee-track">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex items-center px-2" aria-hidden={dup === 1}>
              <span className="font-headline font-semibold not-italic text-tertiary text-[clamp(1.4rem,3vw,2.4rem)] px-1">Now delivering to</span>
              <span className="text-primary px-7 text-lg">✦</span>
              {DELIVERY_AREAS.map((a) => (
                <span key={`${dup}-${a}`} className="flex items-center shrink-0">
                  <span className="font-headline italic font-light text-on-surface text-[clamp(1.4rem,3vw,2.4rem)] px-1">{a}</span>
                  <span className="text-primary px-7 text-lg">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* MENU — A taste of tonight (live dishes) */}
      <section id="menu" className="relative z-10 max-w-[1240px] mx-auto w-full px-6 md:px-10 py-24 md:py-32 scroll-mt-24">
        <div className="reveal flex flex-wrap justify-between items-end gap-8 mb-14">
          <div>
            <span className="inline-flex items-center gap-2.5 text-tertiary text-[12.5px] font-bold uppercase tracking-[0.22em] before:content-[''] before:w-7 before:h-px before:bg-primary">From the tandoor</span>
            <h2 className="font-headline font-light text-on-surface text-[clamp(2.1rem,5.4vw,4.5rem)] mt-4 leading-[1.02] max-w-[18ch]">A taste of <span className="italic text-primary">tonight.</span></h2>
          </div>
          <p className="max-w-[34ch] text-on-surface-variant text-[15px] leading-relaxed">Tonight’s most-loved plates, straight off the tandoor. The full menu lives with Arjun — just ask.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {dishes.map((d, i) => (
            <article key={`${d.name}-${i}`} className="reveal group relative rounded-[18px] overflow-hidden aspect-[3/4] border border-outline/40 bg-[#211a12]/70 transition-all duration-500 hover:-translate-y-2 hover:border-primary/50 hover:shadow-[0_24px_60px_rgba(0,0,0,0.5)]" style={{ animationDelay: `${i * 70}ms` }}>
              <div className={`absolute inset-0 bg-gradient-to-br ${d.accent}`}>
                {d.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.image} alt={d.name} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.07]" />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_25%,rgba(255,200,120,0.22),transparent_70%)]" />
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#140f09]/95 via-[#140f09]/25 to-transparent" />
              <div className="absolute inset-0 p-4 flex flex-col justify-between">
                <span className="self-start px-3 py-1.5 rounded-full bg-[#140c0c]/60 backdrop-blur-sm border border-[#f2da8e]/30 text-[#f2da8e] text-[11px] font-bold uppercase tracking-[0.1em]">{d.tag}</span>
                <div>
                  {d.heat > 0 && (
                    <div className="flex gap-1 mb-2.5">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <span key={j} className={`w-[7px] h-[7px] rounded-full ${j < d.heat ? "bg-primary shadow-[0_0_8px_rgba(255,106,26,0.8)]" : "bg-white/15"}`} />
                      ))}
                    </div>
                  )}
                  <h3 className="font-headline font-medium text-on-surface text-[23px] leading-tight tracking-[-0.01em]">{d.name}</h3>
                  <p className="mt-1.5 text-on-surface-variant text-[13px] leading-snug line-clamp-2">{d.blurb}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="reveal flex justify-center mt-12">
          <button onClick={goChat} className="inline-flex items-center gap-2 px-7 py-4 rounded-full border border-outline/70 text-on-surface font-semibold text-[15px] bg-white/[0.02] hover:border-primary/50 hover:text-primary transition-all">
            <span className="material-symbols-outlined text-[19px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>graphic_eq</span> Ask Arjun for the full menu
          </button>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative z-10 max-w-[1240px] mx-auto w-full px-6 md:px-10 py-12 md:py-20">
        <div className="reveal">
          <span className="inline-flex items-center gap-2.5 text-tertiary text-[12.5px] font-bold uppercase tracking-[0.22em] before:content-[''] before:w-7 before:h-px before:bg-primary">Three steps to dinner</span>
          <h2 className="font-headline font-light text-on-surface text-[clamp(2.1rem,5.4vw,4.5rem)] mt-4 leading-[1.02] max-w-[18ch]">No app. No forms. <span className="italic text-primary">Just say it.</span></h2>
        </div>
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-5 mt-14">
          <div className="hidden md:block absolute top-[64px] left-[8%] right-[8%] h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-60" />
          {STEPS.map(({ icon, kicker, title, description }, i) => (
            <div key={title} className="reveal relative rounded-[20px] p-8 border border-outline/40 bg-gradient-to-b from-[#2e2418]/60 to-[#211a12]/50 backdrop-blur-sm overflow-hidden" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="font-headline italic font-light text-[74px] leading-none text-transparent [-webkit-text-stroke:1.2px_var(--color-primary)] opacity-90">{kicker}</div>
              <div className="absolute top-8 right-7 w-[54px] h-[54px] grid place-items-center rounded-full bg-primary/12 border border-primary/40 text-primary">
                <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              </div>
              <h3 className="font-headline font-medium text-on-surface text-2xl mt-6 mb-2.5">{title}</h3>
              <p className="text-on-surface-variant text-[14.5px] leading-[1.62]">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* VOICE BURST CTA */}
      <section className="relative z-10 text-center px-6 py-28 md:py-40 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(60%_60%_at_50%_50%,rgba(255,106,26,0.18),transparent_70%)]" />
        <div className="reveal relative">
          <span className="text-tertiary text-[13px] font-bold uppercase tracking-[0.24em]">The voice of the kitchen</span>
          <h2 className="font-headline font-light text-on-surface text-[clamp(2.6rem,8vw,7rem)] mt-5 mb-2 leading-[1.0] max-w-[16ch] mx-auto">Hungry? <span className="italic text-primary">Just say the word.</span></h2>
          <div className="flex justify-center mt-12 mb-2">
            <VoiceOrb onClick={goChat} />
          </div>
          <p className="text-on-surface-variant text-sm md:text-base max-w-md mx-auto mt-8 mb-7">
            {openState?.open ? "The tandoor’s lit and we’re taking orders right now." : "Browse anytime — we’ll be ready when the kitchen opens."}
          </p>
          <button onClick={goChat} className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-gradient-to-br from-primary to-[#e85d12] text-on-primary font-bold text-base shadow-[0_10px_40px_rgba(255,106,26,0.4)] hover:-translate-y-0.5 hover:shadow-[0_16px_52px_rgba(255,106,26,0.58)] transition-all">
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>graphic_eq</span> Talk to Arjun
          </button>
        </div>
      </section>

      {/* DELIVERY + HOURS split */}
      <section id="delivery" className="relative z-10 max-w-[1240px] mx-auto w-full px-6 md:px-10 py-20 md:py-28">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-16 items-center">
          <div className="reveal">
            <span className="inline-flex items-center gap-2.5 text-tertiary text-[12.5px] font-bold uppercase tracking-[0.22em] before:content-[''] before:w-7 before:h-px before:bg-primary">Now delivering to</span>
            <h2 className="font-headline font-light text-on-surface text-[clamp(2.1rem,5.4vw,4.5rem)] mt-4 leading-[1.02]">Across <span className="italic text-primary">Bandra</span> &amp; beyond.</h2>
            <div className="flex flex-wrap gap-2.5 mt-8">
              {DELIVERY_AREAS.map((a) => (
                <span key={a} className="rounded-full border border-outline/50 bg-[#211a12]/50 px-4 py-2 text-[13.5px] text-on-surface hover:border-primary/50 hover:text-primary transition-colors">{a}</span>
              ))}
            </div>
          </div>
          <div className="reveal rounded-[22px] p-9 border border-outline/45 bg-gradient-to-b from-[#2e2418]/55 to-[#211a12]/50 backdrop-blur-sm">
            <h3 className="font-headline font-medium text-on-surface text-2xl mb-5">Open hours</h3>
            <div className="flex justify-between py-3.5 border-b border-outline/30 text-[15px]"><span className="text-on-surface-variant">Lunch · Tue–Sun</span><span className="font-semibold font-mono tabular-nums">11:00 — 15:00</span></div>
            <div className="flex justify-between py-3.5 border-b border-outline/30 text-[15px]"><span className="text-on-surface-variant">Dinner · Tue–Sun</span><span className="font-semibold font-mono tabular-nums">18:00 — 23:00</span></div>
            <div className="flex justify-between py-3.5 text-[15px]"><span className="text-on-surface-variant">Monday</span><span className="font-semibold text-primary">Closed</span></div>
            <p className="mt-6 text-on-surface-variant text-sm leading-relaxed">
              <b className="text-on-surface">{BRAND.name}</b><br />{BRAND.address.line1}, {BRAND.address.line2}<br />{BRAND.phone}
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-outline/35 bg-[#120e09]/70 backdrop-blur-md px-6 md:px-10 pt-16 pb-10">
        <div className="max-w-[1240px] mx-auto grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="material-symbols-outlined text-primary text-[26px] drop-shadow-[0_0_12px_rgba(255,106,26,0.6)]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
              <span className="font-headline font-medium text-on-surface text-xl">Saffron &amp; Smoke</span>
            </div>
            <p className="text-on-surface-variant text-sm leading-relaxed max-w-[34ch]">Modern Indian, cooked over live fire in Bandra West. Order by talking to Arjun — no app, no sign-up, just your voice and a 4-digit code.</p>
          </div>
          <div>
            <h4 className="text-[12px] uppercase tracking-[0.18em] text-on-surface-variant mb-4 font-bold">Explore</h4>
            <div className="flex flex-col gap-1.5 text-[14.5px]">
              <button onClick={scrollToMenu} className="text-on-surface/85 hover:text-primary text-left transition-colors">Menu</button>
              <button onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })} className="text-on-surface/85 hover:text-primary text-left transition-colors">How it works</button>
              <button onClick={goChat} className="text-on-surface/85 hover:text-primary text-left transition-colors">Order now</button>
            </div>
          </div>
          <div>
            <h4 className="text-[12px] uppercase tracking-[0.18em] text-on-surface-variant mb-4 font-bold">Visit</h4>
            <p className="text-on-surface/85 text-[14.5px] leading-[1.9]">{BRAND.address.line1}<br />{BRAND.address.line2}</p>
            <p className="text-on-surface-variant text-[13px] mt-2">Lunch 11–3 · Dinner 6–11 · Closed Mondays</p>
            <button onClick={() => router.push("/auth/signin")} className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-[#f2da8e] hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[14px]">lock</span> Staff sign in →
            </button>
          </div>
        </div>
        <div className="max-w-[1240px] mx-auto mt-14 pt-6 border-t border-outline/25 flex flex-wrap justify-between gap-4 text-on-surface-variant text-[12.5px]">
          <span>© 2026 Saffron &amp; Smoke · Bandra West, Mumbai</span>
          <span>Voice ordering by Arjun</span>
        </div>
      </footer>
    </main>
  );
}

// --- Voice orb: pulsing rings + ember core with an equalizer (voice band CTA) ---
function VoiceOrb({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative w-[168px] h-[168px]">
      <span className="absolute inset-0 rounded-full border border-primary/60 animate-ping" style={{ animationDuration: "3s" }} />
      <span className="absolute inset-0 rounded-full border border-primary/40 animate-ping" style={{ animationDuration: "3s", animationDelay: "1.5s" }} />
      <button
        onClick={onClick}
        aria-label="Talk to Arjun"
        className="absolute inset-0 rounded-full grid place-items-center cursor-pointer hover:scale-105 transition-transform shadow-[0_0_70px_rgba(255,106,26,0.6)]"
        style={{ background: "radial-gradient(40% 40% at 35% 30%, #ffd9a8, #f4a300 30%, #ff6a1a 62%, #e85d12 100%)" }}
      >
        <span className="material-symbols-outlined text-on-primary text-[54px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
      </button>
      <div className="absolute left-1/2 -bottom-0.5 -translate-x-1/2 flex items-end gap-[5px] h-[34px] z-[3]">
        {[40, 80, 100, 65, 45].map((h, i) => (
          <span key={i} className="eq-bar w-[5px] rounded-[3px] bg-[#f2da8e]" style={{ height: `${h}%`, animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}
