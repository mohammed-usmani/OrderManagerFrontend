"use client";

import { useEffect, useState } from "react";
import { api, type PaymentTargetAPI } from "@/lib/api";
import { Button, Modal, Input } from "@/components/admin/ui";
import { formatPrice } from "@/lib/brand";
import { loadRazorpay, openRazorpay } from "@/lib/razorpay";

/**
 * Reusable settle/checkout dialog. Used by the cashier (dine-in session or a
 * delivered parcel order, `allowCash`) and by the dine-in guest paying from
 * their phone (online only, no token).
 */
export function BillingModal({
  target,
  title,
  subtitle,
  token,
  allowCash = true,
  restaurantName = "Saffron & Smoke",
  onClose,
  onPaid,
}: {
  target: { order_id?: string; session_id?: string };
  title: string;
  subtitle?: string;
  token?: string | null;
  allowCash?: boolean;
  restaurantName?: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [base, setBase] = useState<number | null>(null);
  const [tip, setTip] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.paymentQuote(target)
      .then((q) => setBase(q.amount_due))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    api.getPaymentConfig().then((c) => setOnline(c.razorpay_enabled)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amount = base == null ? null : Math.max(0, base + tip - discount);
  const payload = (): PaymentTargetAPI => ({ ...target, tip, discount });

  const payCash = async () => {
    if (!token) return;
    setBusy(true);
    setErr("");
    try {
      await api.settleCash(token, payload());
      onPaid();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const payOnline = async () => {
    setBusy(true);
    setErr("");
    try {
      const co = await api.createRazorpayCheckout(payload());
      await loadRazorpay();
      openRazorpay({
        key: co.key_id,
        amount: co.amount_paise,
        currency: co.currency,
        order_id: co.provider_order_id,
        name: restaurantName,
        description: title,
        theme: { color: "#ff6a1a" },
        handler: async (resp) => {
          try {
            await api.verifyRazorpay({
              provider_order_id: co.provider_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            onPaid();
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const numField = (v: number, set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    set(Number.isFinite(n) && n >= 0 ? n : 0);
  };

  return (
    <Modal open onClose={onClose} title={title}>
      {subtitle && <p className="text-sm text-ink-soft mb-3">{subtitle}</p>}
      {err && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 mb-3">{err}</div>}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Tip</span>
            <Input type="number" min={0} value={String(tip)} onChange={numField(tip, setTip)} className="w-full mt-1" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Discount</span>
            <Input type="number" min={0} value={String(discount)} onChange={numField(discount, setDiscount)} className="w-full mt-1" />
          </label>
        </div>
        {discount > 0 && (
          <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Reason for discount (optional)" className="w-full" />
        )}

        <div className="flex items-center justify-between border-t border-line pt-3 mt-1">
          <span className="text-sm text-ink-soft">Amount due</span>
          <span className="font-headline font-bold text-2xl text-ink tabular-nums">
            {amount == null ? "…" : formatPrice(amount)}
          </span>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          {online && (
            <Button variant="primary" icon="qr_code_2" onClick={payOnline} disabled={busy || amount == null}>
              {busy ? "Opening…" : "Pay online (UPI / card)"}
            </Button>
          )}
          {allowCash && token && (
            <Button variant="secondary" icon="payments" onClick={payCash} disabled={busy || amount == null}>
              Mark cash paid
            </Button>
          )}
          {!online && !allowCash && (
            <p className="text-xs text-ink-faint text-center">Online payment isn&rsquo;t set up yet — please pay at the counter.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
