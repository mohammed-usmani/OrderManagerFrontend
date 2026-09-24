"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type OrderAPI } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { formatPrice } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";

const STATUS_STYLE: Record<string, { label: string; classes: string; icon: string }> = {
  cart: { label: "In Cart", classes: "bg-zinc-700/50 text-zinc-300", icon: "shopping_cart" },
  confirmed: { label: "Confirmed", classes: "bg-primary/10 text-primary border border-primary/20", icon: "check_circle" },
  awaiting_payment: { label: "Awaiting Payment", classes: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20", icon: "schedule" },
  paid: { label: "Paid", classes: "bg-green-500/10 text-green-400 border border-green-500/20", icon: "verified" },
  cancelled: { label: "Cancelled", classes: "bg-error/10 text-error border border-error/20", icon: "cancel" },
};

export default function OrdersPage() {
  const { isAuthenticated, ready, user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace("/auth/signin");
      return;
    }
    if (user?.is_admin) {
      // Admins don't have personal orders — send them to the Kitchen view.
      router.replace("/admin/orders");
      return;
    }
    api
      .getOrders()
      .then((data) => {
        // Show all orders that have items; hide empty carts
        setOrders(data.filter((o) => o.status !== "cart" || o.items.length > 0));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ready, isAuthenticated, user, router]);

  if (!isAuthenticated) return null;

  return (
    <AppShell>
      <main className="flex-1 mt-16 md:mt-0 mb-24 md:mb-0 px-4 max-w-2xl mx-auto w-full">
        <div className="py-6 space-y-2">
          <h2 className="font-headline font-extrabold text-2xl text-white mb-6">Your Orders</h2>

          {loading && (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-error/10 border border-error/20">
              <span className="material-symbols-outlined text-error text-[18px]">error</span>
              <p className="text-error text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-full glass-panel flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-on-surface-variant text-3xl">
                  receipt_long
                </span>
              </div>
              <p className="text-on-surface-variant text-sm">No orders yet.</p>
              <button
                onClick={() => router.push("/chat")}
                className="mt-4 px-6 py-2.5 rounded-full bg-primary text-on-primary font-headline font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:brightness-110 transition-all"
              >
                Start Ordering
              </button>
            </div>
          )}

          {orders.map((order) => {
            const s = STATUS_STYLE[order.status] ?? STATUS_STYLE.cart;
            const total = order.total;
            const isClickable = order.status === "confirmed" || order.status === "paid";
            return (
              <div
                key={order.id}
                onClick={() =>
                  isClickable && router.push(`/orders/${order.id}/confirmation`)
                }
                className={`glass-panel rounded-2xl p-5 space-y-3 ${
                  isClickable ? "cursor-pointer hover:border-white/15 transition-all" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-headline font-bold text-white text-sm">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="text-on-surface-variant text-xs">
                      {formatDate(order.created_at)}
                    </p>
                  </div>
                  <span
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest font-headline ${s.classes}`}
                  >
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {s.icon}
                    </span>
                    {s.label}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <p className="text-on-surface-variant text-xs">
                    {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                  </p>
                  <p className="font-headline font-extrabold text-white">
                    {formatPrice(total)}
                  </p>
                </div>

                {isClickable && (
                  <div className="flex items-center gap-1 text-primary text-xs font-bold">
                    <span>View confirmation</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
