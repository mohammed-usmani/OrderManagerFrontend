"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type AdminOrderAPI, type AdminOrderItemAPI, type OrderStatus } from "@/lib/api";
import { formatDate, formatAge, orderAgeUrgency } from "@/lib/datetime";
import { formatPrice } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Input, Modal, Pager, StatusChip, Toolbar, EmptyState } from "@/components/admin/ui";
import { useOrderStream } from "@/hooks/useOrderStream";
import { BillingModal } from "@/components/admin/BillingModal";

// Short two-tone chime for newly-arrived orders (WebAudio — no asset needed).
function ding() {
  try {
    const Ctx = window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = now + i * 0.13;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.start(t);
      o.stop(t + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* autoplay blocked / no WebAudio — stay silent */
  }
}

// Open a kitchen order ticket (KOT) in a print window — items + notes only.
function printKOT(order: AdminOrderAPI) {
  const w = window.open("", "_blank", "width=340,height=620");
  if (!w) return;
  const where = order.order_type === "dine_in"
    ? `Table ${order.table_label ?? "?"}${order.zone_name ? ` · ${order.zone_name}` : ""}`
    : "PARCEL / DELIVERY";
  const rows = order.items
    .filter((i) => i.status !== "voided")
    .map((i) => `<tr><td class="q">${i.quantity}×</td><td>${i.name}${i.special_instructions ? `<br/><i>${i.special_instructions}</i>` : ""}</td></tr>`)
    .join("");
  w.document.write(
    `<html><head><title>KOT ${order.id.slice(0, 8)}</title><style>` +
    `body{font-family:monospace;padding:10px;width:300px;color:#000}h2{margin:0 0 2px;letter-spacing:2px}` +
    `.meta{font-size:12px;margin-bottom:6px}table{width:100%;border-collapse:collapse;font-size:14px}` +
    `td{padding:4px 0;vertical-align:top;border-bottom:1px dashed #999}.q{width:32px;font-weight:bold}i{color:#444;font-size:12px}` +
    `</style></head><body onload="window.print()">` +
    `<h2>KOT</h2><div class="meta">${where}<br/>#${order.id.slice(0, 8).toUpperCase()} · ${new Date().toLocaleTimeString()}</div>` +
    `<table>${rows}</table></body></html>`,
  );
  w.document.close();
}

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

// Every filter gets an active-state accent so the chip style is consistent.
const FILTER_ACCENT: Record<Filter, string> = {
  active:    "bg-primary text-on-primary border-primary/40 shadow-sm",
  all:       "bg-ink text-paper border-ink/40 shadow-sm",
  confirmed: "text-primary border-primary/30 bg-primary/8",
  cooking:   "text-amber-700 border-amber-300/50 bg-amber-50",
  ready:     "text-sky-700 border-sky-300/50 bg-sky-50",
  served:    "text-emerald-700 border-emerald-300/50 bg-emerald-50",
  delivered: "text-violet-700 border-violet-300/50 bg-violet-50",
  paid:      "text-emerald-700 border-emerald-300/50 bg-emerald-50",
  cancelled: "text-rose-700 border-rose-300/50 bg-rose-50",
};

const STATUS_VERB: Partial<Record<OrderStatus, string>> = {
  cooking: "Start cooking",
  served: "Served",
  ready: "Ready",
  delivered: "Delivered",
  paid: "Mark paid",
  cancelled: "Cancel",
};

const REFRESH_MS = 15000;

export default function AdminOrdersPage() {
  const { token } = useAuth();

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
  // Focus is tracked by order id (not array index) so the 15s refresh / reorder
  // keeps the keyboard cursor on the same order.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Orders seen as "confirmed" since the last refresh — pulse briefly, then settle.
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  // Reason-capturing modals for destructive order ops.
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ orderId: string; item: AdminOrderItemAPI } | null>(null);
  const [payTarget, setPayTarget] = useState<AdminOrderAPI | null>(null);
  const [reasonText, setReasonText] = useState("");
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  // Tracks whether this is the very first load (orders array is empty).
  const isFirstLoad = useRef(true);
  // Every order id seen on a prior refresh, so we only pulse genuinely-new ones.
  const seenIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!token) return;
    if (isFirstLoad.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const data = await api.adminListOrders(token, filter);
      // Flag confirmed orders we haven't seen before as "new" (pulse a few sec).
      const fresh = data
        .filter((o) => o.status === "confirmed" && !seenIdsRef.current.has(o.id))
        .map((o) => o.id);
      const firstLoad = seenIdsRef.current.size === 0;
      data.forEach((o) => seenIdsRef.current.add(o.id));
      if (fresh.length && !firstLoad) {
        ding(); // audible alert for newly-arrived orders
        setNewIds((prev) => new Set([...prev, ...fresh]));
        window.setTimeout(() => {
          setNewIds((prev) => {
            const n = new Set(prev);
            fresh.forEach((id) => n.delete(id));
            return n;
          });
        }, 6000);
      }
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

  // When filter changes, drop into "first-load" mode so the skeleton shows only
  // if there's no prior data — but keep the previous rows visible (dimmed via the
  // refreshing spinner) instead of flashing an empty skeleton on every switch.
  useEffect(() => {
    isFirstLoad.current = orders.length === 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Real-time: refetch instantly on any server-side order change (SSE). The
  // interval above stays as a fallback if the stream drops.
  useOrderStream(token, load);

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

  // Mirror the current page + focus into refs so the keyboard listener can be
  // attached exactly once and still read the latest values.
  const pagedRef = useRef<AdminOrderAPI[]>([]);
  const focusedIdRef = useRef<string | null>(null);
  useEffect(() => { pagedRef.current = paged; }, [paged]);
  useEffect(() => { focusedIdRef.current = focusedId; }, [focusedId]);

  // Reset to the first page (and clear row focus) on view change.
  useEffect(() => { setPage(1); setFocusedId(null); }, [filter, search, sortKey, sortDir]);
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

  // ── Stable action helpers (safe to list in effect deps) ──────────────────
  const canAct = useCallback((o: AdminOrderAPI) => o.next_statuses.length > 0, []);
  const toggleOne = useCallback((id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    }), []);
  const toggleExpand = useCallback((id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    }), []);
  const focusVisibleSearch = useCallback(() => {
    const desktop = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
    (desktop ? searchRef.current : mobileSearchRef.current)?.focus();
  }, []);

  // ── Keyboard navigation J/K on the table (attached once) ─────────────────
  useEffect(() => {
    const el = document.getElementById("orders-table-region");
    if (!el) return;
    const focusRow = (id: string | null) => {
      setFocusedId(id);
      if (id) rowRefs.current.get(id)?.focus();
    };
    const move = (delta: number) => {
      const list = pagedRef.current;
      if (list.length === 0) return;
      const cur = focusedIdRef.current;
      const idx = cur ? list.findIndex((o) => o.id === cur) : -1;
      const next = idx < 0
        ? (delta > 0 ? 0 : list.length - 1)
        : Math.max(0, Math.min(list.length - 1, idx + delta));
      focusRow(list[next].id);
    };
    const handleKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "/") { e.preventDefault(); focusVisibleSearch(); return; }
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter" || e.key === " ") {
        const id = focusedIdRef.current;
        if (id) { e.preventDefault(); toggleExpand(id); }
      } else if (e.key === "x") {
        const id = focusedIdRef.current;
        const order = id ? pagedRef.current.find((o) => o.id === id) : null;
        if (order && canAct(order)) toggleOne(order.id);
      }
    };
    el.addEventListener("keydown", handleKey);
    return () => el.removeEventListener("keydown", handleKey);
  }, [toggleExpand, toggleOne, canAct, focusVisibleSearch]);

  const markBusy = (ids: string[], busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) { if (busy) next.add(id); else next.delete(id); }
      return next;
    });

  // Run an order mutation that returns the updated order; patch it into state.
  const applyOrderOp = useCallback(
    async (id: string, op: () => Promise<AdminOrderAPI>) => {
      if (!token) return;
      markBusy([id], true);
      try {
        const updated = await op();
        if (updated) setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        else await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        markBusy([id], false);
      }
    },
    [token, load],
  );

  const transition = useCallback(
    (id: string, status: OrderStatus) =>
      applyOrderOp(id, () => api.adminUpdateOrderStatus(token!, id, status)),
    [token, applyOrderOp],
  );

  // Bump a line item along pending → ready → served.
  const bumpItem = useCallback(
    (orderId: string, item: AdminOrderItemAPI) => {
      const next = item.status === "ready" ? "served" : "ready";
      return applyOrderOp(orderId, () => api.adminSetItemStatus(token!, orderId, item.id, next));
    },
    [token, applyOrderOp],
  );

  const confirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    const id = cancelTarget;
    setCancelTarget(null);
    await applyOrderOp(id, () => api.adminCancelOrder(token!, id, reasonText.trim() || undefined));
    setReasonText("");
  }, [cancelTarget, reasonText, token, applyOrderOp]);

  const confirmRefund = useCallback(async () => {
    if (!refundTarget || !reasonText.trim()) return;
    const id = refundTarget;
    setRefundTarget(null);
    await applyOrderOp(id, () => api.adminRefundOrder(token!, id, reasonText.trim()));
    setReasonText("");
  }, [refundTarget, reasonText, token, applyOrderOp]);

  const confirmVoid = useCallback(async () => {
    if (!voidTarget || !reasonText.trim()) return;
    const { orderId, item } = voidTarget;
    setVoidTarget(null);
    await applyOrderOp(orderId, () => api.adminVoidOrderItem(token!, orderId, item.id, reasonText.trim()));
    setReasonText("");
  }, [voidTarget, reasonText, token, applyOrderOp]);

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

  const actionable = visible.filter(canAct);
  const allSelected = actionable.length > 0 && actionable.every((o) => selected.has(o.id));
  const toggleAll  = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(actionable.map((o) => o.id)));
  };
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "created_at" ? "desc" : "asc"); }
  };

  return (
    <AppShell title="Kitchen">
      <AdminShell>
        <PageHeader
          title="Kitchen"
          badge={visible.length}
          subtitle="Auto-refreshes every 15s · use J/K to navigate rows"
          actions={
            <OrderSearch
              inputRef={searchRef}
              value={search}
              onChange={setSearch}
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
                      ? `border ${accent ?? "bg-primary text-on-primary border-primary/40 shadow-sm"}`
                      : "text-ink-soft border-transparent hover:bg-paper-sunken hover:text-ink"
                  }`}
                >
                  {FILTER_LABEL[f]}
                </button>
              );
            })}
          </div>
          <OrderSearch
            inputRef={mobileSearchRef}
            value={search}
            onChange={setSearch}
            className="md:hidden flex-1 min-w-[160px]"
          />
          <div className="flex-1" />
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-soft">{selected.size} selected</span>
              <Button size="sm" variant="danger" onClick={() => setBulkConfirm(true)}>Cancel selected</Button>
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
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError("")}
                className="p-0.5 rounded-md hover:bg-rose-100 transition-colors shrink-0"
                aria-label="Dismiss error"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
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
                    {paged.map((order) => {
                        const busy       = busyIds.has(order.id);
                        const isSelected = selected.has(order.id);
                        const isExpanded = expanded.has(order.id);
                        const actable    = canAct(order);
                        const isFocused  = focusedId === order.id;
                        const isNew      = newIds.has(order.id);
                        const ageUrgency = orderAgeUrgency(order.created_at);
                        const ageColor   = ageUrgency === "urgent" ? "text-rose-600 font-semibold" : ageUrgency === "warn" ? "text-amber-600 font-medium" : "text-ink-faint";
                      return (
                        <React.Fragment key={order.id}>
                          <tr
                            ref={(el) => { if (el) rowRefs.current.set(order.id, el); else rowRefs.current.delete(order.id); }}
                            tabIndex={0}
                            onFocus={() => setFocusedId(order.id)}
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
                            <td className="px-4 py-3 whitespace-nowrap" title={formatDate(order.created_at)}>
                              <span className={`text-xs tabular-nums ${ageColor}`}>
                                {formatAge(order.created_at)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-ink tabular-nums">{formatPrice(order.total)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <StatusChip status={order.status} />
                                {order.refunded && (
                                  <span className="inline-flex h-5 px-1.5 items-center rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                                    Refunded
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {order.status === "paid" && !order.refunded ? (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => setRefundTarget(order.id)}
                                  disabled={busy}
                                >
                                  Refund
                                </Button>
                              ) : actable ? (
                                <div className="inline-flex gap-1 justify-end flex-wrap">
                                  {order.next_statuses.map((s) =>
                                    s === "cancelled" ? (
                                      <Button
                                        key={s}
                                        size="xs"
                                        variant="danger"
                                        onClick={() => setCancelTarget(order.id)}
                                        disabled={busy}
                                      >
                                        Cancel
                                      </Button>
                                    ) : s === "paid" ? (
                                      <Button
                                        key={s}
                                        size="xs"
                                        variant="primary"
                                        onClick={() => setPayTarget(order)}
                                        disabled={busy}
                                      >
                                        Take payment
                                      </Button>
                                    ) : (
                                      <Button
                                        key={s}
                                        size="xs"
                                        variant="secondary"
                                        onClick={() => transition(order.id, s)}
                                        disabled={busy}
                                      >
                                        {STATUS_VERB[s] ?? s}
                                      </Button>
                                    )
                                  )}
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
                                <div className="mb-2 flex justify-end">
                                  <Button size="xs" variant="ghost" icon="print" onClick={() => printKOT(order)}>
                                    Print KOT
                                  </Button>
                                </div>
                                <ul className="space-y-1.5 text-sm">
                                  {order.items.map((it) => {
                                    const voided = it.status === "voided";
                                    const openOrder = order.status !== "paid" && order.status !== "cancelled";
                                    return (
                                    <li key={it.id} className="flex items-start gap-3 group/it">
                                      <span className="w-7 text-ink-faint tabular-nums text-xs pt-0.5">{it.quantity}×</span>
                                      <span className={`flex-1 ${voided ? "line-through text-ink-faint" : "text-ink"}`}>
                                        {it.name}
                                        {it.special_instructions && (
                                          <span className="text-ink-soft italic ml-2 text-xs">({it.special_instructions})</span>
                                        )}
                                        {!voided && it.status && it.status !== "pending" && (
                                          <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">{it.status}</span>
                                        )}
                                        {voided && it.void_reason && (
                                          <span className="ml-2 text-[11px] text-rose-600">void: {it.void_reason}</span>
                                        )}
                                      </span>
                                      {openOrder && !voided && (
                                        <span className="flex items-center gap-1 opacity-0 group-hover/it:opacity-100 transition-opacity">
                                          {it.status !== "served" && (
                                            <button
                                              onClick={() => bumpItem(order.id, it)}
                                              title={it.status === "ready" ? "Mark served" : "Mark ready"}
                                              className="text-ink-faint hover:text-emerald-600"
                                            >
                                              <span className="material-symbols-outlined text-[15px]">{it.status === "ready" ? "room_service" : "check"}</span>
                                            </button>
                                          )}
                                          <button
                                            onClick={() => { setReasonText(""); setVoidTarget({ orderId: order.id, item: it }); }}
                                            title="Void this item"
                                            className="text-ink-faint hover:text-rose-500"
                                          >
                                            <span className="material-symbols-outlined text-[15px]">block</span>
                                          </button>
                                        </span>
                                      )}
                                      <span className={`tabular-nums text-xs ${voided ? "line-through text-ink-faint" : "text-ink-soft"}`}>{formatPrice(it.line_total)}</span>
                                    </li>
                                    );
                                  })}
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

        {bulkConfirm && (
          <Modal
            open
            onClose={() => setBulkConfirm(false)}
            title="Cancel selected orders?"
            footer={
              <>
                <Button variant="ghost" onClick={() => setBulkConfirm(false)}>Keep them</Button>
                <Button
                  variant="danger"
                  icon="cancel"
                  onClick={() => { setBulkConfirm(false); bulkCancel(); }}
                >
                  Cancel orders
                </Button>
              </>
            }
          >
            <p className="text-sm text-ink-soft">
              This will cancel{" "}
              <span className="font-semibold text-ink">
                {Array.from(selected).filter((id) =>
                  visible.find((o) => o.id === id)?.next_statuses.includes("cancelled"),
                ).length}
              </span>{" "}
              order(s) that can still be cancelled. This can&rsquo;t be undone.
            </p>
          </Modal>
        )}

        {cancelTarget && (
          <Modal
            open
            onClose={() => { setCancelTarget(null); setReasonText(""); }}
            title="Cancel this order?"
            footer={
              <>
                <Button variant="ghost" onClick={() => { setCancelTarget(null); setReasonText(""); }}>Keep it</Button>
                <Button variant="danger" icon="cancel" onClick={confirmCancel}>Cancel order</Button>
              </>
            }
          >
            <p className="text-sm text-ink-soft mb-3">Add a reason (optional) — it&rsquo;s recorded in the audit log.</p>
            <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="e.g. customer changed their mind" className="w-full" autoFocus />
          </Modal>
        )}

        {refundTarget && (
          <Modal
            open
            onClose={() => { setRefundTarget(null); setReasonText(""); }}
            title="Refund this order?"
            footer={
              <>
                <Button variant="ghost" onClick={() => { setRefundTarget(null); setReasonText(""); }}>Back</Button>
                <Button variant="danger" icon="currency_rupee" onClick={confirmRefund} disabled={!reasonText.trim()}>Refund</Button>
              </>
            }
          >
            <p className="text-sm text-ink-soft mb-3">A reason is required for refunds (audit log).</p>
            <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="e.g. wrong item delivered" className="w-full" autoFocus />
          </Modal>
        )}

        {voidTarget && (
          <Modal
            open
            onClose={() => { setVoidTarget(null); setReasonText(""); }}
            title={`Void "${voidTarget.item.name}"?`}
            footer={
              <>
                <Button variant="ghost" onClick={() => { setVoidTarget(null); setReasonText(""); }}>Back</Button>
                <Button variant="danger" icon="block" onClick={confirmVoid} disabled={!reasonText.trim()}>Void item</Button>
              </>
            }
          >
            <p className="text-sm text-ink-soft mb-3">The line stays on the ticket but comes off the bill. Reason required.</p>
            <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="e.g. ran out of an ingredient" className="w-full" autoFocus />
          </Modal>
        )}

        {payTarget && (
          <BillingModal
            target={{ order_id: payTarget.id }}
            title={`Take payment · #${payTarget.id.slice(0, 8).toUpperCase()}`}
            subtitle={payTarget.order_type === "dine_in" ? `Table ${payTarget.table_label ?? "?"}` : payTarget.customer_name || undefined}
            token={token}
            onClose={() => setPayTarget(null)}
            onPaid={() => { setPayTarget(null); load(); }}
          />
        )}
      </AdminShell>
    </AppShell>
  );
}

// ── OrderSearch (single responsive search field, defined once) ───────────────

function OrderSearch({
  value,
  onChange,
  inputRef,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.Ref<HTMLInputElement>;
  className?: string;
}) {
  return (
    <Input
      ref={inputRef}
      data-search
      leadingIcon="search"
      placeholder="Search orders"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
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
