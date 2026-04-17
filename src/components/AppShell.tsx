"use client";

import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

interface AppShellProps {
  children: React.ReactNode;
  /** Page title shown in the mobile header */
  title?: string;
}

/**
 * Shared layout for authenticated pages.
 * - Desktop (md+): sidebar on the left, content fills remaining space, no bottom nav
 * - Mobile: top header + bottom nav
 */
export function AppShell({ children, title }: AppShellProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile header - hidden on desktop where sidebar has the brand */}
      <header className="md:hidden flex justify-between items-center px-5 py-4 w-full fixed top-0 z-50 bg-black/40 backdrop-blur-2xl border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-2xl">
            restaurant
          </span>
          <h1 className="font-headline tracking-tight font-extrabold text-xl text-white">
            {title || "Saffron & Smoke"}
          </h1>
        </div>
      </header>

      {/* Main content area - offset for sidebar on desktop, header on mobile */}
      <div className="md:ml-64 min-h-dvh flex flex-col">
        {children}
      </div>

      {/* Mobile bottom nav - hidden on desktop */}
      <BottomNav />
    </>
  );
}
