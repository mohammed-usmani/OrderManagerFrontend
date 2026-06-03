"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** Sticky page header. Title on the left, quick-actions on the right. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="sticky top-16 md:top-0 z-30 bg-paper-raised/90 backdrop-blur border-b border-line">
      {/* hairline ember accent — ties the back-office to the front-of-house */}
      <div className="h-0.5 bg-gradient-to-r from-primary via-secondary/60 to-transparent" />
      <div className="flex items-center justify-between gap-4 px-4 md:px-8 py-3 max-w-[1600px] mx-auto">
        <div className="min-w-0">
          <h1 className="font-headline font-semibold text-ink text-xl leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-ink-soft text-xs mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
