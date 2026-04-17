"use client";

/**
 * Admin UI primitives. Compact, neutral palette, Shopify/Notion-ish.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500",
  secondary:
    "bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-50 disabled:text-zinc-400",
  ghost:
    "bg-transparent text-zinc-700 hover:bg-zinc-100 disabled:text-zinc-400",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300",
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
      className={`h-9 px-3 rounded-md border border-zinc-300 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 ${className}`}
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
      className={`h-9 pl-3 pr-8 rounded-md border border-zinc-300 bg-white text-sm text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

// --- Status chip ---------------------------------------------------------

const STATUS_CHIP: Record<string, string> = {
  cart: "bg-zinc-100 text-zinc-700 border-zinc-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  awaiting_payment: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  disabled: "bg-zinc-100 text-zinc-500 border-zinc-200",
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
      className={`rounded-lg border border-zinc-200 bg-white ${className}`}
    >
      {children}
    </div>
  );
}

// --- Toolbar (filter strip above tables) ---------------------------------

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 md:px-8 py-3 border-b border-zinc-200 bg-zinc-50 max-w-[1600px] mx-auto w-full">
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-200">
          <h2 className="font-headline font-bold text-zinc-900 text-base">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </header>
        <div className="px-5 py-4 space-y-3 text-sm text-zinc-700">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-200 bg-zinc-50">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
