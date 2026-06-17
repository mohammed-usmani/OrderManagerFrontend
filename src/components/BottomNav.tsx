"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_ROUTES, activeHref } from "@/lib/adminRoutes";

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

const PUBLIC_NAV: NavItem[] = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/chat", icon: "mic", label: "Order" },
];

// Primary admin tabs shown in the bar; everything else lives in the "More" sheet.
const ADMIN_PRIMARY: NavItem[] = ADMIN_ROUTES.filter((r) => r.mobileVisible).map((r) => ({
  href: r.href,
  icon: r.icon,
  label: r.label,
}));
const ADMIN_MORE: NavItem[] = ADMIN_ROUTES.filter((r) => !r.mobileVisible).map((r) => ({
  href: r.href,
  icon: r.icon,
  label: r.label,
}));

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_admin);
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryItems = isAdmin ? ADMIN_PRIMARY : PUBLIC_NAV;
  // For active-state matching, consider the full admin route set so a route that
  // only lives in "More" still highlights the More button when it's active.
  const allItems = isAdmin ? ADMIN_ROUTES : PUBLIC_NAV;
  const activeRoute = activeHref(pathname, allItems);
  const moreActive = isAdmin && ADMIN_MORE.some((i) => i.href === activeRoute);

  const go = (href: string) => {
    setMoreOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* "More" sheet — admin overflow routes */}
      {moreOpen && isAdmin && (
        <div className="md:hidden fixed inset-0 z-[70]" role="dialog" aria-label="More admin pages">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute bottom-0 inset-x-0 rounded-t-2xl bg-surface-container-highest/95 backdrop-blur-2xl border-t border-white/[0.08] p-3 pb-8 animate-slide-up"
            style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
            <div className="grid grid-cols-3 gap-2">
              {ADMIN_MORE.map(({ href, icon, label }) => {
                const isActive = href === activeRoute;
                return (
                  <button
                    key={href}
                    onClick={() => go(href)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl py-3 transition-colors ${
                      isActive ? "bg-primary/15 text-primary" : "text-on-surface-variant hover:bg-white/[0.05]"
                    }`}
                  >
                    <span
                      className="material-symbols-outlined text-[22px]"
                      style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      {icon}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wide">{label}</span>
                  </button>
                );
              })}
              <button
                onClick={() => go("/profile")}
                className="flex flex-col items-center gap-1.5 rounded-xl py-3 text-on-surface-variant hover:bg-white/[0.05] transition-colors"
              >
                <span className="material-symbols-outlined text-[22px]">person</span>
                <span className="text-[10px] font-semibold tracking-wide">Profile</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 w-full z-[60] flex justify-around items-end px-2 pb-safe-bottom pt-2 bg-surface-container-highest/80 backdrop-blur-2xl border-t border-white/[0.06]"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        {primaryItems.map(({ href, icon, label }) => {
          const isActive = href === activeRoute;
          return (
            <button
              key={href}
              onClick={() => go(href)}
              className="flex flex-col items-center gap-1 py-1 px-3 transition-all active:scale-90"
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <div
                className={`relative flex items-center justify-center rounded-xl transition-all duration-200 ${
                  isActive ? "bg-primary/15 px-4 py-1.5" : "px-3 py-1.5"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[22px] transition-colors ${isActive ? "text-primary" : "text-on-surface-variant"}`}
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {icon}
                </span>
              </div>
              <span className={`text-[10px] font-semibold tracking-wide transition-colors ${isActive ? "text-primary" : "text-on-surface-variant/70"}`}>
                {label}
              </span>
            </button>
          );
        })}

        {/* Admin overflow trigger */}
        {isAdmin && (
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="flex flex-col items-center gap-1 py-1 px-3 transition-all active:scale-90"
            aria-label="More admin pages"
            aria-expanded={moreOpen}
          >
            <div
              className={`relative flex items-center justify-center rounded-xl transition-all duration-200 ${
                moreActive || moreOpen ? "bg-primary/15 px-4 py-1.5" : "px-3 py-1.5"
              }`}
            >
              <span
                className={`material-symbols-outlined text-[22px] transition-colors ${moreActive || moreOpen ? "text-primary" : "text-on-surface-variant"}`}
              >
                more_horiz
              </span>
            </div>
            <span className={`text-[10px] font-semibold tracking-wide transition-colors ${moreActive || moreOpen ? "text-primary" : "text-on-surface-variant/70"}`}>
              More
            </span>
          </button>
        )}
      </nav>
    </>
  );
}
