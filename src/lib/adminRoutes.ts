/**
 * Canonical admin route registry.
 *
 * Single source of truth for the admin navigation surface. Sidebar, BottomNav,
 * the command palette, the keyboard "G"-chord shortcuts, and the shortcuts-help
 * overlay all derive from this list so they can never drift apart again.
 */

export interface AdminRoute {
  href: string;
  icon: string;        // material-symbols name
  label: string;       // canonical nav label
  goKey: string;       // letter pressed after "G" (lowercase)
  description: string; // shown in the command palette
  mobileVisible?: boolean; // shown in the BottomNav primary bar (rest live in "More")
}

export const ADMIN_ROUTES: AdminRoute[] = [
  { href: "/admin",               icon: "dashboard",        label: "Dashboard",      goKey: "d", description: "Overview & KPIs",             mobileVisible: true },
  { href: "/admin/orders",        icon: "soup_kitchen",     label: "Kitchen",        goKey: "k", description: "Live order queue",            mobileVisible: true },
  { href: "/admin/floor",         icon: "grid_view",        label: "Floor",          goKey: "f", description: "Table layout & status",       mobileVisible: true },
  { href: "/admin/tables",        icon: "table_restaurant", label: "Tables & QR",    goKey: "t", description: "Manage tables and QR codes" },
  { href: "/admin/menu",          icon: "restaurant_menu",  label: "Menu",           goKey: "m", description: "Items, categories & pricing", mobileVisible: true },
  { href: "/admin/analytics",     icon: "monitoring",       label: "Analytics",      goKey: "a", description: "Revenue & trends" },
  { href: "/admin/pricing",       icon: "payments",         label: "Pricing",        goKey: "p", description: "Dynamic pricing rules" },
  { href: "/admin/customers",     icon: "groups",           label: "Customers",      goKey: "c", description: "Guest records & history" },
  { href: "/admin/service-areas", icon: "pin_drop",         label: "Delivery Areas", goKey: "r", description: "Service zone configuration" },
];

/** Keyboard hint, e.g. "G D". */
export function shortcutFor(r: AdminRoute): string {
  return `G ${r.goKey.toUpperCase()}`;
}

/** href keyed by goKey, for the "G"+letter chord. */
export const ADMIN_GOTO: Record<string, string> = ADMIN_ROUTES.reduce(
  (m, r) => ((m[r.goKey] = r.href), m),
  {} as Record<string, string>
);

/** Most-specific-prefix wins, so /admin doesn't light up on /admin/orders. */
export function activeHref(
  pathname: string,
  items: readonly { href: string }[]
): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const matches = pathname === href || pathname.startsWith(href + "/");
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
