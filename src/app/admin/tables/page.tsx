"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FloorAPI,
  type TableAPI,
  type TableWriteAPI,
  type ZoneAPI,
  type ZoneWriteAPI,
} from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Input, Modal, Select } from "@/components/admin/ui";

// QR image for a table's tent card. The token resolves at /t/<token>, which
// opens the ordering app already bound to that table. Rendered via a public
// generator so we ship no extra dependency; swap for a local lib if needed.
function qrUrl(token: string, size = 260): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const target = `${origin}/t/${token}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(target)}`;
}

export default function AdminTablesPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [zones, setZones] = useState<ZoneAPI[]>([]);
  const [tables, setTables] = useState<TableAPI[]>([]);
  const [floors, setFloors] = useState<FloorAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [zoneModal, setZoneModal] = useState<ZoneAPI | null | "new">(null);
  const [tableModal, setTableModal] = useState<TableAPI | { zone_id: string } | null>(null);
  const [qrTable, setQrTable] = useState<TableAPI | null>(null);

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
      const [z, t, f] = await Promise.all([
        api.adminListZones(token),
        api.adminListTables(token),
        api.adminListFloors(token),
      ]);
      setZones(z);
      setTables(t);
      setFloors(f);
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

  const deleteZone = async (z: ZoneAPI) => {
    if (!token) return;
    if (!confirm(`Delete zone "${z.name}"? It must have no tables.`)) return;
    try {
      await api.adminDeleteZone(token, z.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteTable = async (t: TableAPI) => {
    if (!token) return;
    if (!confirm(`Delete table "${t.label}"?`)) return;
    try {
      await api.adminDeleteTable(token, t.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!isAuthenticated || !user?.is_admin) return null;

  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? "—";

  return (
    <AppShell title="Tables & QR">
      <AdminShell>
        <PageHeader
          title="Tables & QR"
          subtitle={`${zones.length} zone(s) · ${tables.length} table(s)`}
          actions={
            <Button variant="primary" icon="add" onClick={() => setZoneModal("new")}>
              Add zone
            </Button>
          }
        />

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-28 md:pb-8 max-w-[1400px] mx-auto w-full">
          <p className="mb-4 text-xs text-ink-soft">
            Print each table's QR and place it on the table. A guest scans it to
            start ordering by voice — already bound to that table, so they never
            need to know the table number. AC zones add the AC surcharge automatically.
          </p>

          {error && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-line-strong border-t-primary rounded-full animate-spin" />
            </div>
          ) : zones.length === 0 ? (
            <Card className="py-16 text-center text-sm text-ink-soft">
              No zones yet — add an AC hall, a garden, etc. to begin laying out the floor.
            </Card>
          ) : (
            <div className="space-y-6">
              {zones.map((z) => {
                const zoneTables = tables.filter((t) => t.zone_id === z.id);
                return (
                  <div key={z.id}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h2 className="font-headline font-semibold text-ink text-lg">
                          {z.name}
                        </h2>
                        {z.is_ac && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-700 border border-sky-300/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            <span className="material-symbols-outlined text-[12px]">ac_unit</span>
                            AC
                          </span>
                        )}
                        {!z.active && (
                          <span className="text-[10px] uppercase tracking-wide text-ink-faint">
                            inactive
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="secondary" icon="add" onClick={() => setTableModal({ zone_id: z.id })}>
                          Table
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setZoneModal(z)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => deleteZone(z)}>
                          Delete
                        </Button>
                      </div>
                    </div>

                    {zoneTables.length === 0 ? (
                      <Card className="py-6 text-center text-xs text-ink-soft">
                        No tables in this zone yet.
                      </Card>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {zoneTables.map((t) => (
                          <Card key={t.id} className="p-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-headline font-semibold text-ink text-base leading-tight">
                                  Table {t.label}
                                </div>
                                <div className="text-xs text-ink-soft">
                                  {t.seats} seats
                                </div>
                              </div>
                              <button
                                onClick={() => setQrTable(t)}
                                title="Show QR"
                                className="p-1.5 rounded-md text-ink-soft hover:bg-paper-sunken hover:text-ink"
                              >
                                <span className="material-symbols-outlined text-[20px]">qr_code_2</span>
                              </button>
                            </div>
                            <div className="mt-3 flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setTableModal(t)}>
                                Edit
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteTable(t)}>
                                <span className="material-symbols-outlined text-[15px]">delete</span>
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {zoneModal && (
          <ZoneModal
            zone={zoneModal === "new" ? null : zoneModal}
            floors={floors}
            token={token ?? ""}
            onClose={() => setZoneModal(null)}
            onSaved={() => {
              setZoneModal(null);
              load();
            }}
          />
        )}
        {tableModal && (
          <TableModal
            table={"id" in tableModal ? tableModal : null}
            defaultZoneId={"id" in tableModal ? tableModal.zone_id : tableModal.zone_id}
            zones={zones}
            token={token ?? ""}
            onClose={() => setTableModal(null)}
            onSaved={() => {
              setTableModal(null);
              load();
            }}
          />
        )}
        {qrTable && (
          <QrModal table={qrTable} zoneName={zoneName(qrTable.zone_id)} onClose={() => setQrTable(null)} />
        )}
      </AdminShell>
    </AppShell>
  );
}

function ZoneModal({
  zone,
  floors,
  token,
  onClose,
  onSaved,
}: {
  zone: ZoneAPI | null;
  floors: FloorAPI[];
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = zone !== null;
  const [name, setName] = useState(zone?.name ?? "");
  const [floorId, setFloorId] = useState(zone?.floor_id ?? floors[0]?.id ?? "");
  const [isAc, setIsAc] = useState(zone?.is_ac ?? false);
  const [order, setOrder] = useState(zone?.display_order ?? 0);
  const [active, setActive] = useState(zone?.active ?? true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    const body: ZoneWriteAPI = {
      name: name.trim(),
      floor_id: floorId || null,
      is_ac: isAc,
      display_order: order,
      active,
    };
    setBusy(true);
    setErr("");
    try {
      if (isEdit) await api.adminUpdateZone(token, zone!.id, body);
      else await api.adminCreateZone(token, body);
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
      title={isEdit ? `Edit ${zone!.name}` : "Add zone"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}
      <Field label="Zone name">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" placeholder="AC Hall" />
      </Field>
      <Field label="Floor">
        <Select value={floorId} onChange={(e) => setFloorId(e.target.value)} className="w-full">
          {floors.length === 0 && <option value="">No floors — add one first</option>}
          {floors.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Display order">
          <Input
            type="number"
            value={order.toString()}
            onChange={(e) => setOrder(Number(e.target.value))}
            className="w-full tabular-nums"
          />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isAc} onChange={(e) => setIsAc(e.target.checked)} />
            Air-conditioned
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
      </div>
    </Modal>
  );
}

function TableModal({
  table,
  defaultZoneId,
  zones,
  token,
  onClose,
  onSaved,
}: {
  table: TableAPI | null;
  defaultZoneId: string;
  zones: ZoneAPI[];
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = table !== null;
  const [zoneId, setZoneId] = useState(table?.zone_id ?? defaultZoneId);
  const [label, setLabel] = useState(table?.label ?? "");
  const [seats, setSeats] = useState(table?.seats ?? 2);
  const [shape, setShape] = useState(table?.shape ?? "round");
  const [active, setActive] = useState(table?.active ?? true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim()) {
      setErr("Label is required.");
      return;
    }
    const body: TableWriteAPI = { zone_id: zoneId, label: label.trim(), seats, shape, active };
    setBusy(true);
    setErr("");
    try {
      if (isEdit) await api.adminUpdateTable(token, table!.id, body);
      else await api.adminCreateTable(token, body);
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
      title={isEdit ? `Edit table ${table!.label}` : "Add table"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}
      <Field label="Zone">
        <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="w-full">
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
              {z.is_ac ? " (AC)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Label">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full" placeholder="7" />
        </Field>
        <Field label="Seats">
          <Input
            type="number"
            min={1}
            value={seats.toString()}
            onChange={(e) => setSeats(Math.max(1, Number(e.target.value)))}
            className="w-full tabular-nums"
          />
        </Field>
      </div>
      <Field label="Shape (floor plan)">
        <Select value={shape} onChange={(e) => setShape(e.target.value)} className="w-full">
          <option value="round">Round</option>
          <option value="square">Square</option>
          <option value="rect">Rectangle</option>
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active
      </label>
    </Modal>
  );
}

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
      title={`Table ${table.label} · QR`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon="print" onClick={print}>
            Print tent card
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrUrl(table.qr_token)}
          alt={`QR for table ${table.label}`}
          className="w-56 h-56 rounded-lg border border-line bg-white"
        />
        <p className="text-xs text-ink-soft text-center">
          Scanning opens the voice ordering app bound to{" "}
          <span className="font-medium text-ink">{zoneName} · Table {table.label}</span>.
        </p>
        <code className="text-[10px] text-ink-faint break-all">/t/{table.qr_token}</code>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
