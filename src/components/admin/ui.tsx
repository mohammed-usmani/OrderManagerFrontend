"use client";

/**
 * Admin UI primitives. Compact, neutral palette, Shopify/Notion-ish.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary hover:brightness-105 shadow-sm shadow-primary/30 disabled:bg-line-strong disabled:text-ink-faint disabled:shadow-none",
  secondary:
    "bg-paper-raised text-ink border border-line-strong hover:bg-paper-sunken disabled:text-ink-faint",
  ghost:
    "bg-transparent text-ink-soft hover:bg-paper-sunken disabled:text-ink-faint",
  danger:
    "bg-[#c0392b] text-white hover:bg-[#a93226] disabled:bg-[#c0392b]/40",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
}) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 font-medium rounded-md transition-colors disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-zinc-900/10 ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...rest}
    >
      {icon && (
        <span
          className="material-symbols-outlined text-[16px] leading-none"
          style={{ fontVariationSettings: "'FILL' 0" }}
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

export function Input({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-9 px-3 rounded-md border border-line-strong bg-paper-raised text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ${className}`}
      {...rest}
    />
  );
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-9 pl-3 pr-8 rounded-md border border-line-strong bg-paper-raised text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

// --- Status chip ---------------------------------------------------------

const STATUS_CHIP: Record<string, string> = {
  cart: "bg-paper-sunken text-ink-soft border-line",
  confirmed: "bg-tertiary/15 text-[#8a5a00] border-tertiary/30",
  cooking: "bg-orange-100/70 text-orange-800 border-orange-300/60",
  served: "bg-emerald-100/70 text-emerald-800 border-emerald-300/60",
  ready: "bg-sky-100/70 text-sky-800 border-sky-300/60",
  delivered: "bg-indigo-100/70 text-indigo-800 border-indigo-300/60",
  awaiting_payment: "bg-amber-100/70 text-amber-800 border-amber-300/60",
  paid: "bg-emerald-100/70 text-emerald-800 border-emerald-300/60",
  cancelled: "bg-rose-100/70 text-rose-800 border-rose-300/60",
  available: "bg-emerald-100/70 text-emerald-800 border-emerald-300/60",
  disabled: "bg-paper-sunken text-ink-faint border-line",
};

export function StatusChip({ status }: { status: string }) {
  const cls = STATUS_CHIP[status] ?? STATUS_CHIP.cart;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// --- Card wrapper --------------------------------------------------------

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-line bg-paper-raised ${className}`}
    >
      {children}
    </div>
  );
}

// --- Toolbar (filter strip above tables) ---------------------------------

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 md:px-8 py-3 border-b border-line bg-paper-sunken/60 max-w-[1600px] mx-auto w-full">
      {children}
    </div>
  );
}

// --- Simple modal --------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2a2016]/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-line bg-paper-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h2 className="font-headline font-semibold text-ink text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-ink-soft hover:bg-paper-sunken hover:text-ink"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </header>
        <div className="px-5 py-4 space-y-3 text-sm text-ink-soft">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line bg-paper-sunken/50">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
