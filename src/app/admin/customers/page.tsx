"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type CustomerAPI,
  type CustomerWriteAPI,
  type CustomerOrderSummaryAPI,
} from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, CardHeader, Input, Modal, StatusChip, Toolbar, EmptyState } from "@/components/admin/ui";
import { AdminKeyboardProvider } from "@/components/admin/AdminKeyboardProvider";
import { formatPrice } from "@/lib/brand";

export default function AdminCustomersPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [customers, setCustomers] = useState<CustomerAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CustomerAPI | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/signin");
      return;
    }
    if (user && !user.is_admin) router.replace("/chat");
  }, [isAuthenticated, user, router]);

  const load = useCallback(
    async (q?: string) => {
      if (!token) return;
      try {
        const data = await api.adminListCustomers(token, q);
        setCustomers(data);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => load(search.trim() || undefined), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  if (!isAuthenticated || !user?.is_admin) return null;

  return (
    <AppShell title="Customers">
      <AdminShell>
        <AdminKeyboardProvider />
        <PageHeader
          title="Customers"
          badge={customers.length}
          subtitle="Guest records"
          actions={
            <>
              <Input
                data-search
                leadingIcon="search"
                placeholder="Search code, phone, name, area"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 hidden md:block"
              />
              <Button variant="primary" icon="person_add" onClick={() => setCreateOpen(true)}>
                Add customer
              </Button>
            </>
          }
        />

        <Toolbar>
          <Input
            data-search
            leadingIcon="search"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:hidden flex-1 min-w-[160px]"
          />
        </Toolbar>

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-5 pb-28 md:pb-8 max-w-[1600px] mx-auto w-full">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
            </div>
          ) : customers.length === 0 ? (
            <EmptyState
              icon="groups"
              title="No customers yet"
              description="Customers appear here as the voice agent registers callers."
              action={
                <Button variant="primary" icon="person_add" onClick={() => setCreateOpen(true)}>
                  Add manually
                </Button>
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <CardHeader>
                <p className="font-semibold text-ink text-sm">{customers.length} customers</p>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-paper-sunken/70 border-b border-line">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Area</th>
                      <th className="px-4 py-3">Allergies</th>
                      <th className="px-4 py-3 text-right">Orders</th>
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-line last:border-0 hover:bg-paper-sunken/50 cursor-pointer transition-colors"
                        onClick={() => setEditing(c)}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-ink text-xs bg-paper-sunken border border-line px-1.5 py-0.5 rounded tracking-widest">
                            {c.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{c.name || "—"}</td>
                        <td className="px-4 py-3 text-ink-soft tabular-nums">{c.phone || "—"}</td>
                        <td className="px-4 py-3 text-ink-soft">{c.area || "—"}</td>
                        <td className="px-4 py-3">
                          {c.allergies ? (
                            <span className="inline-flex items-center gap-1 text-rose-700 text-xs font-medium">
                              <span className="material-symbols-outlined text-[13px]">warning</span>
                              {c.allergies}
                            </span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-soft font-medium">{c.order_count}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="xs" variant="ghost" icon="open_in_new">Open</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </main>

        {editing && (
          <CustomerModal
            customer={editing}
            token={token ?? ""}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load(search.trim() || undefined);
            }}
          />
        )}
        {createOpen && (
          <CustomerModal
            customer={null}
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

// --- Create / edit modal --------------------------------------------------

const FIELDS: { key: keyof CustomerWriteAPI; label: string; full?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "address_line", label: "Address", full: true },
  { key: "area", label: "Area" },
  { key: "pincode", label: "Pincode" },
  { key: "landmark", label: "Landmark", full: true },
  { key: "preferences", label: "Preferences", full: true },
  { key: "allergies", label: "Allergies", full: true },
  { key: "notes", label: "Notes", full: true },
];

function CustomerModal({
  customer,
  token,
  onClose,
  onSaved,
}: {
  customer: CustomerAPI | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = customer !== null;
  const [form, setForm] = useState<CustomerWriteAPI>({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    address_line: customer?.address_line ?? "",
    area: customer?.area ?? "",
    pincode: customer?.pincode ?? "",
    landmark: customer?.landmark ?? "",
    preferences: customer?.preferences ?? "",
    allergies: customer?.allergies ?? "",
    notes: customer?.notes ?? "",
  });
  const [orders, setOrders] = useState<CustomerOrderSummaryAPI[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!customer || !token) return;
    api
      .adminGetCustomerOrders(token, customer.id)
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [customer, token]);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      if (isEdit) {
        await api.adminUpdateCustomer(token, customer!.id, form);
      } else {
        await api.adminCreateCustomer(token, form);
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
      title={isEdit ? `Customer ${customer!.code}` : "Add customer"}
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
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(({ key, label, full }) => (
          <label key={key} className={`block ${full ? "col-span-2" : ""}`}>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {label}
            </span>
            <div className="mt-1">
              <Input
                value={(form[key] as string) ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full"
              />
            </div>
          </label>
        ))}
      </div>

      {isEdit && (
        <div className="pt-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            Order history ({orders.length})
          </span>
          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
            {orders.length === 0 && (
              <p className="text-xs text-ink-faint">No orders yet.</p>
            )}
            {orders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-md border border-line px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-soft">#{o.id.slice(0, 8)}</span>
                  <StatusChip status={o.status} />
                </div>
                <div className="text-xs text-ink-soft tabular-nums">
                  {o.item_count} item(s) · {formatPrice(o.total)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
