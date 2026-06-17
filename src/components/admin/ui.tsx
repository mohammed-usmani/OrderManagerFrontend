"use client";

/**
 * Admin UI primitives — warm paper palette, brand-matched focus rings,
 * dot-status chips, animated modals with focus trap, and card sub-sections.
 */

import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  forwardRef,
  useEffect,
  useRef,
} from "react";

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "xs" | "sm" | "md";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary hover:brightness-105 shadow-sm shadow-primary/25 active:brightness-95 disabled:bg-line-strong disabled:text-ink-faint disabled:shadow-none",
  secondary:
    "bg-paper-raised text-ink border border-line-strong hover:bg-paper-sunken active:scale-[0.98] disabled:text-ink-faint",
  ghost:
    "bg-transparent text-ink-soft hover:bg-paper-sunken hover:text-ink active:scale-[0.98] disabled:text-ink-faint",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 active:brightness-95 shadow-sm shadow-rose-600/20 disabled:bg-rose-400",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-[11px] gap-1",
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
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
      className={`inline-flex items-center font-medium rounded-lg transition-all duration-150 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-paper ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...rest}
    >
      {icon && (
        <span
          className="material-symbols-outlined leading-none"
          style={{ fontSize: size === "md" ? "17px" : "15px", fontVariationSettings: "'FILL' 0, 'wght' 400" }}
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

// ─── Input ───────────────────────────────────────────────────────────────────

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { leadingIcon?: string }
>(function Input({ className = "", leadingIcon, ...rest }, ref) {
  if (leadingIcon) {
    return (
      <div className="relative flex items-center">
        <span className="material-symbols-outlined text-ink-faint text-[17px] absolute left-2.5 pointer-events-none select-none">
          {leadingIcon}
        </span>
        <input
          ref={ref}
          className={`h-9 pl-8 pr-3 rounded-lg border border-line-strong bg-paper-raised text-sm text-ink placeholder:text-ink-faint/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all ${className}`}
          {...rest}
        />
      </div>
    );
  }
  return (
    <input
      ref={ref}
      className={`h-9 px-3 rounded-lg border border-line-strong bg-paper-raised text-sm text-ink placeholder:text-ink-faint/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all ${className}`}
      {...rest}
    />
  );
});

// ─── Select ──────────────────────────────────────────────────────────────────

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-9 pl-3 pr-8 rounded-lg border border-line-strong bg-paper-raised text-sm text-ink appearance-none bg-[url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%239c8a70'><path d='M4 6l4 4 4-4'/></svg>")] bg-no-repeat bg-[right_0.5rem_center] bg-[length:16px_16px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

// ─── Status chip ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label?: string }> = {
  cart:             { bg: "bg-paper-sunken",        text: "text-ink-soft",        dot: "bg-ink-faint" },
  confirmed:        { bg: "bg-amber-50",             text: "text-amber-700",        dot: "bg-amber-400",    label: "Confirmed" },
  cooking:          { bg: "bg-orange-50",            text: "text-orange-700",       dot: "bg-orange-500" },
  ready:            { bg: "bg-sky-50",               text: "text-sky-700",          dot: "bg-sky-500" },
  served:           { bg: "bg-emerald-50",           text: "text-emerald-700",      dot: "bg-emerald-500" },
  delivered:        { bg: "bg-violet-50",            text: "text-violet-700",       dot: "bg-violet-500" },
  awaiting_payment: { bg: "bg-amber-50",             text: "text-amber-700",        dot: "bg-amber-400",    label: "Awaiting Payment" },
  paid:             { bg: "bg-emerald-50",           text: "text-emerald-700",      dot: "bg-emerald-500",  label: "Paid" },
  cancelled:        { bg: "bg-rose-50",              text: "text-rose-700",         dot: "bg-rose-400" },
  available:        { bg: "bg-emerald-50",           text: "text-emerald-700",      dot: "bg-emerald-500" },
  occupied:         { bg: "bg-orange-50",            text: "text-orange-700",       dot: "bg-orange-500" },
  reserved:         { bg: "bg-sky-50",               text: "text-sky-700",          dot: "bg-sky-400" },
  disabled:         { bg: "bg-paper-sunken",         text: "text-ink-faint",        dot: "bg-ink-faint" },
  active:           { bg: "bg-emerald-50",           text: "text-emerald-700",      dot: "bg-emerald-500" },
  inactive:         { bg: "bg-paper-sunken",         text: "text-ink-faint",        dot: "bg-ink-faint" },
};

const UNKNOWN_STATUS_CONFIG = {
  bg: "bg-paper-sunken",
  text: "text-ink-faint",
  dot: "border border-ink-faint/60 bg-transparent",
};

export function StatusChip({ status }: { status: string }) {
  const known = status in STATUS_CONFIG;
  if (!known && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.warn(`[StatusChip] unmapped status: "${status}"`);
  }
  const cfg = known ? STATUS_CONFIG[status] : UNKNOWN_STATUS_CONFIG;
  const display = (known ? STATUS_CONFIG[status].label : undefined) ?? status.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {display}
    </span>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-paper-raised shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-5 py-3.5 border-b border-line ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-5 py-4 ${className}`}>
      {children}
    </div>
  );
}

// ─── Toolbar (filter strip above tables) ─────────────────────────────────────

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 md:px-8 py-2.5 border-b border-line bg-paper-sunken/50 max-w-[1600px] mx-auto w-full">
      {children}
    </div>
  );
}

// ─── Pager (client-side pagination footer) ───────────────────────────────────

/** Renders nothing when everything fits on one page, so it's safe to drop into
 *  any list — it only appears once rows exceed the page size. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-xs text-ink-soft">
      <span className="tabular-nums">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" icon="chevron_left" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </Button>
        <span className="px-1.5 tabular-nums">
          {page} / {pageCount}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ─── Metric card (dashboard KPI) ─────────────────────────────────────────────

export function MetricCard({
  label,
  value,
  icon,
  trend,
  trendLabel,
  accent = "default",
}: {
  label: string;
  value: string | number;
  icon?: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  accent?: "default" | "primary" | "success" | "warning" | "danger";
}) {
  const ACCENT = {
    default: { bg: "bg-paper-raised",   icon: "bg-paper-sunken text-ink-soft",    border: "border-line" },
    primary: { bg: "bg-primary/5",      icon: "bg-primary/10 text-primary",        border: "border-primary/15" },
    success: { bg: "bg-emerald-50",     icon: "bg-emerald-100 text-emerald-700",   border: "border-emerald-200/60" },
    warning: { bg: "bg-amber-50",       icon: "bg-amber-100 text-amber-700",       border: "border-amber-200/60" },
    danger:  { bg: "bg-rose-50",        icon: "bg-rose-100 text-rose-700",         border: "border-rose-200/60" },
  };
  const a = ACCENT[accent];
  const trendColors = { up: "text-emerald-600", down: "text-rose-600", neutral: "text-ink-faint" };
  const trendIcons  = { up: "arrow_upward", down: "arrow_downward", neutral: "remove" };

  return (
    <div className={`rounded-xl border ${a.border} ${a.bg} px-5 py-4 flex items-start justify-between gap-4`}>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-1">{label}</p>
        <p className="font-headline font-bold text-2xl text-ink leading-none tabular-nums">{value}</p>
        {trendLabel && trend && (
          <p className={`flex items-center gap-0.5 text-[11px] font-medium mt-1.5 ${trendColors[trend]}`}>
            <span className="material-symbols-outlined text-[13px]">{trendIcons[trend]}</span>
            {trendLabel}
          </p>
        )}
      </div>
      {icon && (
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${a.icon}`}>
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {icon}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape key + body scroll lock + focus restore
  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    if (!el) return;

    // Save the element that had focus before the modal opened so we can
    // restore it on close (prevents focus from vanishing to <body>).
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Lock background scroll while any modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Only include focusable nodes that are visible and not disabled.
    const getFocusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href]:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => {
        if ((node as HTMLInputElement).disabled) return false;
        if (node.hidden) return false;
        // Skip zero-size nodes (aria-hidden siblings etc.)
        const rect = node.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0;
      });

    // Focus first focusable element in the modal.
    const focusableNow = getFocusable();
    (focusableNow[0] ?? el).focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key === "Tab") {
        const nodes = getFocusable();
        const first = nodes[0];
        const last  = nodes[nodes.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === el) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      // Restore focus to the element that opened the modal.
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        ref={dialogRef}
        className={`relative w-full ${sizeClass} rounded-2xl border border-line bg-paper-raised shadow-2xl animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 id="modal-title" className="font-headline font-semibold text-ink text-lg leading-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-soft hover:bg-paper-sunken hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </header>
        <div className="px-5 py-4 space-y-4 text-sm text-ink-soft overflow-y-auto max-h-[70vh]">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line bg-paper-sunken/40 rounded-b-2xl">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-paper-sunken flex items-center justify-center mb-1">
        <span className="material-symbols-outlined text-ink-faint text-[28px]">{icon}</span>
      </div>
      <p className="font-semibold text-ink text-base">{title}</p>
      {description && <p className="text-ink-faint text-sm max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
