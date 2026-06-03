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
import { Button, Card, Input, Modal, StatusChip, Toolbar } from "@/components/admin/ui";
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
        <PageHeader
          title="Customers"
          subtitle={`${customers.length} records`}
          actions={
            <>
              <Input
                placeholder="Search code, phone, name, area"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-72 hidden md:block"
              />
              <Button variant="primary" icon="add" onClick={() => setCreateOpen(true)}>
                Add customer
              </Button>
            </>
          }
        />

        <Toolbar>
          <Input
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:hidden flex-1 min-w-[160px]"
          />
        </Toolbar>

        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-4 max-w-[1600px] mx-auto w-full">
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
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Area</th>
                      <th className="px-3 py-2">Allergies</th>
                      <th className="px-3 py-2 text-right">Orders</th>
                      <th className="px-3 py-2 w-20 text-right">Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-line hover:bg-paper-sunken/60 cursor-pointer"
                        onClick={() => setEditing(c)}
                      >
                        <td className="px-3 py-2 font-mono font-semibold text-ink tracking-widest">
                          {c.code}
                        </td>
                        <td className="px-3 py-2 text-ink">{c.name || "—"}</td>
                        <td className="px-3 py-2 text-ink-soft tabular-nums">{c.phone || "—"}</td>
                        <td className="px-3 py-2 text-ink-soft">{c.area || "—"}</td>
                        <td className="px-3 py-2 text-ink-soft">
                          {c.allergies ? (
                            <span className="text-rose-700">{c.allergies}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-soft">
                          {c.order_count}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost">
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {customers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-ink-soft text-sm">
                          No customers yet — they'll appear here as the voice agent registers callers.
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
