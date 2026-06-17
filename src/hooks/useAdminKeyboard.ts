"use client";

/**
 * useAdminKeyboard — global keyboard shortcut system for the admin panel.
 *
 * Shortcuts:
 *   Cmd+K / Ctrl+K  → open command palette (closing help if open)
 *   ?               → open help overlay (closing palette if open)
 *   Escape          → close whichever overlay is open
 *   G then D/K/F/M/A/C/T/P/R → navigate to the matching admin route
 *   /               → focus page search input (if present)
 *
 * Fixes applied:
 *   - gLeader and timer are stored in refs, not state, so the listener
 *     registers exactly once and never re-subscribes on every keypress.
 *   - Overlays are modelled as one activeOverlay union so Cmd+K and ?
 *     cannot leave two full-screen overlays open simultaneously.
 *   - Single-key shortcuts bail out when any [role=dialog] is open,
 *     preventing them from firing inside modals.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Overlay = "palette" | "help" | null;

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
  const [overlay, setOverlay] = useState<Overlay>(null);

  // Use refs for transient gesture state so the listener never re-registers.
  const gLeaderRef  = useRef(false);
  const gTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGLeader = useCallback(() => {
    gLeaderRef.current = false;
    if (gTimerRef.current) {
      clearTimeout(gTimerRef.current);
      gTimerRef.current = null;
    }
  }, []);

  // Expose stable helpers so consumers can open/close without re-renders.
  const openPalette  = useCallback(() => { clearGLeader(); setOverlay("palette"); }, [clearGLeader]);
  const closePalette = useCallback(() => setOverlay((v) => (v === "palette" ? null : v)), []);
  const closeHelp    = useCallback(() => setOverlay((v) => (v === "help"    ? null : v)), []);

  // router is stable across renders in Next 13+, safe to include once.
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

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

    const isInsideDialog = () =>
      !!document.activeElement?.closest('[role="dialog"]');

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K — always active, toggles palette and closes help.
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOverlay((v) => (v === "palette" ? null : "palette"));
        return;
      }

      // All other shortcuts: skip while typing in a field or inside a dialog.
      if (isEditing() || isInsideDialog()) return;

      // Escape: close the active overlay.
      if (e.key === "Escape") {
        setOverlay(null);
        clearGLeader();
        return;
      }

      // "?" — toggle help, closing palette if open.
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOverlay((v) => (v === "help" ? null : "help"));
        clearGLeader();
        return;
      }

      // "/" — focus the first search input on the page.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        clearGLeader();
        const searchEl = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[placeholder*="Search"], input[placeholder*="search"], input[data-search]'
        );
        searchEl?.focus();
        return;
      }

      // "G" leader for goto shortcuts.
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        gLeaderRef.current = true;
        if (gTimerRef.current) clearTimeout(gTimerRef.current);
        gTimerRef.current = setTimeout(() => { gLeaderRef.current = false; }, 1500);
        return;
      }

      // G + letter combo.
      if (gLeaderRef.current) {
        const route = GOTO_MAP[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          routerRef.current.push(ROUTE_MAP[route]);
        }
        clearGLeader();
        return;
      }
    };

    // Register once — no deps that change.
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clearGLeader]); // clearGLeader is stable (no-dep useCallback)

  return {
    paletteOpen: overlay === "palette",
    helpOpen:    overlay === "help",
    openPalette,
    closePalette,
    closeHelp,
    // Exposed for G-leader pill if needed.
    gLeaderRef,
  };
}
