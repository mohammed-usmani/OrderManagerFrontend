"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type AnalyticsOverviewAPI,
  type PeakHourAPI,
  type TimeseriesBucketAPI,
} from "@/lib/api";
import { formatPrice } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/admin/ui";

type Range = "today" | "7d" | "30d" | "90d" | "year" | "all";
type Gran = "day" | "month" | "year";

const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  year: "1 year",
  all: "All time",
};

// Sensible default time-series granularity for each range.
const RANGE_GRAN: Record<Range, Gran> = {
  today: "day",
  "7d": "day",
  "30d": "day",
  "90d": "month",
  year: "month",
  all: "year",
};

export default function AdminAnalyticsPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [range, setRange] = useState<Range>("30d");
  const [overview, setOverview] = useState<AnalyticsOverviewAPI | null>(null);
  const [series, setSeries] = useState<TimeseriesBucketAPI[]>([]);
  const [hours, setHours] = useState<PeakHourAPI[]>([]);
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
    setLoading(true);
    try {
      const gran = RANGE_GRAN[range];
      const [o, s, h] = await Promise.all([
        api.adminAnalyticsOverview(token, range),
        api.adminAnalyticsTimeseries(token, range, gran),
        api.adminAnalyticsPeakHours(token, range),
      ]);
      setOverview(o);
      setSeries(s);
      setHours(h);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, range]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isAuthenticated || !user?.is_admin) return null;

  const split = overview?.split;
  const splitTotal = split ? split.dine_in.revenue + split.parcel.revenue : 0;

  return (
    <AppShell title="Analytics">
      <AdminShell>
        <PageHeader
          title="Analytics"
          subtitle="Revenue, dine-in vs parcel, zones, peak hours"
          actions={
            <div className="flex gap-1">
              {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    range === r ? "bg-primary text-on-primary" : "text-ink-soft hover:bg-paper-sunken"
                  }`}
                >
                  {RANGE_LABEL[r]}
                </button>
              ))}
            </div>
          }
        />

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-28 md:pb-8 max-w-[1400px] mx-auto w-full">
          {error && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading && !overview ? (
            <div className="py-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-line-strong border-t-primary rounded-full animate-spin" />
            </div>
          ) : overview ? (
            <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
              {/* KPI row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Revenue (incl. charges)" value={formatPrice(overview.revenue_total)} icon="payments" />
                <Kpi label="Orders" value={String(overview.billable_orders)} sub={`${overview.total_orders} incl. carts`} icon="receipt_long" />
                <Kpi label="Avg ticket" value={formatPrice(overview.avg_ticket)} icon="sell" />
                <Kpi
                  label="Table turnover"
                  value={`${overview.table_turnover.toFixed(2)}×`}
                  sub={`${overview.dine_in_sessions} sittings · ${overview.active_tables} tables`}
                  icon="autorenew"
                />
              </div>

              {/* Split + revenue over time */}
              <div className="grid lg:grid-cols-[340px_1fr] gap-4">
                <Card className="p-4">
                  <h3 className="font-headline font-semibold text-ink text-sm mb-3">Dine-in vs parcel</h3>
                  {splitTotal > 0 ? (
                    <>
                      <div className="flex h-3 rounded-full overflow-hidden mb-3 bg-paper-sunken">
                        <div className="bg-primary" style={{ width: `${(split!.dine_in.revenue / splitTotal) * 100}%` }} />
                        <div className="bg-secondary" style={{ width: `${(split!.parcel.revenue / splitTotal) * 100}%` }} />
                      </div>
                      <SplitRow color="bg-primary" label="Dine-in" bucket={split!.dine_in} total={splitTotal} />
                      <SplitRow color="bg-secondary" label="Parcel" bucket={split!.parcel} total={splitTotal} />
                    </>
                  ) : (
                    <p className="text-sm text-ink-soft py-6 text-center">No revenue in this period.</p>
                  )}
                </Card>

                <Card className="p-4">
                  <h3 className="font-headline font-semibold text-ink text-sm mb-3">
                    Revenue over time · {RANGE_GRAN[range]}
                  </h3>
                  <ColumnChart
                    data={series.map((b) => ({ label: b.bucket, value: b.revenue }))}
                    emptyText="No orders in this period."
                  />
                </Card>
              </div>

              {/* Top items + zones */}
              <div className="grid lg:grid-cols-2 gap-4">
                <Card className="p-4">
                  <h3 className="font-headline font-semibold text-ink text-sm mb-3">Top dishes</h3>
                  <BarList
                    rows={overview.top_items.map((it) => ({
                      label: it.name,
                      value: it.quantity,
                      sub: formatPrice(it.revenue),
                    }))}
                    unit=" sold"
                  />
                </Card>
                <Card className="p-4">
                  <h3 className="font-headline font-semibold text-ink text-sm mb-3">Revenue by zone (dine-in)</h3>
                  <BarList
                    rows={overview.by_zone.map((z) => ({
                      label: z.zone,
                      value: z.revenue,
                      sub: `${z.orders} order${z.orders === 1 ? "" : "s"}`,
                    }))}
                    valueFmt={formatPrice}
                    emptyText="No dine-in orders yet."
                  />
                </Card>
              </div>

              {/* Peak hours */}
              <Card className="p-4">
                <h3 className="font-headline font-semibold text-ink text-sm mb-3">Peak hours (IST)</h3>
                <ColumnChart
                  data={hours.map((h) => ({ label: `${h.hour}`, value: h.orders }))}
                  emptyText="No orders in this period."
                  compactLabels
                />
              </Card>
            </div>
          ) : null}
        </main>
      </AdminShell>
    </AppShell>
  );
}

function Kpi({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-ink-soft mb-1">
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-headline font-semibold text-ink text-2xl tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-ink-faint mt-0.5">{sub}</div>}
    </Card>
  );
}

function SplitRow({
  color,
  label,
  bucket,
  total,
}: {
  color: string;
  label: string;
  bucket: { orders: number; revenue: number };
  total: number;
}) {
  const pct = total ? Math.round((bucket.revenue / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="flex items-center gap-2 text-ink">
        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
        {label}
        <span className="text-ink-faint text-xs">· {bucket.orders}</span>
      </span>
      <span className="tabular-nums text-ink-soft">
        {formatPrice(bucket.revenue)} <span className="text-ink-faint">({pct}%)</span>
      </span>
    </div>
  );
}

function BarList({
  rows,
  unit = "",
  valueFmt,
  emptyText = "No data.",
}: {
  rows: { label: string; value: number; sub?: string }[];
  unit?: string;
  valueFmt?: (n: number) => string;
  emptyText?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-ink-soft py-6 text-center">{emptyText}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-ink truncate pr-2">{r.label}</span>
            <span className="text-ink-soft tabular-nums shrink-0">
              {valueFmt ? valueFmt(r.value) : `${r.value}${unit}`}
              {r.sub ? <span className="text-ink-faint"> · {r.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full bg-paper-sunken overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ColumnChart({
  data,
  emptyText = "No data.",
  compactLabels = false,
}: {
  data: { label: string; value: number }[];
  emptyText?: string;
  compactLabels?: boolean;
}) {
  const hasData = data.some((d) => d.value > 0);
  if (!hasData) return <p className="text-sm text-ink-soft py-10 text-center">{emptyText}</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-40 overflow-x-auto">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 min-w-[14px] flex-1 group">
          <div className="w-full flex items-end h-32">
            <div
              className="w-full bg-primary/80 group-hover:bg-primary rounded-t transition-colors"
              style={{ height: `${(d.value / max) * 100}%` }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <span className="text-[9px] text-ink-faint tabular-nums truncate w-full text-center">
            {compactLabels ? (i % 3 === 0 ? d.label : "") : d.label.slice(5) || d.label}
          </span>
        </div>
      ))}
    </div>
  );
}
