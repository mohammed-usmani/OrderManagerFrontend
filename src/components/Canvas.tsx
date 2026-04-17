"use client";

/**
 * Voice-driven canvas.
 *
 * Renders whatever the agent asked the UI to show: menu results, the cart,
 * order history, or a confirmation screen. The agent's spoken reply is a
 * summary; this is where the details live.
 */

import { useState } from "react";
import {
  type CanvasState,
  type MenuItemCard,
  type OrderCard,
  useVoiceAgent,
} from "@/contexts/VoiceAgentContext";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";

const CATEGORY_ACCENT: Record<string, string> = {
  starters: "from-amber-500/60 to-orange-500/40",
  mains: "from-rose-600/60 to-red-500/40",
  breads: "from-yellow-600/50 to-amber-500/40",
  rice: "from-lime-600/50 to-green-500/40",
  desserts: "from-fuchsia-500/50 to-pink-500/40",
  beverages: "from-sky-500/50 to-cyan-500/40",
};

const STATUS_BADGE: Record<string, string> = {
  cart: "bg-zinc-700/50 text-zinc-200 border-zinc-600/50",
  confirmed: "bg-primary/15 text-primary border-primary/30",
  awaiting_payment: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

function DishCard({ item }: { item: MenuItemCard }) {
  const accent = CATEGORY_ACCENT[item.category] ?? "from-zinc-500/40 to-zinc-600/30";
  const { token } = useAuth();
  const { setCartView } = useVoiceAgent();
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addToCart = async () => {
    if (!token || !item.available) return;
    setAdding(true);
    setErr(null);
    try {
      const order = await api.addItemToCart(token, item.id, 1);
      // Reuse the voice agent's cart_view canvas state so the order card
      // updates in-place, same visual as when Arjun adds an item.
      setCartView(order as unknown as OrderCard);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/10 bg-surface-container/50 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-surface-container/70">
      {/* Image (if available) falls back to accent gradient */}
      <div className={`h-40 relative bg-gradient-to-br ${accent}`}>
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              console.warn(
                `[DishCard] image failed to load for ${item.id} ${item.name}: ${img.src}`
              );
              img.style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)]" />
        )}
        {/* Dark bottom scrim so labels stay legible over any image */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <span className="absolute top-3 left-4 text-[10px] font-bold uppercase tracking-widest text-white font-headline drop-shadow">
          {item.category}
        </span>
        <span className="absolute top-3 right-4 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-mono text-white/80 backdrop-blur-sm">
          {item.id}
        </span>
      </div>

      <div className="px-5 py-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-headline font-bold text-white text-base leading-tight">
            {item.name}
          </h3>
          <p className="font-headline font-extrabold text-primary whitespace-nowrap">
            ₹{item.price}
          </p>
        </div>

        {item.description && (
          <p className="text-on-surface-variant text-xs leading-relaxed line-clamp-3">
            {item.description}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5 pt-1">
          {item.serving && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-on-surface-variant">
              {item.serving}
            </span>
          )}
          {item.spice_level && (
            <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">
              {item.spice_level}
            </span>
          )}
          {item.dietary?.map((d) => (
            <span
              key={d}
              className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300"
            >
              {d}
            </span>
          ))}
        </div>

        {/* Tap-to-add fallback for customers who can't (or don't want to)
             speak to the agent. Voice path still works in parallel. */}
        <div className="pt-3">
          <button
            onClick={addToCart}
            disabled={!item.available || adding}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
              !item.available
                ? "bg-white/5 text-on-surface-variant cursor-not-allowed"
                : justAdded
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-primary text-on-primary hover:brightness-110 active:scale-95 shadow-lg shadow-primary/20"
            } disabled:opacity-50`}
          >
            {!item.available ? (
              "Unavailable"
            ) : adding ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">
                  progress_activity
                </span>
                Adding…
              </>
            ) : justAdded ? (
              <>
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check
                </span>
                Added
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">add</span>
                Add to cart
              </>
            )}
          </button>
          {err && (
            <p className="text-error text-[10px] mt-2 text-center">{err}</p>
          )}
        </div>
      </div>
    </article>
  );
}

function OrderLineItem({ name, quantity, lineTotal, note }: {
  name: string;
  quantity: number;
  lineTotal: number;
  note: string | null;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-on-surface-variant shrink-0">
        {quantity}×
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">{name}</p>
        {note && <p className="text-on-surface-variant text-xs italic mt-0.5">{note}</p>}
      </div>
      <p className="font-headline font-bold text-white text-sm whitespace-nowrap">
        ₹{lineTotal}
      </p>
    </div>
  );
}

function OrderSummaryCard({
  order,
  title,
  highlight,
}: {
  order: OrderCard;
  title?: string;
  highlight?: boolean;
}) {
  const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.cart;
  const border = highlight ? "border-primary/40 ring-1 ring-primary/20" : "border-white/10";
  return (
    <article
      className={`rounded-2xl border ${border} bg-surface-container/50 backdrop-blur-xl overflow-hidden`}
    >
      <header className="flex items-center justify-between px-5 py-3 border-b border-white/5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline">
            {title ?? "Order"} · #{order.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-on-surface-variant text-xs mt-0.5">
            {formatDate(order.created_at)}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest font-headline ${badge}`}
        >
          {order.status.replace("_", " ")}
        </span>
      </header>

      {order.items.length > 0 ? (
        <div className="px-5 divide-y divide-white/5">
          {order.items.map((it) => (
            <OrderLineItem
              key={it.id}
              name={it.name}
              quantity={it.quantity}
              lineTotal={it.line_total}
              note={it.special_instructions}
            />
          ))}
        </div>
      ) : (
        <div className="px-5 py-6 text-center text-on-surface-variant text-sm">
          Empty
        </div>
      )}

      {order.items.length > 0 && (
        <div className="px-5 py-3 border-t border-white/5 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Subtotal</span>
            <span className="text-white font-medium">
              ₹{order.subtotal.toFixed(2)}
            </span>
          </div>
          {order.charges.map((c) => (
            <div key={c.label} className="flex justify-between">
              <span className="text-on-surface-variant">{c.label}</span>
              <span className="text-white font-medium">
                ₹{c.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      <footer className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-black/20">
        <span className="text-on-surface-variant text-xs">
          {order.item_count} item{order.item_count === 1 ? "" : "s"} · incl. charges
        </span>
        <span className="font-headline font-extrabold text-white text-lg">
          ₹{order.total.toFixed(2)}
        </span>
      </footer>
    </article>
  );
}

// --- Canvas root --------------------------------------------------------

export function Canvas({ canvas }: { canvas: CanvasState }) {
  if (canvas.kind === "idle") {
    return <IdleState />;
  }

  if (canvas.kind === "menu_results") {
    return (
      <section className="space-y-4">
        <CanvasHeader title={canvas.title} subtitle={`${canvas.items.length} item(s)`} />
        {canvas.items.length === 0 ? (
          <EmptyState icon="search_off" message="No dishes found." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {canvas.items.map((item) => (
              <DishCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    );
  }

  if (canvas.kind === "cart_view") {
    return (
      <section className="space-y-4">
        <CanvasHeader title="Your Cart" subtitle={`${canvas.order.item_count} item(s)`} />
        <OrderSummaryCard order={canvas.order} title="Cart" />
      </section>
    );
  }

  if (canvas.kind === "orders_list") {
    const counts = Object.entries(canvas.counts)
      .sort()
      .map(([status, n]) => `${n} ${status.replace("_", " ")}`)
      .join(" · ");
    return (
      <section className="space-y-4">
        <CanvasHeader title={canvas.title} subtitle={counts} />
        {canvas.orders.length === 0 ? (
          <EmptyState icon="inbox" message="No orders in this view." />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {canvas.orders.map((o) => (
              <OrderSummaryCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </section>
    );
  }

  if (canvas.kind === "session_end") {
    return (
      <section className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <span
            className="material-symbols-outlined text-on-surface-variant text-3xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            waving_hand
          </span>
        </div>
        <div>
          <h3 className="font-headline font-extrabold text-white text-lg">
            Conversation ended
          </h3>
          <p className="text-on-surface-variant text-sm max-w-sm mt-2 leading-relaxed">
            Tap the mic below anytime to start a new conversation.
          </p>
        </div>
      </section>
    );
  }

  if (canvas.kind === "order_confirmed") {
    return (
      <section className="space-y-5">
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center ring-2 ring-primary/40 shadow-2xl shadow-primary/30">
              <span
                className="material-symbols-outlined text-primary text-4xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
            </div>
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl -z-10" />
          </div>
          <h2 className="font-headline font-extrabold text-2xl text-white">
            Order Confirmed
          </h2>
          <p className="text-on-surface-variant text-sm">
            The kitchen has your order. Estimated prep time 20–25 minutes.
          </p>
        </div>
        <OrderSummaryCard order={canvas.order} title="Confirmed" highlight />
      </section>
    );
  }

  return null;
}

function CanvasHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="font-headline font-extrabold text-xl text-white">{title}</h2>
      {subtitle && (
        <p className="text-on-surface-variant text-xs mt-1 uppercase tracking-wider font-headline">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-white/10">
      <span className="material-symbols-outlined text-on-surface-variant text-4xl mb-3">
        {icon}
      </span>
      <p className="text-on-surface-variant text-sm">{message}</p>
    </div>
  );
}

function IdleState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="w-16 h-16 rounded-full glass-panel flex items-center justify-center">
        <span
          className="material-symbols-outlined text-primary text-3xl"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
      </div>
      <div>
        <h3 className="font-headline font-extrabold text-white text-lg">
          Talk to Arjun
        </h3>
        <p className="text-on-surface-variant text-sm max-w-sm mt-2 leading-relaxed">
          Tap the mic and ask about the menu, place an order, or check your
          history. Results show up here as you speak.
        </p>
      </div>
    </div>
  );
}
