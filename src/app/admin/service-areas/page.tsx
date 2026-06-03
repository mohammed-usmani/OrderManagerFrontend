"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type ServiceAreaAPI, type ServiceAreaWriteAPI } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Input, Modal, StatusChip } from "@/components/admin/ui";

export default function AdminServiceAreasPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [areas, setAreas] = useState<ServiceAreaAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ServiceAreaAPI | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

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
      setAreas(await api.adminListServiceAreas(token));
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

  const markBusy = (id: string, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      busy ? next.add(id) : next.delete(id);
      return next;
    });

  const toggleActive = async (a: ServiceAreaAPI) => {
    if (!token) return;
    markBusy(a.id, true);
    try {
      await api.adminUpdateServiceArea(token, a.id, { active: !a.active });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      markBusy(a.id, false);
    }
  };

  const remove = async (a: ServiceAreaAPI) => {
    if (!token) return;
    if (!confirm(`Remove "${a.name}" from the delivery area?`)) return;
    markBusy(a.id, true);
    try {
      await api.adminDeleteServiceArea(token, a.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      markBusy(a.id, false);
    }
  };

  if (!isAuthenticated || !user?.is_admin) return null;

  return (
    <AppShell title="Delivery areas">
      <AdminShell>
        <PageHeader
          title="Delivery areas"
          subtitle={`${areas.filter((a) => a.active).length} active · ${areas.length} total`}
          actions={
            <Button variant="primary" icon="add" onClick={() => setCreateOpen(true)}>
              Add area
            </Button>
          }
        />

        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-4 max-w-[1600px] mx-auto w-full">
          <p className="mb-3 text-xs text-ink-soft">
            The voice agent only accepts delivery orders to areas listed here. It
            matches a caller's spoken locality or 6-digit pincode against the name,
            aliases, and pincode below.
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
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-paper-sunken/50 border-b border-line">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                      <th className="px-3 py-2">Area</th>
                      <th className="px-3 py-2">Pincode</th>
                      <th className="px-3 py-2">Aliases</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 w-40 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areas.map((a) => {
                      const busy = busyIds.has(a.id);
                      return (
                        <tr
                          key={a.id}
                          className={`border-b border-line hover:bg-paper-sunken/60 ${busy ? "opacity-60" : ""}`}
                        >
                          <td className="px-3 py-2 font-medium text-ink">{a.name}</td>
                          <td className="px-3 py-2 tabular-nums text-ink-soft">{a.pincode || "—"}</td>
                          <td className="px-3 py-2 text-ink-soft">
                            {a.aliases?.length ? a.aliases.join(", ") : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <StatusChip status={a.active ? "available" : "disabled"} />
                          </td>
                          <td className="px-3 py-2 text-right space-x-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(a)} disabled={busy}>
                              Edit
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => toggleActive(a)} disabled={busy}>
                              {a.active ? "Disable" : "Enable"}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => remove(a)} disabled={busy}>
                              Delete
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {areas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-ink-soft text-sm">
                          No delivery areas yet — add the localities you deliver to.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </main>

        {editing && (
          <ServiceAreaModal
            area={editing}
            token={token ?? ""}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
        {createOpen && (
          <ServiceAreaModal
            area={null}
            token={token ?? ""}
            onClose={() => setCreateOpen(false)}
            onSaved={() => {
              setCreateOpen(false);
              load();
            }}
          />
        )}
      </AdminShell>
    </AppShell>
  );
}

function ServiceAreaModal({
  area,
  token,
  onClose,
  onSaved,
}: {
  area: ServiceAreaAPI | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = area !== null;
  const [name, setName] = useState(area?.name ?? "");
  const [pincode, setPincode] = useState(area?.pincode ?? "");
  const [aliasesStr, setAliasesStr] = useState((area?.aliases ?? []).join(", "));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    const aliases = aliasesStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const body: ServiceAreaWriteAPI = {
      name: name.trim(),
      pincode: pincode.trim() || null,
      aliases: aliases.length ? aliases : null,
    };
    setBusy(true);
    setErr("");
    try {
      if (isEdit) await api.adminUpdateServiceArea(token, area!.id, body);
      else await api.adminCreateServiceArea(token, body);
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
      title={isEdit ? `Edit ${area!.name}` : "Add delivery area"}
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
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          Area name
        </span>
        <div className="mt-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" placeholder="Pali Hill" />
        </div>
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          Pincode
        </span>
        <div className="mt-1">
          <Input value={pincode} onChange={(e) => setPincode(e.target.value)} className="w-full" placeholder="400050" inputMode="numeric" />
        </div>
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          Aliases (comma-separated spoken variants)
        </span>
        <div className="mt-1">
          <Input
            value={aliasesStr}
            onChange={(e) => setAliasesStr(e.target.value)}
            className="w-full"
            placeholder="pali naka, pali road, union park"
          />
        </div>
      </label>
    </Modal>
  );
}
