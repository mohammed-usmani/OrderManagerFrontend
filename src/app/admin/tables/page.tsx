"use client";

/**
 * /admin/tables — Live table status, QR management & session settling.
 *
 * Shows all tables across floors with their live status.
 * Supports filtering by floor and by zone.
 * Allows viewing QR codes and settling open sessions.
 *
 * Floor plan layout / CRUD (adding tables, zones, moving things) lives at /admin/floor.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FloorMapFloorAPI,
  type FloorZoneAPI,
  type FloorTableAPI,
  type TableSessionDetailAPI,
} from "@/lib/api";
import { formatPrice } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Modal, EmptyState } from "@/components/admin/ui";

const REFRESH_MS = 8000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function qrUrl(token: string, size = 260): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const target = `${origin}/t/${token}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(target)}`;
}

type TableStatus = "available" | "seated" | "bill_requested" | "inactive";

function tableStatus(t: FloorTableAPI): TableStatus {
  if (!t.active) return "inactive";
  if (!t.session) return "available";
  if (t.session.status === "bill_requested") return "bill_requested";
  return "seated";
}

const STATUS_META: Record<TableStatus, { label: string; dot: string; bg: string; border: string; text: string }> = {
  available:      { label: "Available",      dot: "#4caf82", bg: "#f0faf5", border: "#c3e8d4", text: "#1a6641" },
  seated:         { label: "Seated",         dot: "#ff6a1a", bg: "#fff4ee", border: "#ffd4b8", text: "#a33500" },
  bill_requested: { label: "Bill requested", dot: "#f59e0b", bg: "#fffbec", border: "#fde68a", text: "#7c5c00" },
  inactive:       { label: "Inactive",       dot: "#b0a898", bg: "#f5f3f0", border: "#ddd8d0", text: "#7a7060" },
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminTablesPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [floors, setFloors] = useState<FloorMapFloorAPI[]>([]);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null); // null = all zones
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals
  const [settleSessionId, setSettleSessionId] = useState<string | null>(null);
  const [qrTable, setQrTable] = useState<{ table: FloorTableAPI; zoneName: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { router.replace("/auth/signin"); return; }
    if (user && !user.is_admin) router.replace("/chat");
  }, [isAuthenticated, user, router]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.adminFloorMap(token);
      setFloors(data);
      setActiveFloorId((cur) => cur ?? data[0]?.id ?? null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Live polling
  useEffect(() => {
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!isAuthenticated || !user?.is_admin) return null;

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? floors[0] ?? null;

  // Zone filter — reset when floor changes
  const handleFloorChange = (id: string | null) => {
    setActiveFloorId(id);
    setActiveZoneId(null);
  };

  // Flatten all tables for stats
  const allFloorTables = floors.flatMap((f) => f.zones.flatMap((z) => z.tables));
  const seatedCount = allFloorTables.filter((t) => t.session).length;
  const billCount = allFloorTables.filter((t) => t.session?.status === "bill_requested").length;

  // Tables to display — from active floor filtered by active zone
  const visibleZones: FloorZoneAPI[] = activeFloor
    ? activeZoneId
      ? activeFloor.zones.filter((z) => z.id === activeZoneId)
      : activeFloor.zones
    : [];

  return (
    <AppShell title="Tables & QR">
      <AdminShell>
        <PageHeader
          title="Tables & QR"
          badge={`${seatedCount} seated`}
          subtitle={`${billCount > 0 ? `${billCount} bill requested · ` : ""}Live status · refreshes every ${REFRESH_MS / 1000}s`}
          actions={
            <Button
              variant="secondary"
              icon="map"
              onClick={() => router.push("/admin/floor")}
            >
              Floor plan
            </Button>
          }
        />

        {error && (
          <div className="mx-4 md:mx-8 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {error}
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-28 md:pb-8">

          {/* Status legend */}
          <div className="flex flex-wrap gap-4 mb-4 text-xs">
            {(Object.entries(STATUS_META) as [TableStatus, typeof STATUS_META[TableStatus]][]).map(([key, meta]) => (
              <span key={key} className="inline-flex items-center gap-1.5 text-ink-soft">
                <span className="w-2 h-2 rounded-full" style={{ background: meta.dot }} />
                {meta.label}
              </span>
            ))}
          </div>

          {/* Floor tabs */}
          {floors.length > 1 && (
            <div className="flex gap-1 mb-3 flex-wrap">
              {floors.map((f) => (
                <button
                  key={f.id ?? "unassigned"}
                  onClick={() => handleFloorChange(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    f.id === activeFloor?.id
                      ? "bg-primary text-on-primary"
                      : "text-ink-soft hover:bg-paper-sunken border border-line"
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {/* Zone filter chips */}
          {activeFloor && activeFloor.zones.length > 1 && (
            <div className="flex gap-1.5 mb-4 flex-wrap">
              <button
                onClick={() => setActiveZoneId(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeZoneId === null
                    ? "bg-ink text-paper"
                    : "bg-paper-sunken text-ink-soft hover:bg-paper-raised border border-line"
                }`}
              >
                All zones
              </button>
              {activeFloor.zones.map((z) => (
                <button
                  key={z.id}
                  onClick={() => setActiveZoneId(activeZoneId === z.id ? null : z.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                    activeZoneId === z.id
                      ? "bg-ink text-paper"
                      : "bg-paper-sunken text-ink-soft hover:bg-paper-raised border border-line"
                  }`}
                >
                  {z.is_ac && <span className="material-symbols-outlined text-[11px]">ac_unit</span>}
                  {z.name}
                  <span className="opacity-60">{z.tables.length}</span>
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          {loading && floors.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="skeleton h-32 rounded-xl" />
              ))}
            </div>
          ) : floors.length === 0 ? (
            <EmptyState
              icon="table_restaurant"
              title="No tables yet"
              description="Build your floor plan first — add floors, zones and tables there."
              action={
                <Button variant="primary" icon="map" onClick={() => router.push("/admin/floor")}>
                  Go to floor plan
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              {visibleZones.map((zone) => (
                <ZoneSection
                  key={zone.id}
                  zone={zone}
                  onSettle={(sessionId) => setSettleSessionId(sessionId)}
                  onQr={(table) => setQrTable({ table, zoneName: zone.name })}
                />
              ))}
              {visibleZones.length === 0 && (
                <EmptyState
                  icon="table_restaurant"
                  title="No zones on this floor"
                  description="Add zones and tables in the floor plan."
                  action={
                    <Button variant="secondary" icon="map" onClick={() => router.push("/admin/floor")}>
                      Floor plan
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </main>

        {settleSessionId && (
          <SettleModal
            sessionId={settleSessionId}
            token={token ?? ""}
            onClose={() => setSettleSessionId(null)}
            onSettled={() => { setSettleSessionId(null); load(); }}
          />
        )}
        {qrTable && (
          <QrModal
            table={qrTable.table}
            zoneName={qrTable.zoneName}
            onClose={() => setQrTable(null)}
          />
        )}
      </AdminShell>
    </AppShell>
  );
}

// ─── ZoneSection ──────────────────────────────────────────────────────────────

function ZoneSection({
  zone,
  onSettle,
  onQr,
}: {
  zone: FloorZoneAPI;
  onSettle: (sessionId: string) => void;
  onQr: (table: FloorTableAPI) => void;
}) {
  const seatedInZone = zone.tables.filter((t) => t.session).length;

  return (
    <section>
      {/* Zone header */}
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="text-sm font-bold text-ink">{zone.name}</h2>
        {zone.is_ac && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-full font-semibold">
            <span className="material-symbols-outlined text-[11px]">ac_unit</span>
            AC
          </span>
        )}
        {seatedInZone > 0 && (
          <span className="text-[10px] text-ink-faint">
            {seatedInZone}/{zone.tables.length} seated
          </span>
        )}
      </div>

      {zone.tables.length === 0 ? (
        <p className="text-xs text-ink-faint italic mb-2">No tables in this zone.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          {zone.tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onSettle={onSettle}
              onQr={onQr}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── TableCard ────────────────────────────────────────────────────────────────

function TableCard({
  table,
  onSettle,
  onQr,
}: {
  table: FloorTableAPI;
  onSettle: (sessionId: string) => void;
  onQr: (table: FloorTableAPI) => void;
}) {
  const status = tableStatus(table);
  const meta = STATUS_META[status];

  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-2 transition-all hover:shadow-md"
      style={{ background: meta.bg, borderColor: meta.border }}
    >
      {/* Top row: label + status dot */}
      <div className="flex items-start justify-between gap-1">
        <span className="font-headline font-bold text-ink text-base leading-none">
          {table.label}
        </span>
        <span
          className="w-2 h-2 rounded-full mt-0.5 shrink-0"
          style={{ background: meta.dot }}
          title={meta.label}
        />
      </div>

      {/* Seats */}
      <div className="flex items-center gap-1 text-[11px] text-ink-soft">
        <span className="material-symbols-outlined text-[13px]">person</span>
        {table.seats} seats
      </div>

      {/* Session info */}
      {table.session ? (
        <div className="text-[11px] space-y-0.5">
          <div className="font-semibold" style={{ color: meta.text }}>
            {meta.label}
          </div>
          <div className="text-ink-soft">
            {table.session.order_count} order{table.session.order_count !== 1 ? "s" : ""}
          </div>
          <div className="font-bold tabular-nums text-ink text-xs">
            {formatPrice(table.session.running_total)}
          </div>
        </div>
      ) : (
        <div className="text-[11px] font-medium" style={{ color: meta.text }}>
          {meta.label}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1 mt-auto pt-1">
        {table.session && (
          <button
            onClick={() => onSettle(table.session!.id)}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-semibold transition-colors text-white"
            style={{ background: meta.dot }}
          >
            <span className="material-symbols-outlined text-[12px]">paid</span>
            Settle
          </button>
        )}
        <button
          onClick={() => onQr(table)}
          className="flex items-center justify-center p-1 rounded-lg border border-line bg-paper-raised text-ink-soft hover:text-primary hover:border-primary/40 transition-colors"
          title="QR code"
        >
          <span className="material-symbols-outlined text-[14px]">qr_code_2</span>
        </button>
      </div>
    </div>
  );
}

// ─── SettleModal ──────────────────────────────────────────────────────────────

function SettleModal({
  sessionId,
  token,
  onClose,
  onSettled,
}: {
  sessionId: string;
  token: string;
  onClose: () => void;
  onSettled: () => void;
}) {
  const [detail, setDetail] = useState<TableSessionDetailAPI | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .adminGetTableSession(token, sessionId)
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [token, sessionId]);

  const settle = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.adminSettleTableSession(token, sessionId);
      onSettled();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const title = detail
    ? `Table ${detail.table_label ?? "?"}${detail.floor_name ? ` · ${detail.floor_name}` : ""}${detail.is_ac ? " · AC" : ""} — the check`
    : "Loading…";

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
          <Button variant="primary" icon="paid" onClick={settle} disabled={busy || !detail}>
            {busy ? "Settling…" : "Settle & free table"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 mb-3">{err}</div>
      )}
      {!detail ? (
        <p className="text-ink-soft text-sm py-4">Loading the running tab…</p>
      ) : detail.orders.length === 0 ? (
        <p className="text-ink-soft text-sm py-4">Nothing ordered on this table yet.</p>
      ) : (
        <div className="space-y-3">
          {detail.orders.map((o, i) => (
            <div key={o.id} className="rounded-xl border border-line p-3">
              <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-2">
                <span>Round {i + 1}</span>
                <span className="capitalize">{o.status}</span>
              </div>
              <ul className="text-sm text-ink space-y-1">
                {o.items.map((it, j) => (
                  <li key={j} className="flex justify-between">
                    <span>{it.quantity}× {it.name}</span>
                    <span className="tabular-nums text-ink-soft">{formatPrice(it.line_total)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-xs text-ink-soft pt-2 mt-1 border-t border-line">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatPrice(o.subtotal)}</span>
              </div>
            </div>
          ))}
          <div className="flex justify-between font-bold text-ink text-base border-t-2 border-line pt-3">
            <span>Grand total</span>
            <span className="tabular-nums">{formatPrice(detail.grand_total)}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── QrModal ──────────────────────────────────────────────────────────────────

function QrModal({
  table,
  zoneName,
  onClose,
}: {
  table: FloorTableAPI;
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
