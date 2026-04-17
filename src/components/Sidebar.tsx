"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

// Admins get the back-office nav; customers get the ordering nav. Admins
// never see Chat or customer Orders — their job is management.
const CUSTOMER_NAV: NavItem[] = [
  { href: "/chat", icon: "chat_bubble", label: "Chat" },
  { href: "/orders", icon: "receipt_long", label: "Orders" },
  { href: "/profile", icon: "person", label: "Profile" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", icon: "dashboard", label: "Dashboard" },
  { href: "/admin/orders", icon: "soup_kitchen", label: "Kitchen" },
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

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const visibleItems = user?.is_admin ? ADMIN_NAV : CUSTOMER_NAV;
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

      {/* User section */}
      <div className="border-t border-white/5 px-4 py-4 space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center ring-1 ring-primary/20 shrink-0">
            <span className="font-headline font-bold text-xs text-primary">
              {initials}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {user?.email.split("@")[0]}
            </p>
            <p className="text-on-surface-variant text-[11px] truncate">
              {user?.email}
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
      </div>
    </aside>
  );
}
