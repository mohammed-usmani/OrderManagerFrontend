"use client";

/**
 * FloorCanvas — renders a floor's tables on a scaled plan.
 *
 * Positions are stored in a fixed *logical* coordinate space (the floor's
 * width×height); we render with percentage offsets so the plan scales to any
 * container without measuring. In `edit` mode tables are draggable (pointer
 * events → logical units, snapped + clamped); in `live` mode they're coloured
 * by status and clickable.
 */

import { useRef } from "react";

export interface CanvasTable {
  id: string;
  label: string;
  seats: number;
  shape: string; // round | square | rect
  pos_x: number;
  pos_y: number;
  zoneName: string;
  zoneColor: string; // tailwind-ish hex for edit mode
  status: string; // free | occupied | needs_bill | cleaning
  hasSession: boolean;
  sessionTotal?: number;
}

const SNAP = 10;

const STATUS_FILL: Record<string, string> = {
  free: "#e6ddcc",
  occupied: "#ff6a1a",
  needs_bill: "#f59e0b",
  cleaning: "#9c8a70",
};

function shapeBox(shape: string): { w: number; h: number; radius: string } {
  if (shape === "rect") return { w: 84, h: 48, radius: "10px" };
  if (shape === "square") return { w: 58, h: 58, radius: "10px" };
  return { w: 58, h: 58, radius: "9999px" }; // round
}

export function FloorCanvas({
  width,
  height,
  tables,
  mode,
  selectedId,
  onSelect,
  onMove,
  onTableClick,
}: {
  width: number;
  height: number;
  tables: CanvasTable[];
  mode: "live" | "edit";
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onTableClick?: (t: CanvasTable) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);

  const toLogical = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * width;
    const y = ((clientY - r.top) / r.height) * height;
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
    const snap = (v: number) => Math.round(v / SNAP) * SNAP;
    return { x: snap(clamp(x, width)), y: snap(clamp(y, height)) };
  };

  const onPointerDown = (e: React.PointerEvent, t: CanvasTable) => {
    if (mode !== "edit") return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragId.current = t.id;
    onSelect?.(t.id);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (mode !== "edit" || dragId.current === null) return;
    const p = toLogical(e.clientX, e.clientY);
    if (p) onMove?.(dragId.current, p.x, p.y);
  };
  const endDrag = (e: React.PointerEvent) => {
    if (dragId.current !== null) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      dragId.current = null;
    }
  };

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      className="relative w-full rounded-xl border border-line bg-paper-sunken/40 overflow-hidden select-none"
      style={{
        aspectRatio: `${width} / ${height}`,
        backgroundImage:
          "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)",
        backgroundSize: `${(SNAP * 4 / width) * 100}% ${(SNAP * 4 / height) * 100}%`,
        touchAction: mode === "edit" ? "none" : "auto",
      }}
    >
      {tables.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-ink-faint text-sm">
          No tables placed on this floor yet.
        </div>
      )}
      {tables.map((t) => {
        const box = shapeBox(t.shape);
        const fill = mode === "live" ? (STATUS_FILL[t.status] ?? STATUS_FILL.free) : t.zoneColor;
        const selected = selectedId === t.id;
        const clickable = mode === "edit" || (mode === "live" && t.hasSession);
        const dark = mode === "live" && (t.status === "occupied");
        return (
          <div
            key={t.id}
            onPointerDown={(e) => onPointerDown(e, t)}
            onClick={() => {
              if (mode === "edit") onSelect?.(t.id);
              else if (t.hasSession) onTableClick?.(t);
            }}
            title={`${t.zoneName} · Table ${t.label}${t.hasSession ? " · seated" : ""}`}
            className={`absolute flex flex-col items-center justify-center text-center shadow-sm transition-shadow ${
              clickable ? "cursor-pointer" : "cursor-default"
            } ${selected ? "ring-2 ring-primary ring-offset-1" : "ring-1 ring-black/10"} ${
              mode === "edit" ? "active:shadow-lg" : ""
            }`}
            style={{
              left: `${(t.pos_x / width) * 100}%`,
              top: `${(t.pos_y / height) * 100}%`,
              width: box.w,
              height: box.h,
              borderRadius: box.radius,
              background: fill,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span className={`text-xs font-bold leading-none ${dark ? "text-white" : "text-ink"}`}>
              {t.label}
            </span>
            <span className={`text-[9px] leading-none mt-0.5 ${dark ? "text-white/80" : "text-ink-soft"}`}>
              {t.seats}p
            </span>
            {mode === "live" && t.hasSession && t.sessionTotal != null && (
              <span className="text-[8px] leading-none mt-0.5 text-white/90 font-semibold tabular-nums">
                ₹{Math.round(t.sessionTotal)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
