"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type MenuItemAPI } from "@/lib/api";

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
  if (day === 1) return { open: false, label: "Closed Mondays" };
  if (h >= 11 && h < 15) return { open: true, label: "Open now · lunch till 3 PM" };
  if (h >= 18 && h < 23) return { open: true, label: "Open now · dinner till 11 PM" };
  if (h < 11) return { open: false, label: "Opens at 11 AM" };
  if (h >= 15 && h < 18) return { open: false, label: "Reopens at 6 PM" };
  return { open: false, label: "Opens 11 AM tomorrow" };
}

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [openState, setOpenState] = useState<OpenState | null>(null);
  const [dishes, setDishes] = useState<Dish[]>(FALLBACK_DISHES);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Only staff get redirected to the back-office; the public stays here.
  useEffect(() => {
    if (isAuthenticated && user?.is_admin) router.replace("/admin");
  }, [isAuthenticated, user, router]);

  // Pull real, photographed dishes from the live menu (Cloudinary images the
  // admin uploaded). Silently keep the curated fallback if it fails.
  useEffect(() => {
    let alive = true;
    api
      .getMenu()
      .then((menu) => { if (alive) setDishes(toFeatured(menu)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Live "open / closed" status in IST, refreshed each minute.
  useEffect(() => {
    setOpenState(computeOpenState());
    const t = setInterval(() => setOpenState(computeOpenState()), 60_000);
    return () => clearInterval(t);
  }, []);

  const scrollToMenu = () =>
    document.getElementById("menu")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="min-h-dvh flex flex-col">
      {/* Header — becomes more opaque after scrolling past hero */}
      <header className={`flex justify-between items-center px-5 md:px-8 py-4 w-full fixed top-0 z-50 border-b transition-all duration-300 ${scrolled ? "bg-[#14100c]/85 backdrop-blur-2xl border-white/8 shadow-lg shadow-black/20" : "bg-[#14100c]/30 backdrop-blur-xl border-white/0"}`}>
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-primary text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            local_fire_department
          </span>
          <span className="font-headline font-semibold text-on-surface text-lg tracking-tight">
            Saffron <span className="text-primary">&amp;</span> Smoke
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={scrollToMenu} className="hidden sm:inline-flex px-3.5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant hover:text-on-surface transition-colors">
            Menu
          </button>
          <button onClick={() => router.push("/auth/signin")} className="px-3.5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant hover:text-on-surface transition-colors">
            Staff
          </button>
          <button onClick={() => router.push("/chat")} className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] bg-primary text-on-primary shadow-[0_10px_30px_-10px_rgba(255,106,26,0.7)] hover:brightness-110 active:scale-95 transition-all">
            Order now
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-6 pt-32 pb-20 text-center overflow-hidden">
        {/* atmosphere */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[6%] left-1/2 -translate-x-1/2 w-[720px] max-w-[95vw] h-[460px] rounded-full bg-primary/12 blur-[140px]" />
          <div className="absolute bottom-0 left-[14%] w-[440px] h-[320px] rounded-full bg-tertiary/8 blur-[120px]" />
        </div>
        <EmberParticles />

        {/* live open/closed pill */}
        <div className="reveal relative flex items-center gap-2 px-3.5 py-1.5 rounded-full ember-card mb-9" style={{ animationDelay: "40ms" }}>
          <span className={`w-1.5 h-1.5 rounded-full ${openState?.open ? "bg-emerald-400 animate-pulse" : "bg-on-surface-variant"}`} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-tertiary">
            {openState ? openState.label : "Bandra West · parcel delivery"}
          </span>
        </div>

        {/* voice orb */}
        <div className="reveal relative mb-9" style={{ animationDelay: "120ms" }}>
          <VoiceOrb />
        </div>

        <h1 className="reveal relative font-headline font-light text-on-surface text-5xl md:text-7xl lg:text-8xl leading-[0.98] mb-6" style={{ animationDelay: "200ms" }}>
          Order dinner
          <br />
          by just <span className="italic font-semibold text-primary">talking.</span>
        </h1>

        <p className="reveal relative text-on-surface-variant text-base md:text-lg max-w-xl leading-relaxed mb-10" style={{ animationDelay: "280ms" }}>
          Meet <span className="text-on-surface font-medium">Arjun</span>, the voice of our kitchen.
          He’ll walk you through the menu, take your order, and remember you by a simple
          4-digit code. No app, no sign-up.
        </p>

        <div className="reveal relative flex flex-col sm:flex-row items-center gap-3" style={{ animationDelay: "360ms" }}>
          <button onClick={() => router.push("/chat")} className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-primary text-on-primary font-headline font-semibold text-sm tracking-wide shadow-[0_18px_50px_-15px_rgba(255,106,26,0.75)] hover:brightness-110 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
            Start your order
          </button>
          <button onClick={scrollToMenu} className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full ember-card text-on-surface font-headline font-semibold text-sm hover:border-primary/30 active:scale-95 transition-all">
            See the menu
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

      {/* From the tandoor (menu taste) */}
      <section id="menu" className="px-6 py-20 md:py-24 max-w-6xl mx-auto w-full scroll-mt-24">
        <div className="text-center mb-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-tertiary mb-3">From the tandoor</p>
          <h2 className="font-headline font-semibold text-on-surface text-3xl md:text-5xl mb-3">A taste of tonight</h2>
          <p className="text-on-surface-variant text-sm max-w-md mx-auto">
            A few of our regulars’ favourites — Arjun knows the whole menu by heart.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {dishes.map((d, i) => (
            <article
              key={`${d.name}-${i}`}
              className="reveal group rounded-2xl ember-card overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/35 hover:shadow-[0_22px_55px_-18px_rgba(255,106,26,0.5)]"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className={`relative h-40 md:h-48 bg-gradient-to-br ${d.accent}`}>
                {d.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.image}
                    alt={d.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.07]"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,200,120,0.22),transparent_65%)]" />
                )}
                {/* Gradient overlay: always present for text legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#140f09]/90 via-[#140f09]/20 to-transparent" />
                {/* Tag chip */}
                <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-[9px] font-bold uppercase tracking-[0.2em] text-white/90">
                  {d.tag}
                </span>
                {/* Heat dots */}
                {d.heat > 0 && (
                  <span className="absolute top-2.5 right-2.5 inline-flex gap-0.5 items-center">
                    {Array.from({ length: d.heat }).map((_, j) => (
                      <span
                        key={j}
                        className="material-symbols-outlined text-[12px] text-primary drop-shadow-sm"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        local_fire_department
                      </span>
                    ))}
                  </span>
                )}
                {/* Name overlaid at bottom of image */}
                <div className="absolute inset-x-0 bottom-0 px-3.5 pb-3">
                  <h3 className="font-headline font-semibold text-white text-base leading-tight">{d.name}</h3>
                </div>
              </div>
              {/* Blurb below image */}
              <div className="px-3.5 py-3">
                <p className="text-on-surface-variant text-xs leading-relaxed line-clamp-2">{d.blurb}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="flex justify-center mt-10">
          <button onClick={() => router.push("/chat")} className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full ember-card text-on-surface font-headline font-semibold text-sm hover:border-primary/30 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-[19px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant_menu</span>
            Ask Arjun for the full menu
          </button>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 pb-20 md:pb-24 max-w-5xl mx-auto w-full">
        <h2 className="font-headline font-semibold text-on-surface text-3xl md:text-4xl text-center mb-12">Three steps to dinner</h2>
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* connecting line (desktop) */}
          <div className="hidden md:block absolute top-[34px] left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
          {STEPS.map(({ icon, kicker, title, description }, i) => (
            <div key={title} className="reveal ember-card rounded-2xl p-6 relative overflow-hidden" style={{ animationDelay: `${i * 90}ms` }}>
              <span className="absolute -top-3 -right-1 font-headline italic text-7xl text-primary/10 select-none">{kicker}</span>
              <div className="relative w-12 h-12 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              </div>
              <h3 className="font-headline font-semibold text-on-surface text-lg mb-2">{title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA band */}
      <section className="relative overflow-hidden px-6 py-20 md:py-24 text-center border-t border-white/5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-[-30%] left-1/2 -translate-x-1/2 w-[800px] max-w-[120vw] h-[460px] rounded-full bg-primary/14 blur-[130px]" />
        </div>
        <h2 className="reveal relative font-headline font-light text-on-surface text-4xl md:text-6xl leading-[1.05] mb-5">
          Hungry? <span className="italic font-semibold text-primary">Just say the word.</span>
        </h2>
        <p className="relative text-on-surface-variant text-sm md:text-base max-w-md mx-auto mb-9">
          {openState?.open
            ? "The tandoor’s lit and we’re taking orders right now."
            : "Browse anytime — we’ll be ready when the kitchen opens."}
        </p>
        <button onClick={() => router.push("/chat")} className="relative inline-flex items-center gap-2 px-9 py-4 rounded-full bg-primary text-on-primary font-headline font-semibold text-sm tracking-wide shadow-[0_18px_50px_-15px_rgba(255,106,26,0.8)] hover:brightness-110 active:scale-95 transition-all">
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
          Talk to Arjun
        </button>
      </section>

      {/* Footer */}
      <footer className="px-6 py-10 border-t border-white/5">
        <div className="max-w-5xl mx-auto grid gap-6 sm:grid-cols-3 text-center sm:text-left">
          <div>
            <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
              <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
              <span className="font-headline font-semibold text-on-surface">Saffron &amp; Smoke</span>
            </div>
            <p className="text-on-surface-variant text-xs leading-relaxed">14 Hill Road, Bandra West, Mumbai 400050</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant/70 mb-2">Hours</p>
            <p className="text-on-surface-variant text-xs leading-relaxed">Lunch 11 AM – 3 PM<br />Dinner 6 PM – 11 PM<br />Closed Mondays</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant/70 mb-2">Delivering across</p>
            <p className="text-on-surface-variant text-xs leading-relaxed">Bandra · Pali Hill · Khar · Santacruz · BKC</p>
            <button onClick={() => router.push("/auth/signin")} className="mt-3 text-[11px] text-on-surface-variant hover:text-on-surface transition-colors inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">lock</span> Staff sign in
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

// --- Hero voice orb: pulsing rings + ember core with an equalizer ---------
function VoiceOrb() {
  return (
    <div className="relative w-32 h-32">
      <span className="absolute -inset-4 rounded-full border border-primary/20 animate-ping" style={{ animationDuration: "2.8s" }} />
      <span className="absolute -inset-1 rounded-full border border-primary/25 animate-ping" style={{ animationDuration: "2.8s", animationDelay: "0.9s" }} />
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-tertiary shadow-[0_0_70px_-8px_rgba(255,106,26,0.7)] flex items-center justify-center gap-[5px]">
        {[14, 26, 20, 32, 18].map((h, i) => (
          <span
            key={i}
            className="eq-bar w-[5px] rounded-full bg-on-primary/85"
            style={{ height: `${h}px`, animationDelay: `${i * 0.13}s`, animationDuration: `${0.9 + (i % 3) * 0.25}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// --- Rising ember particles (deterministic positions to avoid SSR drift) --
function EmberParticles() {
  return (
    <div className="absolute inset-x-0 bottom-0 h-64 pointer-events-none overflow-hidden" aria-hidden>
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full bg-primary"
          style={{
            left: `${(i * 7 + (i % 3) * 3) % 100}%`,
            width: `${3 + (i % 3)}px`,
            height: `${3 + (i % 3)}px`,
            opacity: 0.5,
            animation: `ember-float ${4 + (i % 4)}s ease-in ${(i % 7) * 0.6}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
