"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FloorAPI,
  type FloorMapFloorAPI,
  type FloorWriteAPI,
  type FloorZoneAPI,
  type TableSessionDetailAPI,
  type TableWriteAPI,
  type ZoneWriteAPI,
} from "@/lib/api";
import { formatPrice } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Input, Modal, Select, EmptyState } from "@/components/admin/ui";
import { FloorCanvas, type CanvasTable } from "@/components/admin/FloorCanvas";

const REFRESH_MS = 10000;
const ZONE_COLORS = ["#cfe8ff", "#ffe0c2", "#d6f5d6", "#f3d6f0", "#fff3bf", "#d6f0f0"];

// Local editable copy of a table while in edit mode.
type Draft = { pos_x: number | null; pos_y: number | null; shape: string | null; zone_id: string };

export default function AdminFloorPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [floors, setFloors] = useState<FloorMapFloorAPI[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manageFloors, setManageFloors] = useState(false);
  // Edit-mode CRUD modals
  const [addTableZoneId, setAddTableZoneId] = useState<string | null>(null);
  const [zoneModal, setZoneModal] = useState<"new" | FloorZoneAPI | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "zone" | "table"; id: string; name: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/signin");
      return;
    }
    if (user && !user.is_admin) router.replace("/chat");
  }, [isAuthenticated, user, router]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.adminFloorMap(token);
      setFloors(data);
      setActiveId((cur) => cur ?? data[0]?.id ?? null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Live polling — paused while editing so it can't clobber un-saved drags.
  useEffect(() => {
    if (editing) return;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load, editing]);

  const activeFloor = floors.find((f) => f.id === activeId) ?? floors[0] ?? null;
  const zoneColor = useMemo(() => {
    const m = new Map<string, string>();
    activeFloor?.zones.forEach((z, i) => m.set(z.id, ZONE_COLORS[i % ZONE_COLORS.length]));
    return m;
  }, [activeFloor]);

  // --- enter / leave edit mode ---
  const enterEdit = () => {
    if (!activeFloor) return;
    const d: Record<string, Draft> = {};
    for (const z of activeFloor.zones) {
      for (const t of z.tables) {
        d[t.id] = { pos_x: t.pos_x, pos_y: t.pos_y, shape: t.shape, zone_id: z.id };
      }
    }
    setDraft(d);
    setSelectedId(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setSelectedId(null);
    load();
  };
  const saveLayout = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const updates = Object.entries(draft)
        .filter(([, d]) => d.pos_x !== null && d.pos_y !== null)
        .map(([table_id, d]) => ({ table_id, pos_x: d.pos_x, pos_y: d.pos_y, shape: d.shape, zone_id: d.zone_id }));
      await api.adminSaveTablePositions(token, updates);
      setEditing(false);
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || !user?.is_admin) return null;

  // --- build canvas tables for the active floor ---
  const liveTables: CanvasTable[] = [];
  const unplaced: { id: string; label: string; zoneId: string }[] = [];
  if (activeFloor) {
    for (const z of activeFloor.zones) {
      for (const t of z.tables) {
        const d = editing ? draft[t.id] : null;
        const px = editing ? d?.pos_x ?? t.pos_x : t.pos_x;
        const py = editing ? d?.pos_y ?? t.pos_y : t.pos_y;
        const zid = editing ? d?.zone_id ?? z.id : z.id;
        if (px === null || py === null) {
          if (editing) unplaced.push({ id: t.id, label: t.label, zoneId: z.id });
          continue;
        }
        liveTables.push({
          id: t.id,
          label: t.label,
          seats: t.seats,
          shape: (editing ? d?.shape ?? t.shape : t.shape) ?? "rect",
          pos_x: px,
          pos_y: py,
          zoneName: activeFloor.zones.find((zz) => zz.id === zid)?.name ?? z.name,
          zoneColor: zoneColor.get(zid) ?? ZONE_COLORS[0],
          status: t.status,
          hasSession: !!t.session,
          sessionTotal: t.session?.running_total,
        });
      }
    }
  }

  const allTables = floors.flatMap((f) => f.zones.flatMap((z) => z.tables));
  const seated = allTables.filter((t) => t.session).length;
  const selected = selectedId
    ? liveTables.find((t) => t.id === selectedId) ?? null
    : null;

  return (
    <AppShell title="Floor">
      <AdminShell>
        <PageHeader
          title="Floor"
          badge={`${seated}/${allTables.length}`}
          subtitle={editing ? "Editing layout — drag tables, then save" : "Tables seated · live"}
          actions={
            editing ? (
              <>
                <Button variant="ghost" icon="grid_view" onClick={() => setZoneModal("new")}>Add zone</Button>
                <Button
                  variant="ghost"
                  icon="table_restaurant"
                  onClick={() => {
                    const firstZone = activeFloor?.zones[0];
                    if (firstZone) setAddTableZoneId(firstZone.id);
                  }}
                  disabled={!activeFloor?.zones.length}
                >
                  Add table
                </Button>
                <Button variant="ghost" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                <Button variant="primary" icon="save" onClick={saveLayout} disabled={saving}>
                  {saving ? "Saving…" : "Save layout"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" icon="layers" onClick={() => setManageFloors(true)}>Floors</Button>
                <Button variant="secondary" icon="edit" onClick={enterEdit} disabled={!activeFloor}>Edit layout</Button>
              </>
            )
          }
        />

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-28 md:pb-8 max-w-[1400px] mx-auto w-full">
          {error && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}

          {/* Floor switcher */}
          {floors.length > 0 && (
            <div className="flex gap-1 mb-4 flex-wrap">
              {floors.map((f) => (
                <button
                  key={f.id ?? "unassigned"}
                  onClick={() => { if (!editing) setActiveId(f.id); }}
                  disabled={editing && f.id !== activeId}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    f.id === activeFloor?.id ? "bg-primary text-on-primary" : "text-ink-soft hover:bg-paper-sunken"
                  } ${editing && f.id !== activeId ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {/* Legend (live) */}
          {!editing && (
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-soft">
              <Legend color="#e6ddcc" label="Free" />
              <Legend color="#ff6a1a" label="Seated" />
              <Legend color="#f59e0b" label="Bill requested" />
              <span className="text-ink-faint">Tap a seated table to settle.</span>
            </div>
          )}

          {loading && floors.length === 0 ? (
            <div className="skeleton h-80 rounded-xl" />
          ) : floors.length === 0 ? (
            <EmptyState
              icon="grid_view"
              title="No floors yet"
              description="Add a floor and some tables to build your plan."
              action={<Button variant="primary" icon="add" onClick={() => setManageFloors(true)}>Manage floors</Button>}
            />
          ) : activeFloor ? (
            <div className={`grid gap-4 ${editing ? "lg:grid-cols-[1fr_280px]" : ""}`}>
              <FloorCanvas
                width={activeFloor.width}
                height={activeFloor.height}
                tables={liveTables}
                mode={editing ? "edit" : "live"}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMove={(id, x, y) =>
                  setDraft((p) => ({ ...p, [id]: { ...p[id], pos_x: x, pos_y: y } }))
                }
                onTableClick={(t) => {
                  const z = activeFloor.zones.find((zz) => zz.tables.some((tt) => tt.id === t.id));
                  const sess = z?.tables.find((tt) => tt.id === t.id)?.session;
                  if (sess) setOpenSessionId(sess.id);
                }}
              />

              {editing && (
                <EditPanel
                  floor={activeFloor}
                  unplaced={unplaced}
                  selected={selected}
                  draft={selectedId ? draft[selectedId] : null}
                  onPlace={(id) =>
                    setDraft((p) => ({
                      ...p,
                      [id]: { ...p[id], pos_x: Math.round(activeFloor.width / 2), pos_y: Math.round(activeFloor.height / 2) },
                    }))
                  }
                  onPatchSelected={(patch) =>
                    selectedId && setDraft((p) => ({ ...p, [selectedId]: { ...p[selectedId], ...patch } }))
                  }
                  onAddTable={(zoneId) => setAddTableZoneId(zoneId)}
                  onEditZone={(zone) => setZoneModal(zone)}
                  onDeleteTable={(id, label) => setDeleteConfirm({ type: "table", id, name: `Table ${label}` })}
                />
              )}
            </div>
          ) : null}
        </main>

        {openSessionId && (
          <SettleModal
            sessionId={openSessionId}
            token={token ?? ""}
            onClose={() => setOpenSessionId(null)}
            onSettled={() => { setOpenSessionId(null); load(); }}
          />
        )}
        {manageFloors && (
          <ManageFloorsModal token={token ?? ""} onClose={() => setManageFloors(false)} onChanged={load} />
        )}
        {addTableZoneId && activeFloor && (
          <AddTableModal
            token={token ?? ""}
            floor={activeFloor}
            defaultZoneId={addTableZoneId}
            onClose={() => setAddTableZoneId(null)}
            onSaved={() => { setAddTableZoneId(null); load(); }}
          />
        )}
        {zoneModal && activeFloor && (
          <ZoneModal
            token={token ?? ""}
            zone={zoneModal === "new" ? null : zoneModal}
            floorId={activeFloor.id ?? ""}
            onClose={() => setZoneModal(null)}
            onSaved={() => { setZoneModal(null); load(); }}
          />
        )}
        {deleteConfirm && (
          <DeleteConfirmModal
            type={deleteConfirm.type}
            name={deleteConfirm.name}
            token={token ?? ""}
            id={deleteConfirm.id}
            onConfirm={async () => {
              try {
                if (deleteConfirm.type === "table") await api.adminDeleteTable(token ?? "", deleteConfirm.id);
                else await api.adminDeleteZone(token ?? "", deleteConfirm.id);
                setDeleteConfirm(null);
                load();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setDeleteConfirm(null);
              }
            }}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}
      </AdminShell>
    </AppShell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function EditPanel({
  floor,
  unplaced,
  selected,
  draft,
  onPlace,
  onPatchSelected,
  onAddTable,
  onEditZone,
  onDeleteTable,
}: {
  floor: FloorMapFloorAPI;
  unplaced: { id: string; label: string; zoneId: string }[];
  selected: CanvasTable | null;
  draft: Draft | null;
  onPlace: (id: string) => void;
  onPatchSelected: (patch: Partial<Draft>) => void;
  onAddTable: (zoneId: string) => void;
  onEditZone: (zone: FloorZoneAPI) => void;
  onDeleteTable: (id: string, label: string) => void;
}) {
  const zones = floor.zones;

  return (
    <Card className="p-4 h-fit space-y-4">
      {/* Zone list with quick actions */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-2">Zones</p>
        {zones.length === 0 ? (
          <p className="text-xs text-ink-faint">No zones on this floor yet.</p>
        ) : (
          <ul className="space-y-1">
            {zones.map((z) => (
              <li key={z.id} className="group flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 hover:bg-paper-sunken transition-colors">
                <span className="flex-1 text-ink font-medium truncate">
                  {z.name}{z.is_ac ? " ❄" : ""}
                </span>
                <button
                  title="Add table to zone"
                  onClick={() => onAddTable(z.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ink-faint hover:text-primary transition-all"
                >
                  <span className="material-symbols-outlined text-[13px]">add</span>
                </button>
                <button
                  title="Edit zone"
                  onClick={() => onEditZone(z)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ink-faint hover:text-primary transition-all"
                >
                  <span className="material-symbols-outlined text-[13px]">edit</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {unplaced.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-2">Not placed yet</p>
          <div className="flex flex-wrap gap-1.5">
            {unplaced.map((u) => (
              <button
                key={u.id}
                onClick={() => onPlace(u.id)}
                className="px-2 py-1 rounded-md border border-line text-xs hover:border-primary/40 transition-colors"
                title="Click to place on canvas"
              >
                + {u.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-2">Selected table</p>
        {!selected || !draft ? (
          <p className="text-sm text-ink-faint">Click a table on the plan to select it.</p>
        ) : (
          <div className="space-y-2.5">
            <div className="font-headline font-semibold text-ink">Table {selected.label} · {selected.seats}p</div>
            <label className="block">
              <span className="text-[11px] text-ink-soft">Shape</span>
              <Select value={draft.shape ?? "rect"} onChange={(e) => onPatchSelected({ shape: e.target.value })} className="w-full mt-1">
                <option value="round">Round</option>
                <option value="square">Square</option>
                <option value="rect">Rectangle</option>
              </Select>
            </label>
            <label className="block">
              <span className="text-[11px] text-ink-soft">Zone</span>
              <Select value={draft.zone_id} onChange={(e) => onPatchSelected({ zone_id: e.target.value })} className="w-full mt-1">
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}{z.is_ac ? " (AC)" : ""}</option>
                ))}
              </Select>
            </label>
            <Button
              variant="danger"
              icon="delete"
              onClick={() => onDeleteTable(selected.id, selected.label)}
              className="w-full justify-center"
            >
              Delete table
            </Button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-ink-faint leading-relaxed">
        Drag tables to reposition. Edit seats &amp; labels in{" "}
        <a href="/admin/tables" className="underline hover:text-primary">Tables &amp; QR</a>.
      </p>
    </Card>
  );
}

function ManageFloorsModal({ token, onClose, onChanged }: { token: string; onClose: () => void; onChanged: () => void }) {
  const [floors, setFloors] = useState<FloorAPI[]>([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    try { setFloors(await api.adminListFloors(token)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [token]);
  useEffect(() => { reload(); }, [reload]);

  const add = async () => {
    if (!name.trim()) return;
    try {
      await api.adminCreateFloor(token, { name: name.trim(), display_order: floors.length });
      setName(""); await reload(); onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const rename = async (f: FloorAPI) => {
    const n = window.prompt("Rename floor", f.name);
    if (!n?.trim()) return;
    try { await api.adminUpdateFloor(token, f.id, { name: n.trim() } as FloorWriteAPI); await reload(); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const remove = async (f: FloorAPI) => {
    if (!confirm(`Delete floor "${f.name}"? It must have no zones.`)) return;
    try { await api.adminDeleteFloor(token, f.id); await reload(); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Modal open onClose={onClose} title="Manage floors" footer={<Button variant="ghost" onClick={onClose}>Done</Button>}>
      {err && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <div className="space-y-2">
        {floors.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
            <span className="text-sm text-ink font-medium">{f.name}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => rename(f)}>Rename</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(f)}><span className="material-symbols-outlined text-[15px]">delete</span></Button>
            </div>
          </div>
        ))}
        {floors.length === 0 && <p className="text-sm text-ink-faint">No floors yet.</p>}
      </div>
      <div className="flex gap-2 pt-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New floor name (e.g. Rooftop)" className="flex-1" />
        <Button variant="primary" icon="add" onClick={add}>Add</Button>
      </div>
    </Modal>
  );
}

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
      {err && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {!detail ? (
        <p className="text-ink-soft text-sm py-4">Loading the running tab…</p>
      ) : detail.orders.length === 0 ? (
        <p className="text-ink-soft text-sm py-4">Nothing ordered on this table yet.</p>
      ) : (
        <div className="space-y-3">
          {detail.orders.map((o, i) => (
            <div key={o.id} className="rounded-md border border-line p-2.5">
              <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
                <span>Round {i + 1}</span>
                <span>{o.status}</span>
              </div>
              <ul className="text-sm text-ink space-y-0.5">
                {o.items.map((it, j) => (
                  <li key={j} className="flex justify-between">
                    <span>{it.quantity}× {it.name}</span>
                    <span className="tabular-nums text-ink-soft">{formatPrice(it.line_total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex justify-between text-sm pt-1">
            <span className="text-ink-soft">Subtotal</span>
            <span className="tabular-nums">{formatPrice(detail.grand_subtotal)}</span>
          </div>
          <div className="flex justify-between font-semibold text-ink text-base border-t border-line pt-2">
            <span>Grand total</span>
            <span className="tabular-nums">{formatPrice(detail.grand_total)}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── AddTableModal ─────────────────────────────────────────────────────────────

function AddTableModal({
  token,
  floor,
  defaultZoneId,
  onClose,
  onSaved,
}: {
  token: string;
  floor: FloorMapFloorAPI;
  defaultZoneId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [zoneId, setZoneId] = useState(defaultZoneId);
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState(2);
  const [shape, setShape] = useState<"round" | "square" | "rect">("rect");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim()) { setErr("Label is required."); return; }
    setBusy(true);
    setErr("");
    try {
      await api.adminCreateTable(token, {
        zone_id: zoneId,
        label: label.trim(),
        seats,
        shape,
        pos_x: Math.round(floor.width / 2),
        pos_y: Math.round(floor.height / 2),
      } as TableWriteAPI);
      onSaved();
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
      title="New table"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create table"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}

      {/* Zone */}
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint block mb-1.5">Zone</span>
        <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="w-full">
          {floor.zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}{z.is_ac ? " (AC)" : ""}</option>
          ))}
        </Select>
      </div>

      {/* Label + Seats */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint block mb-1.5">Label</span>
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. 7 or T3"
            className="w-full"
          />
        </div>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint block mb-1.5">Seats</span>
          <Input
            type="number"
            min={1}
            max={20}
            value={seats.toString()}
            onChange={(e) => setSeats(Math.max(1, Number(e.target.value)))}
            className="w-full"
          />
        </div>
      </div>

      {/* Shape picker */}
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint block mb-1.5">Shape</span>
        <div className="flex gap-2">
          {(["rect", "square", "round"] as const).map((s) => (
            <button
              key={s}
              type="button"
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
      </div>
    </Modal>
  );
}

// ─── ZoneModal ─────────────────────────────────────────────────────────────────

function ZoneModal({
  token,
  zone,
  floorId,
  onClose,
  onSaved,
}: {
  token: string;
  zone: FloorZoneAPI | null;
  floorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = zone !== null;
  const [name, setName] = useState(zone?.name ?? "");
  const [isAc, setIsAc] = useState(zone?.is_ac ?? false);
  const [active, setActive] = useState(zone?.active ?? true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { setErr("Zone name is required."); return; }
    setBusy(true);
    setErr("");
    try {
      const body: ZoneWriteAPI = {
        name: name.trim(),
        is_ac: isAc,
        active,
        ...(floorId ? { floor_id: floorId } : {}),
      };
      if (isEdit) {
        await api.adminUpdateZone(token, zone!.id, body);
      } else {
        await api.adminCreateZone(token, body);
      }
      onSaved();
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
      <label className="block mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">Zone name</span>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. AC Hall, Garden, Rooftop"
          className="w-full mt-1.5"
        />
      </label>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isAc}
            onChange={(e) => setIsAc(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <span className="material-symbols-outlined text-[15px] text-sky-500">ac_unit</span>
          <span className="text-sm text-ink">Air-conditioned</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <span className="material-symbols-outlined text-[15px] text-ink-soft">check_circle</span>
          <span className="text-sm text-ink">Active</span>
        </label>
      </div>
    </Modal>
  );
}

// ─── DeleteConfirmModal ─────────────────────────────────────────────────────────

function DeleteConfirmModal({
  type,
  name,
  onConfirm,
  onCancel,
}: {
  type: "zone" | "table";
  name: string;
  token: string;
  id: string;
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
        {type === "zone" && " The zone must be empty (no tables) before it can be deleted."}
        {" This cannot be undone."}
      </p>
    </Modal>
  );
}
