"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type OrderAPI, type MenuItemAPI } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { AppShell } from "@/components/AppShell";
import { Receipt } from "@/components/Receipt";
import { BRAND, formatPrice } from "@/lib/brand";

// Category-based color palettes for item avatars
const CATEGORY_COLORS: Record<string, string> = {
  starters: "from-amber-600 to-orange-500",
  mains: "from-red-700 to-rose-500",
  breads: "from-yellow-700 to-amber-500",
  rice: "from-lime-700 to-green-500",
  desserts: "from-purple-600 to-pink-500",
  beverages: "from-blue-600 to-cyan-500",
};

const CATEGORY_ICONS: Record<string, string> = {
  starters: "lunch_dining",
  mains: "restaurant",
  breads: "bakery_dining",
  rice: "rice_bowl",
  desserts: "cake",
  beverages: "local_bar",
};

function OrderIdBadge({ id }: { id: string }) {
  const short = `#CO-${id.replace(/-/g, "").slice(0, 7).toUpperCase()}`;
  return (
    <span className="font-headline font-extrabold text-white tracking-wide">{short}</span>
  );
}

export default function OrderConfirmationPage() {
  const { isAuthenticated, token } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderAPI | null>(null);
  const [menu, setMenu] = useState<MenuItemAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/signin");
      return;
    }
    Promise.all([api.getOrder(orderId, token!), api.getMenu()])
      .then(([ord, menuItems]) => {
        setOrder(ord);
        setMenu(menuItems);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isAuthenticated, token, orderId, router]);

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (error || !order) {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <span className="material-symbols-outlined text-error text-5xl">error</span>
          <p className="text-on-surface-variant text-sm">{error || "Order not found"}</p>
          <button
            onClick={() => router.push("/orders")}
            className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-headline font-bold text-xs uppercase tracking-widest"
          >
            Back to Orders
          </button>
        </div>
      </AppShell>
    );
  }

  const menuMap = new Map(menu.map((m) => [m.id, m]));
  // Bill is computed server-side so it always matches what the agent quoted.
  const total = order.total;
  const eventDate = order.confirmed_at ?? order.created_at;

  const handleAddToCalendar = () => {
    const dt = new Date(eventDate);
    const start = dt.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const end = new Date(dt.getTime() + 90 * 60 * 1000)
      .toISOString()
      .replace(/[-:]/g, "")
      .split(".")[0] + "Z";
    const url =
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(`Dinner at ${BRAND.name}`)}` +
      `&dates=${start}/${end}` +
      `&details=${encodeURIComponent(`Order #${orderId}`)}` +
      `&location=${encodeURIComponent(`${BRAND.address.line1}, ${BRAND.address.line2}`)}`;
    window.open(url, "_blank", "noopener");
  };

  const handleShare = async () => {
    const text = `My order at ${BRAND.name} — Total: ${formatPrice(total)}`;
    if (navigator.share) {
      await navigator.share({ title: "Order Summary", text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  const handleDownloadReceipt = () => {
    // Browsers use document.title as the default save-as-PDF filename.
    const prevTitle = document.title;
    const billNo = "CO-" + order.id.replace(/-/g, "").slice(0, 7).toUpperCase();
    document.title = `${BRAND.name} · Bill ${billNo}`;
    // Give React a tick to flush the title change before the print dialog.
    setTimeout(() => {
      window.print();
      document.title = prevTitle;
    }, 50);
  };

  return (
    <AppShell>
      <main className="flex-1 mt-16 md:mt-0 pb-28 md:pb-8 max-w-md mx-auto w-full px-4">
        {/* Hero */}
        <div className="flex flex-col items-center pt-12 pb-8 text-center">
          {/* Back button */}
          <button
            onClick={() => router.push("/orders")}
            className="self-start flex items-center gap-1 text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-8 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Orders
          </button>

          {/* Checkmark */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-2 ring-primary/30 shadow-2xl shadow-primary/20">
              <span
                className="material-symbols-outlined text-primary text-4xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
            </div>
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
          </div>

          <h1 className="font-headline font-extrabold text-3xl text-white mb-2">
            Order Confirmed
          </h1>
          <p className="text-on-surface-variant text-sm max-w-xs leading-relaxed">
            Arjun has sent your order to the kitchen.
          </p>
        </div>

        {/* Meta */}
        <div className="glass-panel rounded-2xl px-5 py-4 mb-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline mb-1">
              Order ID
            </p>
            <OrderIdBadge id={order.id} />
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline mb-1">
              Date &amp; Time
            </p>
            <p className="text-white font-headline font-bold text-sm">
              {formatDateTime(eventDate)}
            </p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="glass-panel rounded-2xl overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-white/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline">
              Order Summary
            </p>
          </div>

          <div className="divide-y divide-white/5">
            {order.items.map((item) => {
              const menuItem = menuMap.get(item.menu_item_id);
              const lineTotal = item.price_at_order * item.quantity;
              const category = menuItem?.category ?? "mains";
              const gradient = CATEGORY_COLORS[category] ?? "from-zinc-600 to-zinc-500";
              const icon = CATEGORY_ICONS[category] ?? "restaurant";

              return (
                <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div
                    className={`w-12 h-12 rounded-full flex-shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}
                  >
                    <span
                      className="material-symbols-outlined text-white text-[20px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {icon}
                    </span>
                  </div>

                  {/* Name + quantity */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-headline font-bold text-sm truncate">
                      {menuItem?.name ?? item.menu_item_id}
                    </p>
                    <p className="text-on-surface-variant text-xs mt-0.5">
                      {item.quantity} × {formatPrice(item.price_at_order)}
                    </p>
                    {item.special_instructions && (
                      <p className="text-on-surface-variant text-xs mt-0.5 italic truncate">
                        {item.special_instructions}
                      </p>
                    )}
                  </div>

                  {/* Line total */}
                  <p className="font-headline font-extrabold text-white text-sm flex-shrink-0">
                    {formatPrice(lineTotal)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Totals — sourced directly from the server so the customer sees
               the same number the voice agent quoted. */}
          <div className="border-t border-white/10 px-5 py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Subtotal</span>
              <span className="text-white font-medium">{formatPrice(order.subtotal)}</span>
            </div>
            {order.charges.map((charge) => (
              <div key={charge.label} className="flex justify-between text-sm">
                <span className="text-on-surface-variant">{charge.label}</span>
                <span className="text-white font-medium">{formatPrice(charge.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2 border-t border-white/5">
              <span className="font-headline font-extrabold text-white">Total</span>
              <span className="font-headline font-extrabold text-white text-lg">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 mb-4">
          <button
            onClick={handleDownloadReceipt}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-primary text-on-primary font-headline font-bold text-sm tracking-wide shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              receipt_long
            </span>
            Download Bill (PDF)
          </button>

          <button
            onClick={handleShare}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl glass-panel text-white font-headline font-bold text-sm tracking-wide hover:border-white/20 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">share</span>
            Share Summary
          </button>
        </div>

        {/* Dining Destination */}
        <div className="glass-panel rounded-2xl overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-white/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline">
              Dining Destination
            </p>
          </div>

          {/* Restaurant image placeholder */}
          <div className="relative h-36 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            {/* Decorative ambient lights */}
            <div className="absolute top-4 left-8 w-16 h-16 rounded-full bg-amber-600/20 blur-2xl" />
            <div className="absolute bottom-4 right-8 w-20 h-12 rounded-full bg-orange-700/20 blur-2xl" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="material-symbols-outlined text-amber-500/60 text-[64px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                storefront
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-headline font-bold text-white">{BRAND.name}</p>
              <p className="text-on-surface-variant text-xs mt-0.5">
                {BRAND.address.line1}, {BRAND.address.line2}
              </p>
            </div>
            <button
              onClick={() =>
                window.open(
                  `https://maps.google.com/?q=${BRAND.address.mapsQuery}`,
                  "_blank",
                  "noopener"
                )
              }
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold uppercase tracking-widest hover:bg-primary/20 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>navigation</span>
              Navigate
            </button>
          </div>
        </div>

        {/* AI Insight */}
        <div className="glass-panel rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="material-symbols-outlined text-secondary text-[16px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              auto_awesome
            </span>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline">
              AI Insight
            </p>
          </div>
          <p className="text-on-surface-variant text-sm leading-relaxed italic">
            &ldquo;Your wine pairing recommendation has been sent to the
            Sommelier. Based on your selection, a 2018 Barolo has been
            reserved.&rdquo;
          </p>
        </div>

        {/* Add to Calendar */}
        <button
          onClick={handleAddToCalendar}
          className="w-full glass-panel rounded-2xl flex items-center gap-4 px-5 py-4 hover:border-white/15 active:scale-95 transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center flex-shrink-0">
            <span
              className="material-symbols-outlined text-tertiary text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              calendar_add_on
            </span>
          </div>
          <div className="text-left">
            <p className="font-headline font-bold text-white text-sm">Add to Calendar</p>
            <p className="text-on-surface-variant text-xs mt-0.5">Apple, Google, Outlook</p>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant text-[18px] ml-auto">
            arrow_forward_ios
          </span>
        </button>
      </main>

      {/* Hidden on screen; becomes the ONLY visible content during print. */}
      <Receipt order={order} menu={menu} />
    </AppShell>
  );
}
