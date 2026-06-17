"use client";

/**
 * Admin content wrapper.
 *
 * Sits inside the app's <AppShell> (which owns the dark sidebar + mobile
 * bottom nav). The admin content area switches to a **light theme** with
 * dense typography — signalling a back-office context distinct from the
 * customer-facing dark UI.
 */

import type { ReactNode } from "react";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-paper text-ink">
      {/* Content column — sized to leave room for the dark sidebar on desktop.
          pt-16 on mobile clears the fixed AppShell mobile header. */}
      <div className="min-h-dvh flex flex-col pt-[var(--app-mobile-header-h)] md:pt-0">
        {children}
      </div>
    </div>
  );
}
