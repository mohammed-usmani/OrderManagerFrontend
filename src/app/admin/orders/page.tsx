"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type AdminOrderAPI } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { formatPrice } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, CardHeader, Input, Pager, StatusChip, Toolbar, EmptyState } from "@/components/admin/ui";

type Filter =
  | "active" | "all" | "confirmed" | "cooking"
  | "served" | "ready" | "delivered" | "paid" | "cancelled";
type SortKey = "created_at" | "total" | "customer_email";
type SortDir = "asc" | "desc";

const FILTER_LABEL: Record<Filter, string> = {
  active: "Active", all: "All", confirmed: "New", cooking: "Cooking",
  served: "Served", ready: "Ready", delivered: "Delivered",
  paid: "Paid", cancelled: "Cancelled",
};

const FILTER_ACCENT: Record<string, string> = {
  confirmed: "text-primary border-primary/30 bg-primary/8",
  cooking:   "text-amber-700 border-amber-300/50 bg-amber-50",
  ready:     "text-sky-700 border-sky-300/50 bg-sky-50",
};

const STATUS_VERB: Record<string, string> = {
  cooking: "Start cooking",
  served: "Served",
  ready: "Ready",
  delivered: "Delivered",
  paid: "Mark paid",
  cancelled: "Cancel",
};

const REFRESH_MS = 15000;

export default function AdminOrdersPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [filter, setFilter]     = useState<Filter>("active");
  const [orders, setOrders]     = useState<AdminOrderAPI[]>([]);
  // `loading` = true only on the very first fetch (no data yet → show skeleton).
  // `refreshing` = true on subsequent fetches (data exists → keep table, show spinner).
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState("");
  const [busyIds, setBusyIds]   = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch]     = useState("");
  const [sortKey, setSortKey]   = useState<SortKey>("created_at");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthenticated) { router.replace("/auth/signin"); return; }
    if (user && !user.is_admin) router.replace("/chat");
  }, [isAuthenticated, user, router]);

  // Tracks whether this is the very first load (orders array is empty).
  const isFirstLoad = useRef(true);

  const load = useCallback(async () => {
    if (!token) return;
    if (isFirstLoad.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const data = await api.adminListOrders(token, filter);
      setOrders(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFirstLoad.current = false;
    }
  }, [token, filter]);

  // When filter changes reset to "first-load" mode so the skeleton shows
  // only if there was no prior data for that filter.
  useEffect(() => {
    // Clear stale data immediately so the previous filter's rows don't flash
    // while the new request is in-flight.
    setOrders([]);
    isFirstLoad.current = true;
  }, [filter]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

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
      if (sortKey === "created_at")
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      if (sortKey === "total") return (a.total - b.total) * dir;
      return a.customer_email.localeCompare(b.customer_email) * dir;
    });
    return out;
  }, [orders, search, sortKey, sortDir]);

  // Client-side pagination over the filtered/sorted set.
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = useMemo(
    () => visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visible, page, PAGE_SIZE],
  );
  // Reset to the first page (and clear row focus) whenever the view changes.
  useEffect(() => { setPage(1); setFocusedIdx(-1); }, [filter, search, sortKey, sortDir]);
  // Prune selection to only ids still in the visible set after filter/search changes.
  useEffect(() => {
    if (selected.size === 0) return;
    const visibleIds = new Set(visible.map((o) => o.id));
    setSelected((prev) => {
      const pruned = new Set([...prev].filter((id) => visibleIds.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  // If the list shrank under us, keep the page in range.
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  // ── Keyboard navigation J/K on the table ────────────────────────────────
  useEffect(() => {
    const el = document.getElementById("orders-table-region");
    if (!el) return;
    const handleKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((i) => {
          const next = Math.min(i + 1, paged.length - 1);
          rowRefs.current[next]?.focus();
          return next;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((i) => {
          const next = Math.max(i - 1, 0);
          rowRefs.current[next]?.focus();
          return next;
        });
      } else if ((e.key === "Enter" || e.key === " ") && focusedIdx >= 0) {
        e.preventDefault();
        const order = paged[focusedIdx];
        if (order) toggleExpand(order.id);
      } else if (e.key === "x" && focusedIdx >= 0) {
        const order = paged[focusedIdx];
        if (order && canAct(order)) toggleOne(order.id);
      }
    };
    el.addEventListener("keydown", handleKey);
    return () => el.removeEventListener("keydown", handleKey);
  }, [paged, focusedIdx]);

  const markBusy = (ids: string[], busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) busy ? next.add(id) : next.delete(id);
      return next;
    });

  const transition = useCallback(
    async (id: string, status: string) => {
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

  const bulkCancel = useCallback(async () => {
    if (!token || selected.size === 0) return;
    // Resolve against visible (filtered) list, not the full orders array.
    const ids = Array.from(selected).filter((id) =>
      visible.find((o) => o.id === id)?.next_statuses.includes("cancelled")
    );
    if (ids.length === 0) return;
    markBusy(ids, true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => api.adminUpdateOrderStatus(token, id, "cancelled"))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = results.length - failed;
      // Remove only the successfully cancelled ids from selection.
      const successIds = new Set(
        ids.filter((_, i) => results[i].status === "fulfilled")
      );
      setSelected((prev) => {
        const next = new Set(prev);
        successIds.forEach((id) => next.delete(id));
        return next;
      });
      if (failed > 0) setError(`Cancelled ${succeeded} of ${ids.length}; ${failed} could not be cancelled.`);
    } finally {
      markBusy(ids, false);
      await load();
    }
  }, [token, selected, visible, load]);

  const canAct = (o: AdminOrderAPI) => o.next_statuses.length > 0;
  const actionable = visible.filter(canAct);
  const allSelected = actionable.length > 0 && actionable.every((o) => selected.has(o.id));
  const toggleAll  = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(actionable.map((o) => o.id)));
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "created_at" ? "desc" : "asc"); }
  };

  if (!isAuthenticated || !user?.is_admin) return null;

  return (
    <AppShell title="Kitchen">
      <AdminShell>
        <PageHeader
          title="Kitchen"
          badge={visible.length}
          subtitle="Auto-refreshes every 15s · use J/K to navigate rows"
          actions={
            <Input
              ref={searchRef}
              data-search
              leadingIcon="search"
              placeholder="Search orders"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 hidden md:block"
            />
          }
        />

        <Toolbar>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => {
              const accent = FILTER_ACCENT[f];
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    filter === f
                      ? accent
                        ? `border ${accent}`
                        : "bg-primary text-on-primary border-primary/40 shadow-sm"
                      : "text-ink-soft border-transparent hover:bg-paper-sunken hover:text-ink"
                  }`}
                >
                  {FILTER_LABEL[f]}
                </button>
              );
            })}
          </div>
          <Input
            data-search
            leadingIcon="search"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:hidden flex-1 min-w-[160px]"
          />
          <div className="flex-1" />
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-soft">{selected.size} selected</span>
              <Button size="sm" variant="danger" onClick={bulkCancel}>Cancel selected</Button>
            </div>
          )}
          {refreshing && (
            <div className="w-4 h-4 border-2 border-line-strong border-t-primary rounded-full animate-spin shrink-0" title="Refreshing…" />
          )}
        </Toolbar>

        <main
          id="orders-table-region"
          className="flex-1 overflow-y-auto px-4 md:px-8 pt-5 pb-28 md:pb-8 max-w-[1600px] mx-auto w-full"
          tabIndex={-1}
        >
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {loading && orders.length === 0 && (
            <div className="space-y-2">
              {[1,2,3,4].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          )}

          {!loading && visible.length === 0 && (
            <EmptyState
              icon="soup_kitchen"
              title={`No ${FILTER_LABEL[filter].toLowerCase()} orders`}
              description="Orders will appear here when they arrive."
            />
          )}

          {visible.length > 0 && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-paper-sunken/70 border-b border-line">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          disabled={actionable.length === 0}
                          className="cursor-pointer accent-primary disabled:cursor-not-allowed"
                        />
                      </th>
                      <th className="px-3 py-3 w-8" />
                      <th className="px-4 py-3">Order</th>
                      <SortableTh label="Customer"   k="customer_email" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <th className="px-4 py-3">Items</th>
                      <SortableTh label="Placed"     k="created_at"     sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Total"      k="total"          sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((order, rowIdx) => {
                      const busy       = busyIds.has(order.id);
                      const isSelected = selected.has(order.id);
                      const isExpanded = expanded.has(order.id);
                      const actable    = canAct(order);
                      const isFocused  = focusedIdx === rowIdx;
                      const isNew      = order.status === "confirmed";
                      return (
                        <React.Fragment key={order.id}>
                          <tr
                            ref={(el) => { rowRefs.current[rowIdx] = el; }}
                            tabIndex={0}
                            onFocus={() => setFocusedIdx(rowIdx)}
                            className={`border-b border-line transition-colors outline-none
                              ${isSelected ? "bg-primary/4" : ""}
                              ${isFocused  ? "ring-2 ring-inset ring-primary/40 bg-paper-sunken/60" : "hover:bg-paper-sunken/50"}
                              ${busy       ? "opacity-60 pointer-events-none" : ""}
                              ${isNew      ? "animate-pulse-ring" : ""}
                            `}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleOne(order.id)}
                                disabled={!actable}
                                className="cursor-pointer accent-primary disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <button
                                onClick={() => toggleExpand(order.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-md text-ink-faint hover:bg-paper-sunken hover:text-ink transition-colors"
                                aria-label="Expand order"
                              >
                                <span className="material-symbols-outlined text-[16px] leading-none">
                                  {isExpanded ? "expand_less" : "chevron_right"}
                                </span>
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-ink-soft bg-paper-sunken rounded px-1.5 py-0.5 border border-line">
                                #{order.id.slice(0, 8).toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-[220px]">
                              {order.order_type === "dine_in" ? (
                                <>
                                  <div className="font-medium text-ink flex items-center gap-1.5 truncate">
                                    <span className="material-symbols-outlined text-[14px] text-ink-faint shrink-0">table_restaurant</span>
                                    Table {order.table_label ?? "?"}
                                  </div>
                                  <div className="text-xs text-ink-faint truncate">
                                    {order.zone_name ?? "Dine-in"}{order.is_ac ? " · AC" : ""}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="font-medium text-ink truncate">{order.customer_name || "—"}</div>
                                  <div className="text-xs text-ink-faint truncate">
                                    {order.customer_code ? (
                                      <span className="font-mono tracking-widest">{order.customer_code}</span>
                                    ) : order.customer_email}
                                    {order.contact_phone ? ` · ${order.contact_phone}` : ""}
                                  </div>
                                </>
                              )}
                            </td>
                            <td className="px-4 py-3 text-ink-soft tabular-nums text-sm">{order.item_count}</td>
                            <td className="px-4 py-3 text-ink-faint text-xs whitespace-nowrap">{formatDate(order.created_at)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-ink tabular-nums">{formatPrice(order.total)}</td>
                            <td className="px-4 py-3">
                              <StatusChip status={order.status} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              {actable ? (
                                <div className="inline-flex gap-1 justify-end flex-wrap">
                                  {order.next_statuses.map((s) => (
                                    <Button
                                      key={s}
                                      size="xs"
                                      variant={s === "cancelled" ? "danger" : s === "paid" ? "primary" : "secondary"}
                                      onClick={() => transition(order.id, s)}
                                      disabled={busy}
                                    >
                                      {STATUS_VERB[s] ?? s}
                                    </Button>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-ink-faint">—</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${order.id}-expanded`} className="border-b border-line bg-paper-sunken/30">
                              <td colSpan={9} className="px-8 py-4">
                                {order.order_type === "dine_in" ? (
                                  <div className="mb-3 flex items-center gap-2 text-sm text-ink-soft">
                                    <span className="material-symbols-outlined text-[16px] text-ink-faint">table_restaurant</span>
                                    <span className="font-semibold text-ink-faint text-[11px] uppercase tracking-wider mr-1">Dine-in</span>
                                    Table {order.table_label ?? "?"}{order.zone_name ? ` · ${order.zone_name}` : ""}{order.is_ac ? " · AC" : ""}
                                  </div>
                                ) : (order.delivery_address || order.delivery_area) ? (
                                  <div className="mb-3 flex items-center gap-2 text-sm text-ink-soft">
                                    <span className="material-symbols-outlined text-[16px] text-ink-faint">local_shipping</span>
                                    <span className="font-semibold text-ink-faint text-[11px] uppercase tracking-wider mr-1">Deliver to</span>
                                    {order.delivery_address || order.delivery_area}
                                    {order.delivery_pincode ? ` — ${order.delivery_pincode}` : ""}
                                    {order.contact_phone ? ` · ${order.contact_phone}` : ""}
                                  </div>
                                ) : null}
                                <ul className="space-y-1.5 text-sm">
                                  {order.items.map((it) => (
                                    <li key={it.id} className="flex items-start gap-3">
                                      <span className="w-7 text-ink-faint tabular-nums text-xs pt-0.5">{it.quantity}×</span>
                                      <span className="flex-1 text-ink">
                                        {it.name}
                                        {it.special_instructions && (
                                          <span className="text-ink-soft italic ml-2 text-xs">({it.special_instructions})</span>
                                        )}
                                      </span>
                                      <span className="text-ink-soft tabular-nums text-xs">{formatPrice(it.line_total)}</span>
                                    </li>
                                  ))}
                                </ul>
                                <div className="mt-3 pt-3 border-t border-line max-w-xs ml-auto text-xs text-ink-soft space-y-1">
                                  <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatPrice(order.subtotal)}</span></div>
                                  {order.charges.map((c) => (
                                    <div key={c.label} className="flex justify-between">
                                      <span>{c.label}</span>
                                      <span className="tabular-nums">{formatPrice(c.amount)}</span>
                                    </div>
                                  ))}
                                  <div className="flex justify-between font-semibold text-ink pt-1 border-t border-line">
                                    <span>Total</span>
                                    <span className="tabular-nums">{formatPrice(order.total)}</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={page} pageSize={PAGE_SIZE} total={visible.length} onPage={setPage} />
            </Card>
          )}

          {/* Keyboard hint */}
          <div className="mt-4 flex items-center gap-4 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1"><kbd>J</kbd><kbd>K</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd>↵</kbd> expand</span>
            <span className="flex items-center gap-1"><kbd>X</kbd> select</span>
            <span className="flex items-center gap-1"><kbd>/</kbd> search</span>
          </div>
        </main>
      </AdminShell>
    </AppShell>
  );
}

// ── SortableTh ───────────────────────────────────────────────────────────────

function SortableTh({
  label, k, sortKey, sortDir, onClick, right,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onClick: (k: SortKey) => void; right?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onClick(k)}
      className={`px-4 py-3 cursor-pointer select-none hover:text-ink transition-colors ${right ? "text-right" : ""}`}
    >
      <span className={`inline-flex items-center gap-1 ${active ? "text-ink" : ""}`}>
        {label}
        <span className={`material-symbols-outlined text-[12px] leading-none transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}>
          {active && sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
        </span>
      </span>
    </th>
  );
}
