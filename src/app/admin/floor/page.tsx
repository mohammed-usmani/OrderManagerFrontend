"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FloorZoneAPI,
  type FloorTableAPI,
  type TableSessionDetailAPI,
} from "@/lib/api";
import { formatPrice } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Modal } from "@/components/admin/ui";

const REFRESH_MS = 10000;

type Vibe = "free" | "occupied" | "billed";

function vibe(t: FloorTableAPI): Vibe {
  if (t.session?.status === "billed" || t.status === "needs_bill") return "billed";
  if (t.session) return "occupied";
  return "free";
}

const VIBE_CARD: Record<Vibe, string> = {
  free: "border-line bg-paper-raised",
  occupied: "border-primary/40 bg-primary/5 ring-1 ring-primary/20",
  billed: "border-amber-300 bg-amber-50 ring-1 ring-amber-200",
};
const VIBE_DOT: Record<Vibe, string> = {
  free: "bg-emerald-400",
  occupied: "bg-primary",
  billed: "bg-amber-500",
};
const VIBE_LABEL: Record<Vibe, string> = {
  free: "Free",
  occupied: "Seated",
  billed: "Bill requested",
};

function minutesSince(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function AdminFloorPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [zones, setZones] = useState<FloorZoneAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

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
      setZones(await api.adminFloorMap(token));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!isAuthenticated || !user?.is_admin) return null;

  const allTables = zones.flatMap((z) => z.tables);
  const seated = allTables.filter((t) => t.session).length;

  return (
    <AppShell title="Floor">
      <AdminShell>
        <PageHeader
          title="Floor"
          subtitle={`${seated}/${allTables.length} tables seated · auto-refreshes every 10s`}
        />

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-28 md:pb-8 max-w-[1400px] mx-auto w-full">
          {/* Legend */}
          <div className="mb-4 flex flex-wrap gap-4 text-xs text-ink-soft">
            {(["free", "occupied", "billed"] as Vibe[]).map((v) => (
              <span key={v} className="inline-flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${VIBE_DOT[v]}`} />
                {VIBE_LABEL[v]}
              </span>
            ))}
          </div>

          {error && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading && zones.length === 0 ? (
            <div className="py-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-line-strong border-t-primary rounded-full animate-spin" />
            </div>
          ) : zones.length === 0 ? (
            <Card className="py-16 text-center text-sm text-ink-soft">
              No zones yet. Add zones and tables under{" "}
              <button className="text-primary underline" onClick={() => router.push("/admin/tables")}>
                Tables &amp; QR
              </button>
              .
            </Card>
          ) : (
            <div className="space-y-6">
              {zones.map((z) => (
                <div key={z.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="font-headline font-semibold text-ink text-lg">{z.name}</h2>
                    {z.is_ac && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-700 border border-sky-300/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        <span className="material-symbols-outlined text-[12px]">ac_unit</span>
                        AC
                      </span>
                    )}
                  </div>
                  {z.tables.length === 0 ? (
                    <Card className="py-6 text-center text-xs text-ink-soft">No tables.</Card>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                      {z.tables.map((t) => {
                        const v = vibe(t);
                        const inner = (
                          <Card className={`p-3 h-full ${VIBE_CARD[v]} ${t.session ? "hover:border-primary/50 transition-colors" : ""}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-headline font-semibold text-ink text-base">
                                {t.label}
                              </span>
                              <span className={`w-2.5 h-2.5 rounded-full ${VIBE_DOT[v]}`} title={VIBE_LABEL[v]} />
                            </div>
                            <div className="text-[11px] text-ink-soft mb-1">{t.seats} seats</div>
                            {t.session ? (
                              <div className="mt-1 space-y-0.5">
                                <div className="flex justify-between text-xs">
                                  <span className="text-ink-soft">
                                    {t.session.order_count} order{t.session.order_count === 1 ? "" : "s"}
                                  </span>
                                  <span className="font-semibold text-ink tabular-nums">
                                    {formatPrice(t.session.running_total)}
                                  </span>
                                </div>
                                <div className="text-[10px] text-ink-faint">
                                  seated {minutesSince(t.session.opened_at)} · tap to settle
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-emerald-600 font-medium mt-1">Available</div>
                            )}
                          </Card>
                        );
                        return t.session ? (
                          <button
                            key={t.id}
                            onClick={() => setOpenSessionId(t.session!.id)}
                            className="text-left active:scale-[0.98] transition-transform"
                          >
                            {inner}
                          </button>
                        ) : (
                          <div key={t.id}>{inner}</div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>

        {openSessionId && (
          <SettleModal
            sessionId={openSessionId}
            token={token ?? ""}
            onClose={() => setOpenSessionId(null)}
            onSettled={() => {
              setOpenSessionId(null);
              load();
            }}
          />
        )}
      </AdminShell>
    </AppShell>
  );
}

function SettleModal({
  sessionId,
  token,
  onClose,
  onSettled,
}: {
  sessionId: string;
  token: string;
  onClose: () => void;
  onSettled: () => void;
}) {
  const [detail, setDetail] = useState<TableSessionDetailAPI | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .adminGetTableSession(token, sessionId)
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [token, sessionId]);

  const settle = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.adminSettleTableSession(token, sessionId);
      onSettled();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const title = detail
    ? `Table ${detail.table_label ?? "?"}${detail.is_ac ? " · AC" : ""} — the check`
    : "Loading…";

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button variant="primary" icon="paid" onClick={settle} disabled={busy || !detail}>
            {busy ? "Settling…" : "Settle & free table"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}
      {!detail ? (
        <p className="text-ink-soft text-sm py-4">Loading the running tab…</p>
      ) : detail.orders.length === 0 ? (
        <p className="text-ink-soft text-sm py-4">Nothing ordered on this table yet.</p>
      ) : (
        <div className="space-y-3">
          {detail.orders.map((o, i) => (
            <div key={o.id} className="rounded-md border border-line p-2.5">
              <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
                <span>Round {i + 1}</span>
                <span>{o.status}</span>
              </div>
              <ul className="text-sm text-ink space-y-0.5">
                {o.items.map((it, j) => (
                  <li key={j} className="flex justify-between">
                    <span>
                      {it.quantity}× {it.name}
                    </span>
                    <span className="tabular-nums text-ink-soft">{formatPrice(it.line_total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex justify-between text-sm pt-1">
            <span className="text-ink-soft">Subtotal</span>
            <span className="tabular-nums">{formatPrice(detail.grand_subtotal)}</span>
          </div>
          <div className="flex justify-between font-semibold text-ink text-base border-t border-line pt-2">
            <span>Grand total</span>
            <span className="tabular-nums">{formatPrice(detail.grand_total)}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
