"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Extra small badge shown next to the title (e.g. live count) */
  badge?: string | number;
}

/** Sticky admin page header with ember accent hairline and action slot. */
export function PageHeader({ title, subtitle, actions, badge }: PageHeaderProps) {
  return (
    <header className="sticky top-[var(--app-mobile-header-h)] md:top-0 z-30 bg-paper/95 backdrop-blur-md border-b border-line">
      {/* Ember accent hairline — ties back-office to front-of-house brand */}
      <div className="h-px bg-gradient-to-r from-primary/70 via-secondary/40 to-transparent" />
      <div className="flex items-center justify-between gap-4 px-4 md:px-8 py-3.5 max-w-[1600px] mx-auto">
        <div className="min-w-0 flex items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="font-headline font-semibold text-ink text-[1.1rem] leading-tight text-balance">
                {title}
              </h1>
              {badge !== undefined && (
                <span
                  className="inline-flex items-center h-5 px-2 rounded-full bg-primary/10 text-primary text-[11px] font-bold font-mono tabular-nums border border-primary/20"
                  aria-label={`${badge} ${title}`}
                  title={`${badge} ${title}`}
                >
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-ink-faint text-xs mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
