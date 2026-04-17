"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type AnalyticsSummaryAPI } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Toolbar } from "@/components/admin/ui";
import { formatPrice } from "@/lib/brand";

type Range = "today" | "7d" | "30d" | "all";

const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

const STATUS_ACCENT: Record<string, string> = {
  confirmed: "text-blue-700",
  awaiting_payment: "text-amber-700",
  paid: "text-emerald-700",
  cancelled: "text-rose-700",
  cart: "text-zinc-500",
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
    if (!isAuthenticated) {
      router.replace("/auth/signin");
      return;
    }
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
        <PageHeader
          title="Dashboard"
          subtitle={`${RANGE_LABEL[range]} · refreshes every 30s`}
        />

        <Toolbar>
          <div className="flex gap-1">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  range === r
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        </Toolbar>

        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-4 max-w-[1600px] mx-auto w-full">
          {error && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading && !summary && (
            <div className="py-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
            </div>
          )}

          {summary && (
            <div className="space-y-4">
              {/* Headline metrics */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Metric
                  label="Orders"
                  value={String(summary.total_orders)}
                  hint={RANGE_LABEL[range].toLowerCase()}
                />
                <Metric
                  label="Revenue (subtotal)"
                  value={formatPrice(summary.revenue_subtotal)}
                  hint="before service + GST"
                />
                <Metric
                  label="Revenue (incl. charges)"
                  value={formatPrice(summary.revenue_with_charges)}
                  hint="what customers paid"
                />
              </section>

              {/* Orders by status */}
              <Card className="overflow-hidden">
                <header className="px-4 py-2 border-b border-zinc-200 bg-zinc-50">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Orders by status
                  </p>
                </header>
                <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-5 gap-3">
                  {["confirmed", "awaiting_payment", "paid", "cancelled", "cart"].map(
                    (status) => (
                      <div key={status}>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                          {status.replace("_", " ")}
                        </p>
                        <p
                          className={`font-headline font-extrabold text-2xl mt-0.5 tabular-nums ${
                            STATUS_ACCENT[status] ?? "text-zinc-900"
                          }`}
                        >
                          {summary.orders_by_status[status] ?? 0}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </Card>

              {/* Top items */}
              <Card className="overflow-hidden">
                <header className="px-4 py-2 border-b border-zinc-200 bg-zinc-50">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Top selling dishes
                  </p>
                </header>
                {summary.top_items.length === 0 ? (
                  <p className="px-4 py-6 text-zinc-500 text-sm italic">
                    No sales in this period yet.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      <tr className="border-b border-zinc-100">
                        <th className="px-4 py-2 w-10">#</th>
                        <th className="px-4 py-2">Dish</th>
                        <th className="px-4 py-2 w-24 text-right">Qty sold</th>
                        <th className="px-4 py-2 w-32 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.top_items.map((it, idx) => (
                        <tr
                          key={it.menu_item_id}
                          className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                        >
                          <td className="px-4 py-2 text-zinc-500 tabular-nums">{idx + 1}</td>
                          <td className="px-4 py-2">
                            <div className="font-medium text-zinc-900">{it.name}</div>
                            <div className="text-xs text-zinc-500 font-mono">
                              {it.menu_item_id}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-zinc-700 tabular-nums">
                            {it.quantity}
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-zinc-900 tabular-nums">
                            {formatPrice(it.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>
          )}
        </main>
      </AdminShell>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="font-headline font-extrabold text-zinc-900 text-2xl mt-1 tabular-nums">
        {value}
      </p>
      {hint && <p className="text-zinc-500 text-xs mt-0.5">{hint}</p>}
    </Card>
  );
}
