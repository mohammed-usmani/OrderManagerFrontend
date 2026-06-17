"use client";

/**
 * AdminKeyboardProvider
 *
 * Drop this anywhere inside the admin layout to activate:
 *  - Cmd+K / Ctrl+K command palette
 *  - G+letter goto shortcuts
 *  - "?" shortcut help overlay
 */

import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { useAdminKeyboard } from "@/hooks/useAdminKeyboard";
import { ADMIN_ROUTES } from "@/lib/adminRoutes";

/** Returns true once the component has mounted (safe for SSR). */
function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

/** Detect macOS so we show ⌘ on Mac and Ctrl on Windows/Linux.
 *  Returns null until known so callers can render a neutral glyph and avoid
 *  the Ctrl→⌘ flip on first paint. */
function useIsMac(): boolean | null {
  const mounted = useIsMounted();
  if (!mounted) return null;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform ?? navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function AdminKeyboardProvider({ children }: { children?: ReactNode }) {
  const { paletteOpen, closePalette, helpOpen, closeHelp, openPalette, gLeader } = useAdminKeyboard();
  const isMac = useIsMac();
  // Neutral glyph until platform is known (avoids Ctrl→⌘ flicker on Mac).
  const modKey = isMac === null ? "⌘" : isMac ? "⌘" : "Ctrl";

  return (
    <>
      {children}
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <ShortcutsHelp open={helpOpen} onClose={closeHelp} isMac={isMac ?? false} />

      {/* Transient "Go to…" pill while the G-leader chord is armed */}
      {gLeader && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 px-3 py-2 rounded-xl bg-ink text-paper shadow-2xl text-xs font-medium animate-fade-in pointer-events-none">
          <span className="opacity-70">Go to…</span>
          {ADMIN_ROUTES.map((r) => (
            <span key={r.href} className="flex items-center gap-1">
              <kbd className="kbd-dark">{r.goKey.toUpperCase()}</kbd>
              <span className="opacity-60 hidden sm:inline">{r.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* Floating quick-search hint — visible on desktop admin pages */}
      <button
        onClick={openPalette}
        className="hidden md:flex fixed bottom-6 right-6 items-center gap-2 pl-3 pr-2 py-2 rounded-xl bg-paper-raised border border-line shadow-lg text-ink-soft text-xs font-medium hover:border-primary/30 hover:text-ink transition-all z-40 group"
        aria-label="Open command palette"
      >
        <span className="material-symbols-outlined text-[15px] group-hover:text-primary transition-colors">search</span>
        <span className="hidden lg:inline">Quick search</span>
        <kbd>{modKey}K</kbd>
      </button>
    </>
  );
}
