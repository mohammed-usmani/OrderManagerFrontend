"use client";

/**
 * Voice-driven canvas.
 *
 * Renders whatever the agent asked the UI to show: menu results, the cart,
 * order history, or a confirmation screen. The agent's spoken reply is a
 * summary; this is where the details live. Ordering is voice-first — the cart
 * is owned by the agent (it identifies the caller mid-conversation), so dish
 * cards guide the caller to *say* what they want rather than tap.
 */

import {
  type CanvasState,
  type CustomerCard,
  type MenuItemCard,
  type OrderCard,
} from "@/contexts/VoiceAgentContext";
import { formatDate } from "@/lib/datetime";

// Warm, tandoor-leaning accents per category (used behind missing photos).
const CATEGORY_ACCENT: Record<string, string> = {
  starters: "from-amber-600/50 to-orange-700/30",
  mains: "from-orange-700/55 to-red-800/35",
  breads: "from-yellow-600/45 to-amber-700/30",
  rice: "from-lime-700/35 to-amber-700/25",
  desserts: "from-rose-700/45 to-amber-600/25",
  beverages: "from-amber-500/40 to-yellow-700/25",
};

const STATUS_BADGE: Record<string, string> = {
  cart: "bg-white/5 text-on-surface-variant border-white/10",
  confirmed: "bg-primary/15 text-primary border-primary/30",
  awaiting_payment: "bg-tertiary/15 text-tertiary border-tertiary/30",
  paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-error/15 text-error border-error/30",
};

function spiceLevel(label: string | null): number {
  if (!label) return 0;
  const l = label.toLowerCase();
  if (l.includes("hot") || l.includes("spicy")) return 3;
  if (l.includes("medium")) return 2;
  if (l.includes("mild")) return 1;
  return 0;
}

function DishCard({ item, index = 0 }: { item: MenuItemCard; index?: number }) {
  const accent = CATEGORY_ACCENT[item.category] ?? "from-amber-700/40 to-stone-700/30";
  const heat = spiceLevel(item.spice_level);

  return (
    <article
      className="reveal group relative overflow-hidden rounded-2xl ember-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_18px_50px_-20px_rgba(255,106,26,0.45)]"
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
    >
      <div className={`h-44 relative bg-gradient-to-br ${accent}`}>
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.07]"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,200,120,0.18),transparent_60%)]" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#140f09] via-[#140f09]/55 to-transparent" />
        <span className="absolute top-3 left-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-on-surface drop-shadow">
          {item.category}
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-black/45 px-2 py-0.5 font-mono text-[10px] text-on-surface/80 backdrop-blur-sm ring-1 ring-white/10">
          {item.id}
        </span>
        {item.popularity != null && item.popularity >= 4.5 && (
          <span className="absolute bottom-3 left-4 inline-flex items-center gap-1 rounded-full bg-tertiary/20 px-2 py-0.5 text-[10px] font-semibold text-tertiary ring-1 ring-tertiary/30 backdrop-blur-sm">
            <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
            Favourite
          </span>
        )}
      </div>

      <div className="px-5 py-4 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-headline font-semibold text-on-surface text-lg leading-tight">
            {item.name}
          </h3>
          <p className="font-headline font-semibold text-secondary text-lg whitespace-nowrap tabular-nums">
            ₹{item.price}
          </p>
        </div>

        {item.description && (
          <p className="text-on-surface-variant text-xs leading-relaxed line-clamp-2">
            {item.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {heat > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5">
              {Array.from({ length: heat }).map((_, i) => (
                <span
                  key={i}
                  className="material-symbols-outlined text-[12px] text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  local_fire_department
                </span>
              ))}
            </span>
          )}
          {item.serving && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-on-surface-variant">
              {item.serving}
            </span>
          )}
          {item.dietary?.map((d) => (
            <span
              key={d}
              className="rounded-full border border-secondary/25 bg-secondary/10 px-2 py-0.5 text-[10px] text-secondary-fixed"
            >
              {d}
            </span>
          ))}
        </div>

        <div className="pt-2">
          {item.available ? (
            <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
              <span
                className="material-symbols-outlined text-[15px] text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                mic
              </span>
              Just say <span className="text-on-surface font-medium">“add {item.name}”</span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-error/80">
              Sold out
            </span>
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
      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0 tabular-nums">
        {quantity}×
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-on-surface text-sm font-medium">{name}</p>
        {note && <p className="text-on-surface-variant text-xs italic mt-0.5">{note}</p>}
      </div>
      <p className="font-headline font-semibold text-on-surface text-sm whitespace-nowrap tabular-nums">
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
    <article className={`reveal rounded-2xl border ${border} ember-card overflow-hidden`}>
      <header className="flex items-center justify-between px-5 py-3 border-b border-white/5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant">
            {title ?? "Order"} · <span className="font-mono">#{order.id.slice(0, 8).toUpperCase()}</span>
          </p>
          <p className="text-on-surface-variant text-xs mt-0.5">
            {formatDate(order.created_at)}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${badge}`}>
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
        <div className="px-5 py-8 text-center text-on-surface-variant text-sm">
          Nothing here yet — tell Arjun what you’d like.
        </div>
      )}

      {order.items.length > 0 && (
        <div className="px-5 py-3 border-t border-white/5 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Subtotal</span>
            <span className="text-on-surface font-medium tabular-nums">₹{order.subtotal.toFixed(2)}</span>
          </div>
          {order.charges.map((c) => (
            <div key={c.label} className="flex justify-between">
              <span className="text-on-surface-variant">{c.label}</span>
              <span className="text-on-surface font-medium tabular-nums">₹{c.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-black/20">
        <span className="text-on-surface-variant text-xs">
          {order.item_count} item{order.item_count === 1 ? "" : "s"} · incl. charges
        </span>
        <span className="font-headline font-semibold text-secondary text-xl tabular-nums">
          ₹{order.total.toFixed(2)}
        </span>
      </footer>
    </article>
  );
}

// --- Canvas root --------------------------------------------------------

export function Canvas({ canvas }: { canvas: CanvasState }) {
  if (canvas.kind === "idle") return <IdleState />;

  if (canvas.kind === "menu_results") {
    return (
      <section className="space-y-5">
        <CanvasHeader title={canvas.title} subtitle={`${canvas.items.length} dish${canvas.items.length === 1 ? "" : "es"}`} />
        {canvas.items.length === 0 ? (
          <EmptyState icon="search_off" message="No dishes match that — try another flavour." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {canvas.items.map((item, i) => (
              <DishCard key={item.id} item={item} index={i} />
            ))}
          </div>
        )}
      </section>
    );
  }

  if (canvas.kind === "cart_view") {
    return (
      <section className="space-y-5 max-w-2xl mx-auto w-full">
        <CanvasHeader title="Your order" subtitle={`${canvas.order.item_count} item(s) in progress`} />
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
      <section className="space-y-5">
        <CanvasHeader title={canvas.title} subtitle={counts} />
        {canvas.orders.length === 0 ? (
          <EmptyState icon="inbox" message="No orders in this view yet." />
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

  if (canvas.kind === "customer_card") {
    return (
      <section className="max-w-md mx-auto w-full">
        <CustomerProfileCard customer={canvas.customer} />
      </section>
    );
  }

  if (canvas.kind === "delivery_check") {
    return (
      <section className="max-w-md mx-auto w-full">
        <DeliveryCheckCard
          query={canvas.query}
          serviceable={canvas.serviceable}
          matched={canvas.matched}
        />
      </section>
    );
  }

  if (canvas.kind === "session_end") {
    const isTimeLimit = canvas.reason === "time_limit";
    const isBusy = canvas.reason === "busy" || canvas.reason === "rate_limit";
    const isMicError = canvas.reason === "mic_error";
    const icon = isTimeLimit
      ? "timer_off"
      : isBusy
        ? "hourglass_top"
        : isMicError
          ? "mic_off"
          : "waving_hand";
    const title = isTimeLimit
      ? "That’s the call limit"
      : isBusy
        ? "All lines are busy"
        : isMicError
          ? "Microphone needed"
          : "Until next time";
    const tone =
      isTimeLimit || isBusy || isMicError ? "text-primary" : "text-tertiary";
    const message =
      canvas.message ?? "Tap the mic below whenever you’re hungry again.";
    return (
      <section className="flex flex-col items-center justify-center py-24 text-center gap-4 reveal">
        <div className="w-16 h-16 rounded-full ember-card flex items-center justify-center">
          <span className={`material-symbols-outlined ${tone} text-3xl`} style={{ fontVariationSettings: "'FILL' 1" }}>
            {icon}
          </span>
        </div>
        <div>
          <h3 className="font-headline font-semibold text-on-surface text-2xl">{title}</h3>
          <p className="text-on-surface-variant text-sm max-w-md mt-2 leading-relaxed">
            {message}
          </p>
        </div>
      </section>
    );
  }

  if (canvas.kind === "order_confirmed") {
    return (
      <section className="space-y-6 max-w-2xl mx-auto w-full">
        <div className="flex flex-col items-center text-center gap-3 py-6 reveal">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/40 to-primary/5 flex items-center justify-center ring-2 ring-primary/40 animate-breathe">
              <span className="material-symbols-outlined text-primary text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                local_shipping
              </span>
            </div>
            <div className="absolute inset-0 rounded-full bg-primary/25 blur-3xl -z-10" />
          </div>
          <h2 className="font-headline font-semibold text-3xl text-on-surface">Order on its way</h2>
          <p className="text-on-surface-variant text-sm max-w-sm">
            The kitchen has it. Fresh off the tandoor and out for delivery in about 30–40 minutes.
          </p>
        </div>
        <OrderSummaryCard order={canvas.order} title="Confirmed" highlight />
      </section>
    );
  }

  return null;
}

function CustomerProfileCard({ customer }: { customer: CustomerCard }) {
  const addr = [customer.address_line, customer.area, customer.pincode]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="reveal ember-card rounded-2xl overflow-hidden">
      <div className="px-6 pt-6 pb-5 text-center border-b border-white/5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-on-surface-variant mb-2">
          {customer.order_count > 0 ? "Welcome back" : "New regular"}
        </p>
        <h3 className="font-headline font-semibold text-on-surface text-2xl">
          {customer.name || "Guest"}
        </h3>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 ring-1 ring-primary/25 px-3 py-1">
          <span className="material-symbols-outlined text-primary text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            confirmation_number
          </span>
          <span className="font-mono text-primary text-sm tracking-[0.3em]">{customer.code}</span>
        </div>
      </div>
      <div className="px-6 py-4 space-y-3 text-sm">
        {customer.phone && (
          <ProfileRow icon="call" label="Phone" value={customer.phone} />
        )}
        {addr && <ProfileRow icon="location_on" label="Deliver to" value={addr} />}
        {customer.landmark && (
          <ProfileRow icon="signpost" label="Landmark" value={customer.landmark} />
        )}
        {customer.preferences && (
          <ProfileRow icon="favorite" label="Likes" value={customer.preferences} tint="tertiary" />
        )}
        {customer.allergies && (
          <ProfileRow icon="warning" label="Avoid" value={customer.allergies} tint="error" />
        )}
        {customer.order_count > 0 && (
          <ProfileRow
            icon="receipt_long"
            label="History"
            value={`${customer.order_count} order${customer.order_count === 1 ? "" : "s"} with us`}
          />
        )}
      </div>
    </div>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  tint,
}: {
  icon: string;
  label: string;
  value: string;
  tint?: "tertiary" | "error";
}) {
  const tone =
    tint === "tertiary" ? "text-tertiary" : tint === "error" ? "text-error" : "text-primary";
  return (
    <div className="flex items-start gap-3">
      <span className={`material-symbols-outlined text-[18px] mt-0.5 ${tone}`} style={{ fontVariationSettings: "'FILL' 1" }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">{label}</p>
        <p className="text-on-surface leading-snug">{value}</p>
      </div>
    </div>
  );
}

function DeliveryCheckCard({
  query,
  serviceable,
  matched,
}: {
  query: string;
  serviceable: boolean;
  matched: string | null;
}) {
  return (
    <div
      className={`reveal ember-card rounded-2xl p-6 text-center ${
        serviceable ? "ring-1 ring-emerald-500/25" : "ring-1 ring-error/25"
      }`}
    >
      <div
        className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
          serviceable ? "bg-emerald-500/15" : "bg-error/15"
        }`}
      >
        <span
          className={`material-symbols-outlined text-3xl ${serviceable ? "text-emerald-400" : "text-error"}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {serviceable ? "where_to_vote" : "wrong_location"}
        </span>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-on-surface-variant mb-1">
        Delivery check
      </p>
      <h3 className="font-headline font-semibold text-on-surface text-2xl capitalize">{query}</h3>
      {serviceable ? (
        <p className="text-on-surface-variant text-sm mt-2">
          Yes — we deliver here{matched ? ` (${matched})` : ""}. 🛵
        </p>
      ) : (
        <p className="text-on-surface-variant text-sm mt-2">
          Sorry, that’s outside our delivery range from Bandra West.
        </p>
      )}
    </div>
  );
}

function CanvasHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="reveal">
      <h2 className="font-headline font-semibold text-2xl text-on-surface">{title}</h2>
      {subtitle && (
        <p className="text-on-surface-variant text-[11px] mt-1 uppercase tracking-[0.18em]">{subtitle}</p>
      )}
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-white/10">
      <span className="material-symbols-outlined text-on-surface-variant text-4xl mb-3">{icon}</span>
      <p className="text-on-surface-variant text-sm">{message}</p>
    </div>
  );
}

function IdleState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="w-16 h-16 rounded-full ember-card flex items-center justify-center">
        <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
          local_fire_department
        </span>
      </div>
      <div>
        <h3 className="font-headline font-semibold text-on-surface text-2xl">Talk to Arjun</h3>
        <p className="text-on-surface-variant text-sm max-w-sm mt-2 leading-relaxed">
          Tap the mic and ask about the menu or place an order. Everything you say shows up here.
        </p>
      </div>
    </div>
  );
}
