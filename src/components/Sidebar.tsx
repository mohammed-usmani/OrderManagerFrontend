"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

// The ordering line is public (anonymous parcel callers). Customers only need
// the landing + the voice mic — no accounts. Admins get the back-office nav.
const PUBLIC_NAV: NavItem[] = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/chat", icon: "mic", label: "Order" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", icon: "dashboard", label: "Dashboard" },
  { href: "/admin/orders", icon: "soup_kitchen", label: "Kitchen" },
  { href: "/admin/menu", icon: "restaurant_menu", label: "Menu" },
  { href: "/admin/customers", icon: "groups", label: "Customers" },
  { href: "/admin/service-areas", icon: "pin_drop", label: "Delivery areas" },
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

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const visibleItems = user?.is_admin ? ADMIN_NAV : PUBLIC_NAV;
  const activeRoute = activeHref(pathname, visibleItems);

  const initials = user ? user.email.slice(0, 2).toUpperCase() : "??";

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <aside className="hidden md:flex flex-col w-64 h-dvh fixed left-0 top-0 z-50 bg-surface-container/80 backdrop-blur-2xl border-r border-white/5">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
        <span className="material-symbols-outlined text-primary text-2xl">
          restaurant
        </span>
        <h1 className="font-headline tracking-tight font-extrabold text-lg text-white">
          Saffron & Smoke
        </h1>
      </div>

      {/* Nav links */}
      <nav className="flex-1 flex flex-col gap-1 px-3 py-4">
        {visibleItems.map(({ href, icon, label }) => {
          const isActive = href === activeRoute;
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary/10 text-primary font-bold"
                  : "text-on-surface-variant hover:text-white hover:bg-white/5"
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={
                  isActive
                    ? { fontVariationSettings: "'FILL' 1" }
                    : undefined
                }
              >
                {icon}
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      {/* Footer — staff identity when logged in, otherwise a quiet staff door */}
      <div className="border-t border-white/5 px-4 py-4 space-y-3">
        {user ? (
          <>
            <div className="flex items-center gap-3 px-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center ring-1 ring-primary/20 shrink-0">
                <span className="font-headline font-bold text-xs text-primary">
                  {initials}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-on-surface text-sm font-medium truncate">
                  {user.email.split("@")[0]}
                </p>
                <p className="text-on-surface-variant text-[11px] truncate">
                  {user.email}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-error/80 text-xs font-bold hover:bg-error/5 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              Sign Out
            </button>
          </>
        ) : (
          <button
            onClick={() => router.push("/auth/signin")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-on-surface-variant text-xs font-semibold hover:text-on-surface hover:bg-white/5 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">lock</span>
            Staff sign in
          </button>
        )}
      </div>
    </aside>
  );
}
