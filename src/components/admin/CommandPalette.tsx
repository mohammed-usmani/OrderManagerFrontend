"use client";

/**
 * Admin Command Palette — Cmd+K / Ctrl+K
 *
 * Fuzzy-search navigation across all admin pages and quick actions.
 * Arrow keys move the cursor, Enter navigates, Escape closes.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_ROUTES, shortcutFor } from "@/lib/adminRoutes";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: string;
  shortcut?: string;
  action: () => void;
  group: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);

  const nav = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose]
  );

  const COMMANDS: Command[] = [
    // Navigation — derived from the canonical admin route registry.
    ...ADMIN_ROUTES.map((r) => ({
      id: r.href,
      group: "Navigate",
      label: r.label,
      description: r.description,
      icon: r.icon,
      shortcut: shortcutFor(r),
      action: () => nav(r.href),
    })),
    // Quick actions
    { id: "view-kitchen",   group: "Quick Actions", label: "View kitchen queue", description: "Open the live order queue",     icon: "soup_kitchen",                action: () => nav("/admin/orders") },
    { id: "public-home",    group: "Quick Actions", label: "Public site",        description: "Open customer-facing homepage", icon: "open_in_new",                 action: () => nav("/") },
    { id: "profile",        group: "Quick Actions", label: "My profile",         description: "Account settings",              icon: "person",                      action: () => nav("/profile") },
  ];

  // Fuzzy filter
  const filtered = query.trim()
    ? COMMANDS.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.label.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q) ||
          c.group.toLowerCase().includes(q)
        );
      })
    : COMMANDS;

  // Group results
  const groups = filtered.reduce<Record<string, Command[]>>((acc, cmd) => {
    acc[cmd.group] = acc[cmd.group] ? [...acc[cmd.group], cmd] : [cmd];
    return acc;
  }, {});

  // Reset cursor when results change
  useEffect(() => { setCursor(0); }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (c + 1) % Math.max(1, filtered.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[cursor]?.action();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, cursor, onClose]
  );

  if (!open) return null;

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-xl rounded-2xl border border-line bg-paper-raised shadow-2xl overflow-hidden animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <span className="material-symbols-outlined text-ink-faint text-[20px] shrink-0">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages or actions..."
            className="flex-1 bg-transparent text-ink text-sm placeholder:text-ink-faint outline-none"
            aria-label="Command search"
          />
          <kbd>Esc</kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto overscroll-contain py-1.5"
          role="listbox"
        >
          {Object.entries(groups).length === 0 ? (
            <div className="py-10 text-center text-ink-faint text-sm">No results for &ldquo;{query}&rdquo;</div>
          ) : (
            Object.entries(groups).map(([group, cmds]) => (
              <div key={group}>
                <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-faint">
                  {group}
                </p>
                {cmds.map((cmd) => {
                  const idx = globalIdx++;
                  const isActive = idx === cursor;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={idx}
                      role="option"
                      aria-selected={isActive}
                      onClick={cmd.action}
                      onPointerMove={() => setCursor(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-primary/8 text-ink" : "text-ink-soft hover:bg-paper-sunken"}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-primary/10" : "bg-paper-sunken"}`}>
                        <span
                          className={`material-symbols-outlined text-[18px] ${isActive ? "text-primary" : "text-ink-faint"}`}
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          {cmd.icon}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isActive ? "text-ink" : "text-ink-soft"}`}>{cmd.label}</p>
                        {cmd.description && (
                          <p className="text-[11px] text-ink-faint truncate">{cmd.description}</p>
                        )}
                      </div>
                      {cmd.shortcut && <kbd>{cmd.shortcut}</kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-line bg-paper-sunken/50 text-[11px] text-ink-faint">
          <span className="flex items-center gap-1"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd>↵</kbd> open</span>
          <span className="flex items-center gap-1"><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
