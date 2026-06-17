"use client";

/** Keyboard shortcut reference overlay — toggled with "?" */

import { useRef } from "react";
import { ADMIN_ROUTES, shortcutFor } from "@/lib/adminRoutes";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  isMac?: boolean;
}

function buildGroups(isMac: boolean) {
  const mod = isMac ? "⌘" : "Ctrl";
  return [
    {
      group: "Navigation",
      // Derived from the canonical admin route registry so it can't drift.
      shortcuts: ADMIN_ROUTES.map((r) => ({
        keys: shortcutFor(r).split(" "),
        label: `Go to ${r.label}`,
      })),
    },
    {
      group: "Global",
      shortcuts: [
        { keys: [mod, "K"], label: "Open command palette" },
        { keys: ["/"],      label: "Focus search" },
        { keys: ["?"],      label: "Show this help" },
        { keys: ["Esc"],    label: "Close / cancel" },
      ],
    },
  ];
}

export function ShortcutsHelp({ open, onClose, isMac = false }: ShortcutsHelpProps) {
  const SHORTCUT_GROUPS = buildGroups(isMac);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="relative w-full max-w-md rounded-2xl border border-line bg-paper-raised shadow-2xl overflow-hidden animate-slide-up"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h2 className="font-headline font-semibold text-ink text-base">Keyboard Shortcuts</h2>
            <p className="text-xs text-ink-faint mt-0.5">Press <kbd>?</kbd> to toggle this panel</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-soft hover:bg-paper-sunken hover:text-ink transition-colors"
            aria-label="Close shortcuts help"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </header>
        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {SHORTCUT_GROUPS.map(({ group, shortcuts }) => (
            <div key={group}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-2">{group}</p>
              <div className="space-y-2">
                {shortcuts.map(({ keys, label }) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-ink-soft">{label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {keys.map((k) => <kbd key={k}>{k}</kbd>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <footer className="px-5 py-3 border-t border-line bg-paper-sunken/40 text-[11px] text-ink-faint">
          Shortcuts are inactive when a text field is focused.
        </footer>
      </div>
    </div>
  );
}
