"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type AnalyticsSummaryAPI } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardHeader, CardBody, MetricCard, Toolbar, EmptyState } from "@/components/admin/ui";
import { AdminKeyboardProvider } from "@/components/admin/AdminKeyboardProvider";
import { formatPrice } from "@/lib/brand";

type Range = "today" | "7d" | "30d" | "all";

const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

const STATUS_ROWS: { key: string; label: string; accent: "primary" | "warning" | "success" | "danger" | "default" }[] = [
  { key: "confirmed",       label: "New",             accent: "primary" },
  { key: "cooking",         label: "Cooking",         accent: "warning" },
  { key: "ready",           label: "Ready",           accent: "primary" },
  { key: "served",          label: "Served",          accent: "success" },
  { key: "awaiting_payment",label: "Awaiting payment",accent: "warning" },
  { key: "paid",            label: "Paid",            accent: "success" },
  { key: "cancelled",       label: "Cancelled",       accent: "danger" },
  { key: "cart",            label: "In cart",         accent: "default" },
];

const DOT: Record<string, string> = {
  primary: "bg-primary",
  warning: "bg-amber-400",
  success: "bg-emerald-500",
  danger:  "bg-rose-500",
  default: "bg-ink-faint",
};

const REFRESH_MS = 30000;

export default function AdminDashboardPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [range, setRange] = useState<Range>("today");
  const [summary, setSummary] = useState<AnalyticsSummaryAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) { router.replace("/auth/signin"); return; }
    if (user && !user.is_admin) router.replace("/chat");
  }, [isAuthenticated, user, router]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.adminAnalyticsSummary(token, range);
      setSummary(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, range]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!isAuthenticated || !user?.is_admin) return null;

  return (
    <AppShell title="Dashboard">
      <AdminShell>
        <AdminKeyboardProvider />
        <PageHeader
          title="Dashboard"
          subtitle={`${RANGE_LABEL[range]} · refreshes every 30s`}
        />

        <Toolbar>
          <div className="flex gap-1 p-0.5 bg-paper-sunken rounded-lg border border-line">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  range === r
                    ? "bg-paper-raised text-ink shadow-sm border border-line"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {loading && summary && (
            <div className="w-4 h-4 border-2 border-line-strong border-t-primary rounded-full animate-spin" />
          )}
        </Toolbar>

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-5 pb-28 md:pb-8 max-w-[1600px] mx-auto w-full">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {loading && !summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
              </div>
              <div className="skeleton h-48 rounded-xl" />
            </div>
          )}

          {summary && (
            <div className="space-y-5">
              {/* Headline KPIs */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MetricCard
                  label="Total Orders"
                  value={String(summary.total_orders)}
                  icon="receipt_long"
                  accent="primary"
                  trendLabel={`in ${RANGE_LABEL[range].toLowerCase()}`}
                  trend="neutral"
                />
                <MetricCard
                  label="Revenue (subtotal)"
                  value={formatPrice(summary.revenue_subtotal)}
                  icon="payments"
                  accent="success"
                  trendLabel="before service + GST"
                  trend="neutral"
                />
                <MetricCard
                  label="Total collected"
                  value={formatPrice(summary.revenue_with_charges)}
                  icon="account_balance_wallet"
                  accent="warning"
                  trendLabel="incl. all charges"
                  trend="neutral"
                />
              </section>

              {/* Orders by status */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-ink-faint" style={{ fontVariationSettings: "'FILL' 1" }}>
                      donut_small
                    </span>
                    <p className="font-semibold text-ink text-sm">Orders by Status</p>
                  </div>
                  <p className="text-xs text-ink-faint">{RANGE_LABEL[range]}</p>
                </CardHeader>
                <CardBody className="p-0">
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-line">
                    {STATUS_ROWS.map(({ key, label, accent }) => {
                      const count = summary.orders_by_status[key] ?? 0;
                      return (
                        <div key={key} className="px-5 py-4 flex items-start gap-3">
                          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${DOT[accent]}`} />
                          <div>
                            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider">{label}</p>
                            <p className="font-headline font-bold text-2xl text-ink tabular-nums mt-0.5">{count}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>

              {/* Top items */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-ink-faint" style={{ fontVariationSettings: "'FILL' 1" }}>
                      star
                    </span>
                    <p className="font-semibold text-ink text-sm">Top Selling Dishes</p>
                  </div>
                  <p className="text-xs text-ink-faint">{RANGE_LABEL[range]}</p>
                </CardHeader>
                {summary.top_items.length === 0 ? (
                  <EmptyState
                    icon="restaurant_menu"
                    title="No sales yet"
                    description={`No orders completed in ${RANGE_LABEL[range].toLowerCase()}.`}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line bg-paper-sunken/50 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                          <th className="px-5 py-2.5 w-10">#</th>
                          <th className="px-5 py-2.5">Dish</th>
                          <th className="px-5 py-2.5 text-right w-24">Qty</th>
                          <th className="px-5 py-2.5 text-right w-32">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.top_items.map((it, idx) => (
                          <tr
                            key={it.menu_item_id}
                            className="border-b border-line last:border-0 hover:bg-paper-sunken/50 transition-colors"
                          >
                            <td className="px-5 py-3 text-ink-faint tabular-nums font-mono text-xs">
                              {String(idx + 1).padStart(2, "0")}
                            </td>
                            <td className="px-5 py-3">
                              <div className="font-medium text-ink">{it.name}</div>
                              <div className="text-[11px] text-ink-faint font-mono mt-0.5">{it.menu_item_id}</div>
                            </td>
                            <td className="px-5 py-3 text-right text-ink-soft tabular-nums font-medium">
                              {it.quantity}
                            </td>
                            <td className="px-5 py-3 text-right font-semibold text-ink tabular-nums">
                              {formatPrice(it.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </main>
      </AdminShell>
    </AppShell>
  );
}
