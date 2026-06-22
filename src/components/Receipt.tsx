"use client";

/**
 * Print-only bill component styled as an Indian restaurant GST invoice.
 *
 * The rest of the app is hidden during print via a `@media print` rule in
 * globals.css. User picks "Save as PDF" from their browser's print dialog
 * to get a real PDF — no heavyweight PDF libraries needed.
 */

import type { MenuItemAPI, OrderAPI } from "@/lib/api";
import { BRAND, formatPrice } from "@/lib/brand";
import { amountInWords } from "@/lib/amount-in-words";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function Receipt({
  order,
  menu,
}: {
  order: OrderAPI;
  menu: MenuItemAPI[];
}) {
  const menuMap = new Map(menu.map((m) => [m.id, m]));
  const placed = order.confirmed_at ?? order.created_at;
  const billNo = "CO-" + order.id.replace(/-/g, "").slice(0, 7).toUpperCase();

  // Indian bills always split GST into CGST + SGST (each half of the GST rate).
  // Our backend bundles GST as one line; derive the split here for the printed
  // invoice. Anything that isn't a GST line (e.g. service charge) is shown
  // as-is so the total always matches the server.
  type Line = { label: string; amount: number };
  const chargeLines: Line[] = [];
  for (const c of order.charges) {
    if (c.label.toLowerCase().startsWith("gst")) {
      chargeLines.push({ label: `CGST (${(c.rate * 50).toFixed(2)}%)`, amount: c.amount / 2 });
      chargeLines.push({ label: `SGST (${(c.rate * 50).toFixed(2)}%)`, amount: c.amount / 2 });
    } else {
      chargeLines.push({ label: c.label, amount: c.amount });
    }
  }
  const rounded = Math.round(order.total);
  const roundOff = rounded - order.total;

  return (
    <div className="receipt-print-area font-mono text-[11px] text-black bg-white p-6 w-full">
      <div className="max-w-[420px] mx-auto">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-serif text-2xl font-extrabold tracking-wide">
            {BRAND.name.toUpperCase()}
          </h1>
          <p className="text-[10px] mt-0.5 tracking-wider uppercase">
            {BRAND.cuisine}
          </p>
          <p className="text-[10px] mt-2 leading-tight">
            {BRAND.address.line1}
            <br />
            {BRAND.address.line2}
          </p>
          <p className="text-[10px] mt-1">
            Tel: {BRAND.phone} · {BRAND.website}
          </p>
          <div className="mt-2 text-[9px] uppercase tracking-widest">
            GSTIN: {BRAND.gstin}
            <br />
            FSSAI License No. {BRAND.fssai}
          </div>
        </div>

        <Divider />

        <h2 className="text-center font-bold tracking-[0.3em] text-[11px]">
          TAX INVOICE
        </h2>

        <Divider />

        {/* Bill meta */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <Row label="Bill No." value={billNo} />
          <Row label="Type" value={order.order_type === "dine_in" ? "Dine-In" : "Parcel"} />
          <Row label="Date" value={fmtDate(placed)} />
          <Row label="Status" value={order.status.replace("_", " ").toUpperCase()} />
        </div>

        <Divider />

        {/* Items */}
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-black/60">
              <th className="text-left py-1 font-semibold w-6">#</th>
              <th className="text-left py-1 font-semibold">Item</th>
              <th className="text-right py-1 font-semibold w-8">Qty</th>
              <th className="text-right py-1 font-semibold w-14">Rate</th>
              <th className="text-right py-1 font-semibold w-16">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => {
              const name = menuMap.get(it.menu_item_id)?.name ?? it.menu_item_id;
              const line = it.price_at_order * it.quantity;
              return (
                <tr key={it.id} className="align-top">
                  <td className="py-0.5 tabular-nums">{i + 1}</td>
                  <td className="py-0.5 pr-2">
                    <div>{name}</div>
                    {it.special_instructions && (
                      <div className="italic opacity-70">
                        Note: {it.special_instructions}
                      </div>
                    )}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{it.quantity}</td>
                  <td className="py-0.5 text-right tabular-nums">
                    {it.price_at_order.toFixed(2)}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">
                    {line.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <Divider />

        {/* Totals */}
        <div className="space-y-0.5">
          <TotalRow label="Subtotal" amount={order.subtotal} />
          {chargeLines.map((l) => (
            <TotalRow key={l.label} label={l.label} amount={l.amount} />
          ))}
          <div className="border-t border-black/40 mt-1 pt-1">
            <TotalRow
              label="Total (before round-off)"
              amount={order.total}
              muted
            />
            <TotalRow
              label="Round off"
              amount={roundOff}
              muted
              signed
            />
          </div>
          <div className="border-t-2 border-double border-black mt-1 pt-1">
            <TotalRow label="GRAND TOTAL" amount={rounded} bold />
          </div>
        </div>

        <Divider />

        <p className="text-[10px] italic leading-snug">
          {amountInWords(rounded)}.
        </p>

        <Divider />

        <div className="text-[10px] leading-snug space-y-1">
          <p>
            Taxes declared under applicable CGST &amp; SGST rules. Service
            charge is a discretionary charge retained by the restaurant.
          </p>
          <p>
            Items served subject to availability. No refunds once consumed.
          </p>
        </div>

        <Divider />

        <div className="text-center text-[11px] font-semibold tracking-wide">
          Thank you for dining with us.
          <div className="text-[9px] font-normal mt-1 tracking-widest uppercase">
            We hope to see you again soon
          </div>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-dashed border-black/60 my-2" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wider opacity-70">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function TotalRow({
  label,
  amount,
  bold,
  muted,
  signed,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  muted?: boolean;
  signed?: boolean;
}) {
  const cls = [
    "flex justify-between tabular-nums",
    bold ? "font-bold text-[13px]" : "",
    muted ? "opacity-70" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <span>{label}</span>
      <span>
        {signed && amount >= 0 ? "+ " : signed ? "− " : ""}
        {formatPrice(Math.abs(amount))}
      </span>
    </div>
  );
}
