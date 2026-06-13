"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

const PUBLIC_NAV: NavItem[] = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/chat", icon: "mic", label: "Order" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin",        icon: "dashboard",       label: "Home" },
  { href: "/admin/orders", icon: "soup_kitchen",    label: "Kitchen" },
  { href: "/admin/floor",  icon: "grid_view",       label: "Floor" },
  { href: "/admin/menu",   icon: "restaurant_menu", label: "Menu" },
  { href: "/profile",      icon: "person",          label: "Profile" },
];

function activeHref(pathname: string, items: readonly NavItem[]): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const matches = pathname === href || pathname.startsWith(href + "/");
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const visibleItems = user?.is_admin ? ADMIN_NAV : PUBLIC_NAV;
  const activeRoute = activeHref(pathname, visibleItems);

  return (
    <nav className="md:hidden fixed bottom-0 w-full z-[60] flex justify-around items-end px-2 pb-safe-bottom pt-2 bg-surface-container-highest/80 backdrop-blur-2xl border-t border-white/[0.06]"
      style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
    >
      {visibleItems.map(({ href, icon, label }) => {
        const isActive = href === activeRoute;
        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            className="flex flex-col items-center gap-1 py-1 px-3 transition-all active:scale-90"
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
          >
            <div
              className={`relative flex items-center justify-center rounded-xl transition-all duration-200
                ${isActive
                  ? "bg-primary/15 px-4 py-1.5"
                  : "px-3 py-1.5"
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
    </nav>
  );
}
