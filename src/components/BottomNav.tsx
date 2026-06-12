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

// Mobile is trimmed to the on-the-floor essentials; the fuller set
// (Tables/QR, Pricing, Customers, Delivery areas) lives in the desktop sidebar.
const ADMIN_NAV: NavItem[] = [
  { href: "/admin", icon: "dashboard", label: "Home" },
  { href: "/admin/orders", icon: "soup_kitchen", label: "Kitchen" },
  { href: "/admin/floor", icon: "grid_view", label: "Floor" },
  { href: "/admin/menu", icon: "restaurant_menu", label: "Menu" },
  { href: "/profile", icon: "person", label: "Profile" },
];

/** Most-specific-prefix wins. Prevents parent routes (like /admin) from
 *  lighting up when you're on a child route (like /admin/orders). */
function activeHref(pathname: string, items: readonly NavItem[]): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const matches =
      pathname === href || pathname.startsWith(href + "/");
    if (matches && (best === null || href.length > best.length)) {
      best = href;
    }
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
    <nav className="md:hidden fixed bottom-0 w-full z-[60] flex justify-around items-center px-4 pb-6 pt-3 bg-black/60 backdrop-blur-2xl border-t border-white/5">
      {visibleItems.map(({ href, icon, label }) => {
        const isActive = href === activeRoute;
        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            className="flex flex-col items-center gap-1 transition-colors"
          >
            {isActive ? (
              <div className="flex items-center justify-center bg-primary text-on-primary rounded-full p-2.5 shadow-lg shadow-primary/20 active:scale-90 transition-transform">
                <span
                  className="material-symbols-outlined text-[24px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {icon}
                </span>
              </div>
            ) : (
              <div className="p-2.5 text-on-surface-variant hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[24px]">{icon}</span>
              </div>
            )}
            <span
              className={`text-[10px] font-bold uppercase tracking-widest font-headline ${
                isActive ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
