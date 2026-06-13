"use client";

/**
 * AdminKeyboardProvider
 *
 * Drop this anywhere inside the admin layout to activate:
 *  - Cmd+K command palette
 *  - G+letter goto shortcuts
 *  - "?" shortcut help overlay
 */

import type { ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { useAdminKeyboard } from "@/hooks/useAdminKeyboard";

export function AdminKeyboardProvider({ children }: { children?: ReactNode }) {
  const { paletteOpen, closePalette, helpOpen, closeHelp, openPalette } = useAdminKeyboard();

  return (
    <>
      {children}
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <ShortcutsHelp open={helpOpen} onClose={closeHelp} />

      {/* Floating ⌘K hint button — visible on desktop admin pages */}
      <button
        onClick={openPalette}
        className="hidden md:flex fixed bottom-6 right-6 items-center gap-2 pl-3 pr-2 py-2 rounded-xl bg-paper-raised border border-line shadow-lg text-ink-soft text-xs font-medium hover:border-primary/30 hover:text-ink transition-all z-40 group"
        aria-label="Open command palette"
      >
        <span className="material-symbols-outlined text-[15px] group-hover:text-primary transition-colors">search</span>
        <span className="hidden lg:inline">Quick search</span>
        <kbd>⌘K</kbd>
      </button>
    </>
  );
}
