"use client";

/**
 * useAdminKeyboard — global keyboard shortcut system for the admin panel.
 *
 * Shortcuts:
 *   Cmd+K / Ctrl+K  → open command palette
 *   G then D        → go to Dashboard
 *   G then K        → go to Kitchen
 *   G then F        → go to Floor
 *   G then M        → go to Menu
 *   G then A        → go to Analytics
 *   G then C        → go to Customers
 *   G then T        → go to Tables & QR
 *   G then P        → go to Pricing
 *   G then R        → go to Delivery areas
 *   ?               → open help overlay (shows all shortcuts)
 *   /               → focus page search input (if present)
 *
 * Usage:
 *   const { paletteOpen, closePalette } = useAdminKeyboard();
 *   <CommandPalette open={paletteOpen} onClose={closePalette} />
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AdminRoute =
  | "dashboard" | "kitchen" | "floor" | "menu" | "analytics"
  | "customers" | "tables" | "pricing" | "areas";

const GOTO_MAP: Record<string, AdminRoute> = {
  d: "dashboard",
  k: "kitchen",
  f: "floor",
  m: "menu",
  a: "analytics",
  c: "customers",
  t: "tables",
  p: "pricing",
  r: "areas",
};

const ROUTE_MAP: Record<AdminRoute, string> = {
  dashboard: "/admin",
  kitchen:   "/admin/orders",
  floor:     "/admin/floor",
  menu:      "/admin/menu",
  analytics: "/admin/analytics",
  customers: "/admin/customers",
  tables:    "/admin/tables",
  pricing:   "/admin/pricing",
  areas:     "/admin/service-areas",
};

export function useAdminKeyboard() {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Track the "G" leader key press for compound shortcuts
  const [gLeader, setGLeader] = useState(false);
  const gLeaderTimer = useState<ReturnType<typeof setTimeout> | null>(null);

  const clearGLeader = useCallback(() => {
    setGLeader(false);
    if (gLeaderTimer[0]) clearTimeout(gLeaderTimer[0]);
  }, [gLeaderTimer]);

  const openPalette = useCallback(() => {
    clearGLeader();
    setPaletteOpen(true);
  }, [clearGLeader]);

  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeHelp    = useCallback(() => setHelpOpen(false), []);

  useEffect(() => {
    const isEditing = () => {
      const el = document.activeElement;
      if (!el) return false;
      return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        (el as HTMLElement).isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K — always active
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      // Everything else: skip when typing in a field
      if (isEditing()) return;

      // Escape: close overlays
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setHelpOpen(false);
        clearGLeader();
        return;
      }

      // "?" — help overlay
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        clearGLeader();
        return;
      }

      // "/" — focus the first search input on the page
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        clearGLeader();
        const searchEl = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[placeholder*="Search"], input[placeholder*="search"], input[data-search]'
        );
        searchEl?.focus();
        return;
      }

      // "G" leader for goto shortcuts
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setGLeader(true);
        // Auto-cancel after 1.5s
        const t = setTimeout(() => setGLeader(false), 1500);
        gLeaderTimer[0] = t;
        return;
      }

      // G + letter combo
      if (gLeader) {
        const route = GOTO_MAP[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          router.push(ROUTE_MAP[route]);
        }
        clearGLeader();
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router, gLeader, clearGLeader, gLeaderTimer]);

  return { paletteOpen, closePalette, helpOpen, closeHelp, openPalette };
}
