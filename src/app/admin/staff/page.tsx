"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type StaffAPI } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Input, Modal, Select, EmptyState } from "@/components/admin/ui";

const ROLES = [
  { value: "owner", label: "Owner", hint: "Full access incl. staff & settings" },
  { value: "manager", label: "Manager", hint: "Everything except… nothing — full back-office" },
  { value: "cashier", label: "Cashier", hint: "Kitchen, floor & taking payment" },
  { value: "waiter", label: "Waiter", hint: "Kitchen & floor (no payments)" },
  { value: "chef", label: "Chef", hint: "Kitchen display + 86 items" },
];
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-primary/10 text-primary border-primary/20",
  manager: "bg-sky-50 text-sky-700 border-sky-200",
  cashier: "bg-emerald-50 text-emerald-700 border-emerald-200",
  waiter: "bg-amber-50 text-amber-700 border-amber-200",
  chef: "bg-violet-50 text-violet-700 border-violet-200",
};

export default function AdminStaffPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setStaff(await api.adminListStaff());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (id: string, role: string) => {
    try {
      await api.adminUpdateStaffRole(id, role);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.adminDeleteStaff(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <AppShell title="Staff">
      <AdminShell>
        <PageHeader
          title="Staff"
          badge={staff.length}
          subtitle="Accounts & roles — each role sees only its stations"
          actions={
            <Button variant="primary" icon="person_add" onClick={() => setAddOpen(true)}>
              Add staff
            </Button>
          }
        />

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-28 md:pb-8 max-w-[1100px] mx-auto w-full">
          {error && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}

          {loading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : staff.length === 0 ? (
            <EmptyState icon="badge" title="No staff yet" description="Add your first team member to get started." />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-paper-sunken/70 border-b border-line">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3 w-44">Role</th>
                      <th className="px-4 py-3 w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s) => {
                      const isSelf = s.id === user?.id;
                      return (
                        <tr key={s.id} className="border-b border-line last:border-0">
                          <td className="px-4 py-3 font-medium text-ink">
                            {s.name}
                            {isSelf && <span className="ml-2 text-[10px] text-ink-faint">(you)</span>}
                          </td>
                          <td className="px-4 py-3 text-ink-soft">{s.email}</td>
                          <td className="px-4 py-3">
                            <div className="inline-flex items-center gap-2">
                              <span className={`inline-flex h-5 px-2 items-center rounded-full text-[11px] font-semibold border ${ROLE_BADGE[s.role] ?? "bg-paper-sunken text-ink-soft border-line"}`}>
                                {ROLE_LABEL[s.role] ?? s.role}
                              </span>
                              <Select
                                value={s.role}
                                onChange={(e) => changeRole(s.id, e.target.value)}
                                className="text-xs"
                                disabled={isSelf}
                                title={isSelf ? "You can't change your own role" : "Change role"}
                              >
                                {ROLES.map((r) => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                              </Select>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!isSelf && (
                              <Button size="sm" variant="ghost" onClick={() => remove(s.id)} title="Remove staff member">
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </main>

        {addOpen && (
          <AddStaffModal
            onClose={() => setAddOpen(false)}
            onSaved={() => { setAddOpen(false); load(); }}
          />
        )}
      </AdminShell>
    </AppShell>
  );
}

function AddStaffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("waiter");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !name.trim() || password.length < 8) {
      setErr("Name, email and a password of 8+ characters are required.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await api.adminCreateStaff({ email: email.trim().toLowerCase(), name: name.trim(), password, role });
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
      title="Add staff member"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add staff"}</Button>
        </>
      }
    >
      {err && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 mb-3">{err}</div>}
      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1" autoFocus />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Email (login)</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Temporary password</span>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full mt-1" placeholder="At least 8 characters" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Role</span>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-full mt-1">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label} — {r.hint}</option>
            ))}
          </Select>
        </label>
      </div>
    </Modal>
  );
}
