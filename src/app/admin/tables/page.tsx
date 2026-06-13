"use client";

/**
 * /admin/tables — Interactive Floor Plan Builder
 *
 * Canvas coordinate system: 1000 × 640 logical units.
 * Zone rectangles: pos_x/pos_y = top-left, width/height = size.
 * Table chips:     pos_x/pos_y = centre point.
 *
 * Interactions:
 *  - Drag zone header   → move zone, bulk-save on mouseup (debounced)
 *  - Drag zone corner   → resize zone, bulk-save on mouseup
 *  - Drag table chip    → move table, auto-assigns zone if centre lands inside one
 *  - Click table chip   → open edit popover
 *  - Double-click zone  → rename inline
 *  - Toolbar: Add zone, Add table (to focused zone), Zoom ±, Fit all
 *  - Keyboard: N = add table, Z = add zone, Del/Backspace = delete focused table
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type ZoneAPI,
  type ZoneWriteAPI,
  type TableAPI,
  type TableWriteAPI,
  type ZonePositionBulkAPI,
  type TablePositionBulkAPI,
} from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Input, Modal, Select } from "@/components/admin/ui";
import { AdminKeyboardProvider } from "@/components/admin/AdminKeyboardProvider";

// ─── Canvas constants ───────────────────────────────────────────────────────

const CANVAS_W = 1000;
const CANVAS_H = 640;

/** Default geometry when creating a zone without explicit coords */
const ZONE_DEFAULT_W = 280;
const ZONE_DEFAULT_H = 200;

/** Table chip dimensions in logical units */
const TABLE_W = 72;
const TABLE_H = 52;
const TABLE_R = 36; // radius for round tables

/** Minimum zone size */
const ZONE_MIN_W = 120;
const ZONE_MIN_H = 100;

/** How long (ms) after the last pointer-up before we fire the bulk save */
const SAVE_DEBOUNCE_MS = 600;

// ─── Zone colour palette (warm brand) ───────────────────────────────────────

const ZONE_COLORS = [
  { bg: "rgba(255,106,26,0.08)",  border: "rgba(255,106,26,0.35)",  header: "rgba(255,106,26,0.18)", dot: "#ff6a1a" },
  { bg: "rgba(201,162,39,0.08)",  border: "rgba(201,162,39,0.40)",  header: "rgba(201,162,39,0.18)", dot: "#c9a227" },
  { bg: "rgba(244,163,0,0.07)",   border: "rgba(244,163,0,0.35)",   header: "rgba(244,163,0,0.18)",  dot: "#f4a300" },
  { bg: "rgba(56,186,136,0.07)",  border: "rgba(56,186,136,0.35)",  header: "rgba(56,186,136,0.18)", dot: "#38ba88" },
  { bg: "rgba(99,153,220,0.07)",  border: "rgba(99,153,220,0.35)",  header: "rgba(99,153,220,0.18)", dot: "#6399dc" },
  { bg: "rgba(192,100,200,0.07)", border: "rgba(192,100,200,0.35)", header: "rgba(192,100,200,0.18)",dot: "#c064c8" },
];

function zoneColor(idx: number) {
  return ZONE_COLORS[idx % ZONE_COLORS.length];
}

// ─── QR helper ───────────────────────────────────────────────────────────────

function qrUrl(token: string, size = 260): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const target = `${origin}/t/${token}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(target)}`;
}

// ─── Local state types ────────────────────────────────────────────────────────

interface ZoneRect {
  id: string;
  x: number; // pos_x
  y: number; // pos_y
  w: number; // width
  h: number; // height
}

interface TablePos {
  id: string;
  x: number; // pos_x (centre)
  y: number; // pos_y (centre)
  zoneId: string;
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Which zone rect (if any) contains the point (cx, cy)? */
function zoneContaining(cx: number, cy: number, rects: ZoneRect[]): ZoneRect | null {
  // Iterate in reverse so later-drawn (higher index) zones take priority.
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return r;
  }
  return null;
}

/** Place a new zone without overlapping existing ones too much */
function nextZonePos(existing: ZoneRect[]): { x: number; y: number } {
  const offset = existing.length * 30;
  return {
    x: clamp(40 + offset, 20, CANVAS_W - ZONE_DEFAULT_W - 20),
    y: clamp(40 + offset, 20, CANVAS_H - ZONE_DEFAULT_H - 20),
  };
}

/** Auto-position a new table inside a zone, avoiding existing tables */
function nextTablePos(zone: ZoneRect, existingTables: TablePos[]): { x: number; y: number } {
  const padding = 14;
  const cols = Math.floor((zone.w - padding * 2) / (TABLE_W + 10));
  const count = existingTables.filter((t) => t.zoneId === zone.id).length;
  const col = count % Math.max(1, cols);
  const row = Math.floor(count / Math.max(1, cols));
  return {
    x: clamp(zone.x + padding + col * (TABLE_W + 10) + TABLE_W / 2, zone.x + TABLE_W / 2, zone.x + zone.w - TABLE_W / 2),
    y: clamp(zone.y + 36 + padding + row * (TABLE_H + 10) + TABLE_H / 2, zone.y + 36 + TABLE_H / 2, zone.y + zone.h - TABLE_H / 2),
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminTablesPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [zones, setZones] = useState<ZoneAPI[]>([]);
  const [tables, setTables] = useState<TableAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Canvas derived state (mutable rects tracked separately for drag perf)
  const [zoneRects, setZoneRects] = useState<ZoneRect[]>([]);
  const [tablePositions, setTablePositions] = useState<TablePos[]>([]);

  // UI state
  const [scale, setScale] = useState(1);
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null);
  const [focusedTableId, setFocusedTableId] = useState<string | null>(null);
  const [tablePopover, setTablePopover] = useState<string | null>(null); // table id
  const [renamingZoneId, setRenamingZoneId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Modals
  const [zoneModal, setZoneModal] = useState<"new" | ZoneAPI | null>(null);
  const [tableModal, setTableModal] = useState<TableAPI | { zone_id: string } | null>(null);
  const [qrTable, setQrTable] = useState<TableAPI | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "zone" | "table"; id: string; name: string } | null>(null);

  // Drag state (ref, not state — avoids re-renders during drag)
  const dragRef = useRef<{
    kind: "zone-move" | "zone-resize" | "table";
    id: string;
    startClientX: number;
    startClientY: number;
    startVal: number[]; // [x,y] or [x,y,w,h]
    corner?: "se";
  } | null>(null);

  // Debounced save ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { router.replace("/auth/signin"); return; }
    if (user && !user.is_admin) router.replace("/chat");
  }, [isAuthenticated, user, router]);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [z, t] = await Promise.all([
        api.adminListZones(token),
        api.adminListTables(token),
      ]);
      setZones(z);
      setTables(t);
      setError("");

      // Initialise rects from API geometry; assign defaults for missing ones
      setZoneRects(z.map((zone, i) => {
        const pos = nextZonePos(z.slice(0, i).map((prev, j) => ({
          id: prev.id, x: prev.pos_x ?? 40 + j * 30, y: prev.pos_y ?? 40 + j * 30,
          w: prev.width ?? ZONE_DEFAULT_W, h: prev.height ?? ZONE_DEFAULT_H,
        })));
        return {
          id: zone.id,
          x: zone.pos_x ?? pos.x,
          y: zone.pos_y ?? pos.y,
          w: zone.width  ?? ZONE_DEFAULT_W,
          h: zone.height ?? ZONE_DEFAULT_H,
        };
      }));

      setTablePositions(t.map((table) => ({
        id: table.id,
        x: table.pos_x ?? 100,
        y: table.pos_y ?? 100,
        zoneId: table.zone_id,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // ── Fit canvas to viewport width ──────────────────────────────────────────

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function fit() {
      if (!canvasWrapRef.current) return;
      const available = canvasWrapRef.current.clientWidth;
      setScale(Math.min(1, available / CANVAS_W));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // ── Debounced bulk saves ───────────────────────────────────────────────────

  const scheduleSave = useCallback((updatedRects?: ZoneRect[], updatedPositions?: TablePos[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const rectsToSave = updatedRects ?? zoneRects;
    const posToSave   = updatedPositions ?? tablePositions;
    saveTimer.current = setTimeout(async () => {
      if (!token) return;
      try {
        await Promise.all([
          api.adminBulkUpdateZonePositions(token, {
            zones: rectsToSave.map((r) => ({ zone_id: r.id, pos_x: r.x, pos_y: r.y, width: r.w, height: r.h })),
          }),
          api.adminBulkUpdateTablePositions(token, {
            tables: posToSave.map((p) => ({ table_id: p.id, pos_x: p.x, pos_y: p.y, zone_id: p.zoneId })),
          }),
        ]);
      } catch {
        // silent — positions are cosmetic, don't block the UI
      }
    }, SAVE_DEBOUNCE_MS);
  }, [token, zoneRects, tablePositions]);

  // ── Pointer drag handlers ─────────────────────────────────────────────────

  const onCanvasPointerDown = useCallback((
    e: ReactPointerEvent<Element>,
    kind: "zone-move" | "zone-resize" | "table",
    id: string,
    startVal: number[],
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { kind, id, startClientX: e.clientX, startClientY: e.clientY, startVal };
  }, []);

  const onCanvasPointerMove = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = (e.clientX - drag.startClientX) / scale;
    const dy = (e.clientY - drag.startClientY) / scale;

    if (drag.kind === "zone-move") {
      const [ox, oy] = drag.startVal;
      setZoneRects((prev) =>
        prev.map((r) =>
          r.id !== drag.id ? r : {
            ...r,
            x: clamp(ox + dx, 0, CANVAS_W - r.w),
            y: clamp(oy + dy, 0, CANVAS_H - r.h),
          },
        ),
      );
    } else if (drag.kind === "zone-resize") {
      const [ox, oy, ow, oh] = drag.startVal;
      setZoneRects((prev) =>
        prev.map((r) =>
          r.id !== drag.id ? r : {
            ...r,
            w: clamp(ow + dx, ZONE_MIN_W, CANVAS_W - ox),
            h: clamp(oh + dy, ZONE_MIN_H, CANVAS_H - oy),
          },
        ),
      );
    } else if (drag.kind === "table") {
      const [ox, oy] = drag.startVal;
      setTablePositions((prev) =>
        prev.map((p) =>
          p.id !== drag.id ? p : {
            ...p,
            x: clamp(ox + dx, TABLE_W / 2, CANVAS_W - TABLE_W / 2),
            y: clamp(oy + dy, TABLE_H / 2, CANVAS_H - TABLE_H / 2),
          },
        ),
      );
    }
  }, [scale]);

  const onCanvasPointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    if (drag.kind === "table") {
      // Auto-assign zone based on final centre position
      setTablePositions((prev) => {
        const updated = prev.map((p) => {
          if (p.id !== drag.id) return p;
          const hit = zoneContaining(p.x, p.y, zoneRects);
          return { ...p, zoneId: hit ? hit.id : p.zoneId };
        });
        scheduleSave(undefined, updated);
        return updated;
      });
    } else {
      scheduleSave();
    }
  }, [zoneRects, scheduleSave]);

  // ── Zone rename ────────────────────────────────────────────────────────────

  const beginRename = (zone: ZoneAPI) => {
    setRenamingZoneId(zone.id);
    setRenameValue(zone.name);
  };

  const commitRename = async () => {
    if (!token || !renamingZoneId || !renameValue.trim()) {
      setRenamingZoneId(null);
      return;
    }
    try {
      await api.adminUpdateZone(token, renamingZoneId, { name: renameValue.trim() });
      setZones((prev) => prev.map((z) => z.id === renamingZoneId ? { ...z, name: renameValue.trim() } : z));
    } catch {
      // silent
    }
    setRenamingZoneId(null);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!token || !deleteConfirm) return;
    try {
      if (deleteConfirm.type === "zone") {
        await api.adminDeleteZone(token, deleteConfirm.id);
      } else {
        await api.adminDeleteTable(token, deleteConfirm.id);
      }
      setDeleteConfirm(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleteConfirm(null);
    }
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "n" || e.key === "N") {
        const zoneId = focusedZoneId ?? zones[0]?.id;
        if (zoneId) setTableModal({ zone_id: zoneId });
      }
      if (e.key === "z" || e.key === "Z") setZoneModal("new");
      if ((e.key === "Delete" || e.key === "Backspace") && focusedTableId) {
        const t = tables.find((t) => t.id === focusedTableId);
        if (t) setDeleteConfirm({ type: "table", id: t.id, name: `Table ${t.label}` });
      }
      if (e.key === "Escape") {
        setFocusedTableId(null);
        setFocusedZoneId(null);
        setTablePopover(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zones, tables, focusedZoneId, focusedTableId]);

  // ── Fit scale to content ───────────────────────────────────────────────────

  const fitScale = () => {
    if (!canvasWrapRef.current) return;
    const available = canvasWrapRef.current.clientWidth;
    setScale(Math.min(1, available / CANVAS_W));
  };

  // ── Helpers to look things up ──────────────────────────────────────────────

  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? "Unknown";

  if (!isAuthenticated || !user?.is_admin) return null;

  return (
    <AppShell title="Tables & Floor Plan">
      <AdminShell>
        <AdminKeyboardProvider />
        <PageHeader
          title="Tables & Floor Plan"
          badge={`${zones.length}Z · ${tables.length}T`}
          subtitle="Drag zones and tables to arrange your restaurant floor"
          actions={
            <>
              <Button
                variant="ghost"
                icon="table_restaurant"
                onClick={() => router.push("/admin/floor")}
              >
                Live view
              </Button>
              <Button
                variant="secondary"
                icon="grid_view"
                onClick={() => setZoneModal("new")}
              >
                Add zone <kbd className="ml-1">Z</kbd>
              </Button>
              <Button
                variant="primary"
                icon="add"
                onClick={() => {
                  const zoneId = focusedZoneId ?? zones[0]?.id;
                  if (zoneId) setTableModal({ zone_id: zoneId });
                  else setZoneModal("new");
                }}
              >
                Add table <kbd className="ml-1">N</kbd>
              </Button>
            </>
          }
        />

        {error && (
          <div className="mx-4 md:mx-8 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {error}
          </div>
        )}

        {/* ── Two-column layout: Left panel + Canvas ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left panel — zone list */}
          <aside className="w-56 shrink-0 flex flex-col border-r border-line bg-paper-raised overflow-y-auto">
            <div className="px-3 pt-3 pb-2 border-b border-line">
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint">Zones</p>
            </div>

            {loading ? (
              <div className="p-3 space-y-2">
                {[1,2,3].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
              </div>
            ) : zones.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
                <span className="material-symbols-outlined text-[32px] text-ink-faint mb-2">grid_view</span>
                <p className="text-xs text-ink-faint">No zones yet.</p>
                <button
                  onClick={() => setZoneModal("new")}
                  className="mt-3 text-xs font-semibold text-primary hover:underline"
                >
                  + Add zone
                </button>
              </div>
            ) : (
              <ul className="flex-1 py-1">
                {zones.map((z, i) => {
                  const color = zoneColor(i);
                  const tableCount = tables.filter((t) => t.zone_id === z.id).length;
                  const isFocused = focusedZoneId === z.id;
                  return (
                    <li
                      key={z.id}
                      onClick={() => setFocusedZoneId(isFocused ? null : z.id)}
                      className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors text-sm ${
                        isFocused ? "bg-paper-sunken" : "hover:bg-paper-sunken/60"
                      }`}
                    >
                      {/* Accent dot matching canvas color */}
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: color.dot }}
                      />
                      <span className="flex-1 min-w-0 font-medium text-ink truncate">{z.name}</span>
                      {z.is_ac && (
                        <span className="material-symbols-outlined text-[13px] text-sky-500 shrink-0">ac_unit</span>
                      )}
                      <span className="text-[11px] text-ink-faint shrink-0">{tableCount}T</span>
                      {/* Actions — shown on hover */}
                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        <button
                          title="Edit zone"
                          onClick={(e) => { e.stopPropagation(); setZoneModal(z); }}
                          className="p-0.5 rounded text-ink-faint hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[14px]">edit</span>
                        </button>
                        <button
                          title="Add table to zone"
                          onClick={(e) => { e.stopPropagation(); setTableModal({ zone_id: z.id }); }}
                          className="p-0.5 rounded text-ink-faint hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                        </button>
                        <button
                          title="Delete zone"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ type: "zone", id: z.id, name: z.name });
                          }}
                          className="p-0.5 rounded text-ink-faint hover:text-error"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Add zone shortcut */}
            <div className="p-3 border-t border-line">
              <button
                onClick={() => setZoneModal("new")}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-line-strong text-xs text-ink-faint hover:border-primary/50 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                Add zone
              </button>
            </div>
          </aside>

          {/* Canvas area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-paper-sunken/30">
            {/* Canvas toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-line bg-paper-raised/80 backdrop-blur-sm shrink-0">
              <span className="text-[11px] text-ink-faint">Canvas</span>
              <div className="flex-1" />
              {/* Zoom */}
              <div className="flex items-center gap-1 bg-paper-sunken rounded-lg border border-line p-0.5">
                <button
                  onClick={() => setScale((s) => clamp(s - 0.1, 0.3, 1.5))}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-ink-soft hover:bg-paper-raised hover:text-ink transition-colors text-sm font-bold"
                  title="Zoom out"
                >
                  −
                </button>
                <span className="text-[11px] text-ink-soft tabular-nums w-10 text-center">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  onClick={() => setScale((s) => clamp(s + 0.1, 0.3, 1.5))}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-ink-soft hover:bg-paper-raised hover:text-ink transition-colors text-sm font-bold"
                  title="Zoom in"
                >
                  +
                </button>
              </div>
              <button
                onClick={fitScale}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-ink-soft border border-line bg-paper-raised hover:border-primary/40 hover:text-primary transition-colors"
                title="Fit canvas to window"
              >
                <span className="material-symbols-outlined text-[14px]">fit_screen</span>
                Fit
              </button>
              {/* Keyboard hint strip */}
              <div className="hidden lg:flex items-center gap-2 text-[10px] text-ink-faint ml-2">
                <span><kbd>N</kbd> table</span>
                <span><kbd>Z</kbd> zone</span>
                <span><kbd>Del</kbd> delete</span>
              </div>
            </div>

            {/* Scrollable canvas wrapper */}
            <div
              ref={canvasWrapRef}
              className="flex-1 overflow-auto p-4"
            >
              {loading ? (
                <div className="skeleton rounded-2xl" style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }} />
              ) : (
                <div
                  style={{
                    width: CANVAS_W * scale,
                    height: CANVAS_H * scale,
                    position: "relative",
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width={CANVAS_W * scale}
                    height={CANVAS_H * scale}
                    viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                    className="overflow-visible touch-none select-none"
                    style={{ cursor: dragRef.current ? "grabbing" : "default" }}
                    onPointerMove={onCanvasPointerMove}
                    onPointerUp={onCanvasPointerUp}
                    onPointerLeave={onCanvasPointerUp}
                    onClick={() => { setFocusedTableId(null); setTablePopover(null); }}
                  >
                    {/* Background */}
                    <rect width={CANVAS_W} height={CANVAS_H} rx={12} fill="#f1e7d6" opacity={0.6} />

                    {/* Subtle grid */}
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d4c3a8" strokeWidth="0.5" opacity="0.5" />
                      </pattern>
                    </defs>
                    <rect width={CANVAS_W} height={CANVAS_H} rx={12} fill="url(#grid)" />

                    {/* Zone rectangles */}
                    {zoneRects.map((rect, i) => {
                      const zone = zones.find((z) => z.id === rect.id);
                      if (!zone) return null;
                      const color = zoneColor(i);
                      const isFocused = focusedZoneId === rect.id;
                      const HEADER_H = 28;

                      return (
                        <g key={rect.id}>
                          {/* Zone body */}
                          <rect
                            x={rect.x} y={rect.y}
                            width={rect.w} height={rect.h}
                            rx={10}
                            fill={color.bg}
                            stroke={isFocused ? color.dot : color.border}
                            strokeWidth={isFocused ? 2 : 1.5}
                            onClick={(e) => { e.stopPropagation(); setFocusedZoneId(rect.id); }}
                          />

                          {/* Zone header bar — draggable */}
                          <rect
                            x={rect.x} y={rect.y}
                            width={rect.w} height={HEADER_H}
                            rx={10}
                            fill={color.header}
                            style={{ cursor: "grab" }}
                            onPointerDown={(e) => onCanvasPointerDown(e, "zone-move", rect.id, [rect.x, rect.y])}
                            onDoubleClick={(e) => { e.stopPropagation(); beginRename(zone); }}
                          />
                          {/* Clip bottom corners of header */}
                          <rect
                            x={rect.x} y={rect.y + HEADER_H / 2}
                            width={rect.w} height={HEADER_H / 2}
                            fill={color.header}
                          />

                          {/* Zone name (or rename input) */}
                          {renamingZoneId === rect.id ? (
                            <foreignObject x={rect.x + 8} y={rect.y + 4} width={rect.w - 50} height={HEADER_H - 4}>
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingZoneId(null); }}
                                className="w-full h-full bg-transparent text-[12px] font-semibold text-ink outline-none border-b border-primary/60"
                              />
                            </foreignObject>
                          ) : (
                            <text
                              x={rect.x + 10} y={rect.y + 18}
                              fontSize={11} fontWeight={700}
                              fill="#2a2016"
                              style={{ pointerEvents: "none", userSelect: "none" }}
                            >
                              {zone.name}{zone.is_ac ? " ❄" : ""}
                            </text>
                          )}

                          {/* Add table button inside zone */}
                          <g
                            style={{ cursor: "pointer" }}
                            onClick={(e) => { e.stopPropagation(); setTableModal({ zone_id: rect.id }); }}
                          >
                            <circle cx={rect.x + rect.w - 14} cy={rect.y + 14} r={10} fill={color.dot} opacity={0.9} />
                            <text x={rect.x + rect.w - 14} y={rect.y + 18.5} fontSize={14} fontWeight={700} fill="white" textAnchor="middle" style={{ pointerEvents: "none", userSelect: "none" }}>+</text>
                          </g>

                          {/* Resize handle — bottom-right corner */}
                          <g
                            style={{ cursor: "se-resize" }}
                            onPointerDown={(e) => onCanvasPointerDown(e, "zone-resize", rect.id, [rect.x, rect.y, rect.w, rect.h])}
                          >
                            <rect
                              x={rect.x + rect.w - 16} y={rect.y + rect.h - 16}
                              width={16} height={16}
                              rx={4}
                              fill={color.border}
                              opacity={0.7}
                            />
                            <text
                              x={rect.x + rect.w - 8} y={rect.y + rect.h - 4}
                              fontSize={9} fill={color.dot} textAnchor="middle"
                              style={{ pointerEvents: "none", userSelect: "none" }}
                            >
                              ⌟
                            </text>
                          </g>
                        </g>
                      );
                    })}

                    {/* Table chips */}
                    {tablePositions.map((pos) => {
                      const table = tables.find((t) => t.id === pos.id);
                      if (!table) return null;
                      const zoneIdx = zones.findIndex((z) => z.id === pos.zoneId);
                      const color = zoneColor(zoneIdx < 0 ? 0 : zoneIdx);
                      const isFocused = focusedTableId === table.id;
                      const shape = table.shape ?? "rect";
                      const isRound = shape === "round";
                      const tw = isRound ? TABLE_R * 2 : TABLE_W;
                      const th = isRound ? TABLE_R * 2 : TABLE_H;
                      const rx = shape === "rect" ? 8 : isRound ? TABLE_R : 6;

                      return (
                        <g
                          key={pos.id}
                          transform={`translate(${pos.x - tw / 2}, ${pos.y - th / 2})`}
                          style={{ cursor: "grab" }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setFocusedTableId(table.id);
                            onCanvasPointerDown(e, "table", pos.id, [pos.x, pos.y]);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTablePopover(tablePopover === table.id ? null : table.id);
                          }}
                        >
                          {/* Table body */}
                          <rect
                            width={tw} height={th}
                            rx={rx}
                            fill={isFocused ? color.header : "white"}
                            stroke={isFocused ? color.dot : color.border}
                            strokeWidth={isFocused ? 2 : 1.5}
                            filter={isFocused ? "drop-shadow(0 2px 6px rgba(0,0,0,0.15))" : undefined}
                          />
                          {/* Table label */}
                          <text
                            x={tw / 2} y={th / 2 - 3}
                            fontSize={13} fontWeight={700}
                            fill="#2a2016"
                            textAnchor="middle"
                            style={{ pointerEvents: "none", userSelect: "none" }}
                          >
                            {table.label}
                          </text>
                          {/* Seat count */}
                          <text
                            x={tw / 2} y={th / 2 + 11}
                            fontSize={9}
                            fill="#9c8a70"
                            textAnchor="middle"
                            style={{ pointerEvents: "none", userSelect: "none" }}
                          >
                            {table.seats} seats
                          </text>

                          {/* Popover — rendered as foreignObject */}
                          {tablePopover === table.id && (
                            <foreignObject
                              x={tw + 4}
                              y={-8}
                              width={160}
                              height={200}
                              style={{ overflow: "visible" }}
                            >
                              <TablePopover
                                table={table}
                                zoneName={zoneName(pos.zoneId)}
                                onEdit={() => { setTablePopover(null); setTableModal(table); }}
                                onQr={() => { setTablePopover(null); setQrTable(table); }}
                                onDelete={() => {
                                  setTablePopover(null);
                                  setDeleteConfirm({ type: "table", id: table.id, name: `Table ${table.label}` });
                                }}
                                onClose={() => setTablePopover(null)}
                              />
                            </foreignObject>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modals */}
        {zoneModal && (
          <ZoneModal
            zone={zoneModal === "new" ? null : zoneModal}
            existingRects={zoneRects}
            token={token ?? ""}
            onClose={() => setZoneModal(null)}
            onSaved={(newZone) => {
              setZoneModal(null);
              // Optimistically add rect for new zones
              if (!zones.find((z) => z.id === newZone.id)) {
                const pos = nextZonePos(zoneRects);
                setZoneRects((prev) => [...prev, {
                  id: newZone.id,
                  x: newZone.pos_x ?? pos.x,
                  y: newZone.pos_y ?? pos.y,
                  w: newZone.width ?? ZONE_DEFAULT_W,
                  h: newZone.height ?? ZONE_DEFAULT_H,
                }]);
              }
              load();
            }}
          />
        )}
        {tableModal && (
          <TableModal
            table={"id" in tableModal ? tableModal : null}
            defaultZoneId={"zone_id" in tableModal ? tableModal.zone_id : (tableModal as TableAPI).zone_id}
            zones={zones}
            zoneRects={zoneRects}
            tablePositions={tablePositions}
            token={token ?? ""}
            onClose={() => setTableModal(null)}
            onSaved={(newTable) => {
              setTableModal(null);
              // Optimistically add position for new tables
              if (!tables.find((t) => t.id === newTable.id)) {
                const rect = zoneRects.find((r) => r.id === newTable.zone_id);
                if (rect) {
                  const pos = nextTablePos(rect, tablePositions);
                  setTablePositions((prev) => [...prev, { id: newTable.id, x: pos.x, y: pos.y, zoneId: newTable.zone_id }]);
                }
              }
              load();
            }}
          />
        )}
        {qrTable && (
          <QrModal
            table={qrTable}
            zoneName={zoneName(qrTable.zone_id)}
            onClose={() => setQrTable(null)}
          />
        )}
        {deleteConfirm && (
          <DeleteConfirmModal
            type={deleteConfirm.type}
            name={deleteConfirm.name}
            onConfirm={confirmDelete}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}
      </AdminShell>
    </AppShell>
  );
}

// ─── TablePopover ─────────────────────────────────────────────────────────────

function TablePopover({
  table,
  zoneName,
  onEdit,
  onQr,
  onDelete,
  onClose,
}: {
  table: TableAPI;
  zoneName: string;
  onEdit: () => void;
  onQr: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="bg-paper-raised rounded-xl border border-line shadow-xl p-3 w-40 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="font-bold text-ink text-sm mb-0.5">Table {table.label}</div>
      <div className="text-ink-faint mb-2">{zoneName} · {table.seats} seats</div>
      <div className="space-y-0.5">
        <button onClick={onEdit} className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-left text-ink hover:bg-paper-sunken transition-colors">
          <span className="material-symbols-outlined text-[14px]">edit</span> Edit
        </button>
        <button onClick={onQr} className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-left text-ink hover:bg-paper-sunken transition-colors">
          <span className="material-symbols-outlined text-[14px]">qr_code_2</span> QR code
        </button>
        <button onClick={onDelete} className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-left text-error hover:bg-rose-50 transition-colors">
          <span className="material-symbols-outlined text-[14px]">delete</span> Delete
        </button>
        <button onClick={onClose} className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-left text-ink-faint hover:bg-paper-sunken transition-colors mt-1">
          <span className="material-symbols-outlined text-[14px]">close</span> Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── ZoneModal ────────────────────────────────────────────────────────────────

function ZoneModal({
  zone,
  existingRects,
  token,
  onClose,
  onSaved,
}: {
  zone: ZoneAPI | null;
  existingRects: ZoneRect[];
  token: string;
  onClose: () => void;
  onSaved: (z: ZoneAPI) => void;
}) {
  const isEdit = zone !== null;
  const [name, setName]       = useState(zone?.name ?? "");
  const [isAc, setIsAc]       = useState(zone?.is_ac ?? false);
  const [order, setOrder]     = useState(zone?.display_order ?? 0);
  const [active, setActive]   = useState(zone?.active ?? true);
  const [err, setErr]         = useState("");
  const [busy, setBusy]       = useState(false);

  const submit = async () => {
    if (!name.trim()) { setErr("Zone name is required."); return; }
    const body: ZoneWriteAPI = { name: name.trim(), is_ac: isAc, display_order: order, active };
    setBusy(true);
    setErr("");
    try {
      const saved = isEdit
        ? await api.adminUpdateZone(token, zone!.id, body)
        : await api.adminCreateZone(token, body);
      onSaved(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit zone · ${zone!.name}` : "New zone"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save" : "Create zone"}
          </Button>
        </>
      }
    >
      {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 mb-3">{err}</div>}
      <Field label="Zone name">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. AC Hall, Garden, Rooftop"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Display order">
          <Input
            type="number"
            value={order.toString()}
            onChange={(e) => setOrder(Number(e.target.value))}
          />
        </Field>
        <div className="flex flex-col gap-2 justify-end pb-1">
          <ToggleRow
            label="Air-conditioned"
            icon="ac_unit"
            checked={isAc}
            onChange={setIsAc}
          />
          <ToggleRow
            label="Active"
            icon="check_circle"
            checked={active}
            onChange={setActive}
          />
        </div>
      </div>
    </Modal>
  );
}

// ─── TableModal ───────────────────────────────────────────────────────────────

function TableModal({
  table,
  defaultZoneId,
  zones,
  zoneRects,
  tablePositions,
  token,
  onClose,
  onSaved,
}: {
  table: TableAPI | null;
  defaultZoneId: string;
  zones: ZoneAPI[];
  zoneRects: ZoneRect[];
  tablePositions: TablePos[];
  token: string;
  onClose: () => void;
  onSaved: (t: TableAPI) => void;
}) {
  const isEdit = table !== null;
  const [zoneId, setZoneId] = useState(table?.zone_id ?? defaultZoneId);
  const [label,  setLabel]  = useState(table?.label ?? "");
  const [seats,  setSeats]  = useState(table?.seats ?? 2);
  const [shape,  setShape]  = useState<"round" | "square" | "rect">(table?.shape ?? "rect");
  const [active, setActive] = useState(table?.active ?? true);
  const [err,    setErr]    = useState("");
  const [busy,   setBusy]   = useState(false);

  const submit = async () => {
    if (!label.trim()) { setErr("Label is required."); return; }
    if (!zoneId)       { setErr("Zone is required."); return; }
    // Auto-place in zone if new table
    const rect = zoneRects.find((r) => r.id === zoneId);
    const posData = (!isEdit && rect)
      ? nextTablePos(rect, tablePositions)
      : { x: table?.pos_x ?? 100, y: table?.pos_y ?? 100 };

    const body: TableWriteAPI = {
      zone_id: zoneId,
      label: label.trim(),
      seats,
      shape,
      active,
      pos_x: posData.x,
      pos_y: posData.y,
    };
    setBusy(true);
    setErr("");
    try {
      const saved = isEdit
        ? await api.adminUpdateTable(token, table!.id, body)
        : await api.adminCreateTable(token, body);
      onSaved(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit table · ${table!.label}` : "New table"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save" : "Create table"}
          </Button>
        </>
      }
    >
      {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 mb-3">{err}</div>}
      <Field label="Zone">
        <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}{z.is_ac ? " (AC)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Label">
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. 7 or T3"
          />
        </Field>
        <Field label="Seats">
          <Input
            type="number"
            min={1}
            max={20}
            value={seats.toString()}
            onChange={(e) => setSeats(Math.max(1, Number(e.target.value)))}
          />
        </Field>
      </div>
      <Field label="Shape">
        <div className="flex gap-2">
          {(["rect", "square", "round"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setShape(s)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[11px] font-semibold transition-all ${
                shape === s
                  ? "border-primary bg-primary/8 text-primary"
                  : "border-line text-ink-soft hover:border-line-strong"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {s === "round" ? "circle" : s === "square" ? "crop_square" : "crop_landscape"}
              </span>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </Field>
      <ToggleRow label="Active" icon="check_circle" checked={active} onChange={setActive} />
    </Modal>
  );
}

// ─── DeleteConfirmModal ────────────────────────────────────────────────────────

function DeleteConfirmModal({
  type,
  name,
  onConfirm,
  onCancel,
}: {
  type: "zone" | "table";
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open
      onClose={onCancel}
      title={`Delete ${type}`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" icon="delete" onClick={onConfirm}>Delete</Button>
        </>
      }
    >
      <p className="text-sm text-ink">
        Delete <span className="font-semibold">{name}</span>?
        {type === "zone" && " The zone must have no tables to be deleted."}
        {" This cannot be undone."}
      </p>
    </Modal>
  );
}

// ─── QrModal ──────────────────────────────────────────────────────────────────

function QrModal({
  table,
  zoneName,
  onClose,
}: {
  table: TableAPI;
  zoneName: string;
  onClose: () => void;
}) {
  const print = () => {
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) return;
    w.document.write(`
      <html><head><title>Table ${table.label} — QR</title>
      <style>body{font-family:Georgia,serif;text-align:center;padding:40px}
      h1{font-size:22px;margin:0 0 4px}p{color:#666;margin:0 0 20px}
      img{width:300px;height:300px}</style></head>
      <body onload="window.print()">
        <h1>Saffron &amp; Smoke</h1>
        <p>${zoneName} · Table ${table.label}</p>
        <img src="${qrUrl(table.qr_token, 300)}" alt="QR" />
        <p style="margin-top:20px">Scan to order by voice</p>
      </body></html>`);
    w.document.close();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Table ${table.label} · QR code`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="primary" icon="print" onClick={print}>Print tent card</Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrUrl(table.qr_token)}
          alt={`QR for table ${table.label}`}
          className="w-56 h-56 rounded-xl border border-line bg-white shadow-sm"
        />
        <p className="text-xs text-ink-soft text-center">
          Scanning opens the voice ordering app bound to{" "}
          <span className="font-semibold text-ink">{zoneName} · Table {table.label}</span>.
        </p>
        <code className="text-[10px] text-ink-faint break-all">/t/{table.qr_token}</code>
      </div>
    </Modal>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function ToggleRow({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-primary cursor-pointer"
      />
      <span className="material-symbols-outlined text-[15px] text-ink-soft">{icon}</span>
      <span className="text-sm text-ink">{label}</span>
    </label>
  );
}
