"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { activeHref, routesForRole, shortcutFor, isStaffRole } from "@/lib/adminRoutes";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  shortcut?: string; // keyboard shortcut hint shown on hover
}

const PUBLIC_NAV: NavItem[] = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/chat", icon: "mic", label: "Order" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isAdmin = isStaffRole(user?.role);
  const adminNav: NavItem[] = routesForRole(user?.role).map((r) => ({
    href: r.href,
    icon: r.icon,
    label: r.label,
    shortcut: shortcutFor(r),
  }));
  const visibleItems = isAdmin ? adminNav : PUBLIC_NAV;
  const activeRoute = activeHref(pathname, visibleItems);

  const initials = user ? user.email.slice(0, 2).toUpperCase() : "??";
  const username = user?.email.split("@")[0] ?? "";

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <aside className="hidden md:flex flex-col w-64 h-dvh fixed left-0 top-0 z-50 bg-surface-container/90 backdrop-blur-2xl border-r border-white/[0.06]">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            local_fire_department
          </span>
        </div>
        <div>
          <h1 className="font-headline font-bold text-[15px] text-white leading-none tracking-tight">
            Saffron &amp; Smoke
          </h1>
          {isAdmin && (
            <p className="text-[10px] text-on-surface-variant/60 mt-0.5 font-mono uppercase tracking-widest">
              Admin Panel
            </p>
          )}
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 py-3 overflow-y-auto">
        {visibleItems.map(({ href, icon, label, shortcut }) => {
          const isActive = href === activeRoute;
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              title={label}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left w-full
                ${isActive
                  ? "admin-nav-active bg-white/[0.07] text-white"
                  : "text-on-surface-variant hover:text-white hover:bg-white/[0.04]"
                }`}
            >
              <span
                className={`material-symbols-outlined text-[20px] shrink-0 transition-colors ${isActive ? "text-primary" : "text-on-surface-variant group-hover:text-white"}`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {icon}
              </span>
              <span className="flex-1 truncate">{label}</span>
              {shortcut && (
                <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                  <kbd>{shortcut}</kbd>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] px-3 py-3">
        {user ? (
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/25 to-secondary/25 border border-primary/20 flex items-center justify-center shrink-0">
                <span className="font-headline font-bold text-[11px] text-primary">
                  {initials}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-on-surface text-sm font-medium truncate leading-none">{username}</p>
                <p className="text-on-surface-variant text-[11px] truncate mt-0.5 opacity-60">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-error/70 text-xs font-semibold hover:bg-error/8 hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => router.push("/auth/signin")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-on-surface-variant text-xs font-semibold hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">lock</span>
            Staff sign in
          </button>
        )}
      </div>
    </aside>
  );
}
