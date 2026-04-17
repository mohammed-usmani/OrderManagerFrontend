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
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-zinc-200">
      <div className="flex items-center justify-between gap-4 px-4 md:px-8 py-3 max-w-[1600px] mx-auto">
        <div className="min-w-0">
          <h1 className="font-headline font-extrabold text-zinc-900 text-lg leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-zinc-500 text-xs mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
