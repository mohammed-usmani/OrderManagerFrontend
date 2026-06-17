"use client";

import { useEffect, type RefObject } from "react";

/**
 * Trap focus inside an open overlay and restore it to the previously-focused
 * element on close. Shared by Modal, CommandPalette, and ShortcutsHelp so all
 * dialogs behave consistently and keyboard focus can't escape behind the
 * backdrop. The focusable query skips disabled / hidden / zero-size nodes.
 */
export function useFocusTrap(
  open: boolean,
  ref: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (el) => !el.hasAttribute("hidden") && el.offsetWidth > 0 && el.offsetHeight > 0
      );

    // Pull focus into the dialog if it isn't already there.
    if (!root.contains(document.activeElement)) {
      getFocusable()[0]?.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, ref]);
}
