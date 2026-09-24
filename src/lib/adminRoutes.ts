/**
 * Canonical admin route registry.
 *
 * Single source of truth for the admin navigation surface. Sidebar, BottomNav,
 * the command palette, the keyboard "G"-chord shortcuts, and the shortcuts-help
 * overlay all derive from this list so they can never drift apart again.
 */

import type { StaffRole } from "@/contexts/AuthContext";

export interface AdminRoute {
  href: string;
  icon: string;        // material-symbols name
  label: string;       // canonical nav label
  goKey: string;       // letter pressed after "G" (lowercase)
  description: string; // shown in the command palette
  roles: StaffRole[];  // which staff roles may see/use this route
  mobileVisible?: boolean; // shown in the BottomNav primary bar (rest live in "More")
}

const MGR: StaffRole[] = ["owner", "manager"];
const ALL_STAFF: StaffRole[] = ["owner", "manager", "cashier", "waiter", "chef"];
const FOH: StaffRole[] = ["owner", "manager", "cashier", "waiter"]; // front-of-house

export const ADMIN_ROUTES: AdminRoute[] = [
  { href: "/admin",               icon: "dashboard",        label: "Dashboard",      goKey: "d", description: "Overview & KPIs",             roles: MGR,       mobileVisible: true },
  { href: "/admin/orders",        icon: "soup_kitchen",     label: "Kitchen",        goKey: "k", description: "Live order queue",            roles: ALL_STAFF, mobileVisible: true },
  { href: "/admin/floor",         icon: "grid_view",        label: "Floor",          goKey: "f", description: "Table layout & status",       roles: FOH,       mobileVisible: true },
  { href: "/admin/tables",        icon: "table_restaurant", label: "Tables & QR",    goKey: "t", description: "Manage tables and QR codes",  roles: FOH },
  { href: "/admin/menu",          icon: "restaurant_menu",  label: "Menu",           goKey: "m", description: "Items, categories & pricing", roles: ["owner", "manager", "chef"], mobileVisible: true },
  { href: "/admin/analytics",     icon: "monitoring",       label: "Analytics",      goKey: "a", description: "Revenue & trends",            roles: MGR },
  { href: "/admin/pricing",       icon: "payments",         label: "Pricing",        goKey: "p", description: "Dynamic pricing rules",       roles: MGR },
  { href: "/admin/customers",     icon: "groups",           label: "Customers",      goKey: "c", description: "Guest records & history",     roles: ["owner", "manager", "cashier"] },
  { href: "/admin/service-areas", icon: "pin_drop",         label: "Delivery Areas", goKey: "r", description: "Service zone configuration",  roles: MGR },
  { href: "/admin/staff",         icon: "badge",            label: "Staff",          goKey: "e", description: "Staff accounts & roles",      roles: MGR },
  { href: "/admin/settings",      icon: "settings",         label: "Settings",       goKey: "s", description: "Restaurant profile, GST & hours", roles: MGR },
];

const STAFF_ROLE_SET = new Set<StaffRole>(ALL_STAFF);

/** True if the role is any back-office staff role (not "none"). */
export function isStaffRole(role: StaffRole | undefined | null): boolean {
  return !!role && STAFF_ROLE_SET.has(role);
}

/** Roles the server lets take payments and give discounts (its CASHIER_ROLES). */
const CASHIER_ROLE_SET = new Set<StaffRole>(["owner", "manager", "cashier"]);

export function isCashierRole(role: StaffRole | undefined | null): boolean {
  return !!role && CASHIER_ROLE_SET.has(role);
}

/** Routes visible to a given role. */
export function routesForRole(role: StaffRole | undefined | null): AdminRoute[] {
  if (!role) return [];
  return ADMIN_ROUTES.filter((r) => r.roles.includes(role));
}

/** Where a role lands by default (and where to bounce them from a denied page). */
export function defaultRouteForRole(role: StaffRole | undefined | null): string {
  const routes = routesForRole(role);
  return routes[0]?.href ?? "/chat";
}

/** Can this role view the given admin pathname? */
export function canAccess(pathname: string, role: StaffRole | undefined | null): boolean {
  const match = activeHref(pathname, ADMIN_ROUTES);
  if (!match) return true; // not a known admin route (e.g. nested) — let it through
  const route = ADMIN_ROUTES.find((r) => r.href === match);
  return !!route && !!role && route.roles.includes(role);
}

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
