"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type AdminOrderAPI } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { formatPrice } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Input, StatusChip, Toolbar } from "@/components/admin/ui";

type Filter = "active" | "all" | "confirmed" | "awaiting_payment" | "paid" | "cancelled";
type SortKey = "created_at" | "total" | "customer_email";
type SortDir = "asc" | "desc";

const FILTER_LABEL: Record<Filter, string> = {
  active: "Active",
  all: "All",
  confirmed: "Confirmed",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  cancelled: "Cancelled",
};

const REFRESH_MS = 15000;

export default function AdminOrdersPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [filter, setFilter] = useState<Filter>("active");
  const [orders, setOrders] = useState<AdminOrderAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
      const data = await api.adminListOrders(token, filter);
      setOrders(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // --- Filter / sort ---

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = orders;
    if (q) {
      out = out.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.customer_email.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          (o.customer_code?.toLowerCase().includes(q) ?? false) ||
          (o.contact_phone?.toLowerCase().includes(q) ?? false)
      );
    }
    out = [...out].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "created_at") {
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
      if (sortKey === "total") {
        return (a.total - b.total) * dir;
      }
      return a.customer_email.localeCompare(b.customer_email) * dir;
    });
    return out;
  }, [orders, search, sortKey, sortDir]);

  const markBusy = (ids: string[], busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) busy ? next.add(id) : next.delete(id);
      return next;
    });

  const transition = useCallback(
    async (id: string, status: "paid" | "cancelled") => {
      if (!token) return;
      markBusy([id], true);
      try {
        await api.adminUpdateOrderStatus(token, id, status);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        markBusy([id], false);
      }
    },
    [token, load]
  );

  const bulkTransition = useCallback(
    async (status: "paid" | "cancelled") => {
      if (!token || selected.size === 0) return;
      const ids = Array.from(selected);
      markBusy(ids, true);
      try {
        await Promise.all(ids.map((id) => api.adminUpdateOrderStatus(token, id, status)));
        setSelected(new Set());
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        markBusy(ids, false);
      }
    },
    [token, selected, load]
  );

  // --- Selection helpers (ignore rows where we can't act) ---

  const canAct = (o: AdminOrderAPI) =>
    o.status === "confirmed" || o.status === "awaiting_payment";
  const actionable = visible.filter(canAct);
  const allSelected =
    actionable.length > 0 && actionable.every((o) => selected.has(o.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(actionable.map((o) => o.id)));
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "created_at" ? "desc" : "asc");
    }
  };

  if (!isAuthenticated || !user?.is_admin) return null;

  return (
    <AppShell title="Kitchen">
      <AdminShell>
        <PageHeader
          title="Kitchen"
          subtitle={`${visible.length} order(s) · auto-refreshes every 15s`}
          actions={
            <Input
              placeholder="Search by order id, email, name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 hidden md:block"
            />
          }
        />

        <Toolbar>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-primary text-on-primary"
                    : "text-ink-soft hover:bg-paper-sunken"
                }`}
              >
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:hidden flex-1 min-w-[160px]"
          />
          <div className="flex-1" />
          {selected.size > 0 && (
            <>
              <span className="text-xs text-ink-soft mr-1">
                {selected.size} selected
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => bulkTransition("paid")}
              >
                Mark paid
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => bulkTransition("cancelled")}
              >
                Cancel
              </Button>
            </>
          )}
        </Toolbar>

        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-4 max-w-[1600px] mx-auto w-full">
          {error && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading && orders.length === 0 && (
            <div className="py-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-line-strong border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {!loading && orders.length === 0 && (
            <Card className="py-16 text-center text-sm text-ink-soft">
              No {FILTER_LABEL[filter].toLowerCase()} orders.
            </Card>
          )}

          {orders.length > 0 && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-paper-sunken/50 border-b border-line">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                      <th className="px-3 py-2 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          disabled={actionable.length === 0}
                          className="cursor-pointer disabled:cursor-not-allowed"
                        />
                      </th>
                      <th className="px-3 py-2 w-8" />
                      <th className="px-3 py-2">Order</th>
                      <SortableTh
                        label="Customer"
                        k="customer_email"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onClick={toggleSort}
                      />
                      <th className="px-3 py-2">Items</th>
                      <SortableTh
                        label="Placed"
                        k="created_at"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onClick={toggleSort}
                      />
                      <SortableTh
                        label="Total"
                        k="total"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onClick={toggleSort}
                        right
                      />
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 w-40 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((order) => {
                      const busy = busyIds.has(order.id);
                      const isSelected = selected.has(order.id);
                      const isExpanded = expanded.has(order.id);
                      const actable = canAct(order);
                      return (
                        <>
                          <tr
                            key={order.id}
                            className={`border-b border-line hover:bg-paper-sunken/60 ${
                              isSelected ? "bg-paper-sunken/40" : ""
                            } ${busy ? "opacity-60" : ""}`}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleOne(order.id)}
                                disabled={!actable}
                                className="cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => toggleExpand(order.id)}
                                className="text-ink-soft hover:text-ink"
                                aria-label="Toggle items"
                              >
                                <span className="material-symbols-outlined text-[18px] leading-none">
                                  {isExpanded ? "expand_less" : "expand_more"}
                                </span>
                              </button>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-ink-soft">
                              #{order.id.slice(0, 8).toUpperCase()}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-ink truncate max-w-[200px]">
                                {order.customer_name || "—"}
                              </div>
                              <div className="text-xs text-ink-soft truncate max-w-[200px]">
                                {order.customer_code ? (
                                  <>
                                    <span className="font-mono tracking-widest">
                                      {order.customer_code}
                                    </span>
                                    {order.contact_phone ? ` · ${order.contact_phone}` : ""}
                                  </>
                                ) : (
                                  order.customer_email
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-ink-soft">
                              {order.item_count}
                            </td>
                            <td className="px-3 py-2 text-ink-soft whitespace-nowrap">
                              {formatDate(order.created_at)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-ink tabular-nums">
                              {formatPrice(order.total)}
                            </td>
                            <td className="px-3 py-2">
                              <StatusChip status={order.status} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {actable ? (
                                <div className="inline-flex gap-1 justify-end">
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => transition(order.id, "paid")}
                                    disabled={busy}
                                  >
                                    Paid
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => transition(order.id, "cancelled")}
                                    disabled={busy}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-ink-faint">—</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-b border-line bg-paper-sunken/40">
                              <td colSpan={9} className="px-6 py-3">
                                {(order.delivery_address || order.delivery_area) && (
                                  <div className="mb-3 flex items-start gap-2 text-sm">
                                    <span className="material-symbols-outlined text-[16px] text-ink-faint mt-0.5">
                                      local_shipping
                                    </span>
                                    <div className="text-ink-soft">
                                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft mr-2">
                                        Deliver to
                                      </span>
                                      {order.delivery_address || order.delivery_area}
                                      {order.delivery_area && order.delivery_address
                                        ? `, ${order.delivery_area}`
                                        : ""}
                                      {order.delivery_pincode ? ` — ${order.delivery_pincode}` : ""}
                                      {order.contact_phone ? ` · ☎ ${order.contact_phone}` : ""}
                                    </div>
                                  </div>
                                )}
                                <ul className="space-y-1 text-sm">
                                  {order.items.map((it) => (
                                    <li
                                      key={it.id}
                                      className="flex items-start gap-3"
                                    >
                                      <span className="w-8 text-ink-soft tabular-nums">
                                        {it.quantity}×
                                      </span>
                                      <span className="flex-1 text-ink">
                                        {it.name}
                                        {it.special_instructions && (
                                          <span className="text-ink-soft italic ml-2">
                                            ({it.special_instructions})
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-ink-soft tabular-nums">
                                        {formatPrice(it.line_total)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                                <div className="mt-3 flex justify-end gap-8 text-xs text-ink-soft">
                                  <div>
                                    <div className="flex justify-between gap-6">
                                      <span>Subtotal</span>
                                      <span className="tabular-nums">
                                        {formatPrice(order.subtotal)}
                                      </span>
                                    </div>
                                    {order.charges.map((c) => (
                                      <div
                                        key={c.label}
                                        className="flex justify-between gap-6"
                                      >
                                        <span>{c.label}</span>
                                        <span className="tabular-nums">
                                          {formatPrice(c.amount)}
                                        </span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between gap-6 font-semibold text-ink pt-1 border-t border-line mt-1">
                                      <span>Total</span>
                                      <span className="tabular-nums">
                                        {formatPrice(order.total)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </main>
      </AdminShell>
    </AppShell>
  );
}

function SortableTh({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  right,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onClick(k)}
      className={`px-3 py-2 cursor-pointer select-none hover:text-ink ${
        right ? "text-right" : ""
      }`}
    >
      <span className={`inline-flex items-center gap-1 ${active ? "text-ink" : ""}`}>
        {label}
        {active && (
          <span className="material-symbols-outlined text-[12px] leading-none">
            {sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
          </span>
        )}
      </span>
    </th>
  );
}
