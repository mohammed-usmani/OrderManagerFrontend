"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type ChargeRuleAPI } from "@/lib/api";
import { formatPrice } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Input, Select } from "@/components/admin/ui";

const APPLIES_TO: ChargeRuleAPI["applies_to"][] = ["all", "dine_in", "parcel"];
const APPLIES_LABEL: Record<string, string> = {
  all: "All orders",
  dine_in: "Dine-in only",
  parcel: "Parcel only",
};

// Mirror of the backend billing rule, for the live preview.
function previewBill(
  charges: ChargeRuleAPI[],
  subtotal: number,
  orderType: "dine_in" | "parcel",
  isAc: boolean,
) {
  const applied = charges.filter((c) => {
    if (c.applies_to !== "all" && c.applies_to !== orderType) return false;
    if (c.ac_only && !isAc) return false;
    return true;
  });
  const lines = applied.map((c) => ({ label: c.label, amount: subtotal * c.rate }));
  const total = subtotal + lines.reduce((s, l) => s + l.amount, 0);
  return { lines, total };
}

export default function AdminPricingPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [charges, setCharges] = useState<ChargeRuleAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

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
      const res = await api.adminGetChargePolicy(token);
      setCharges(res.charges);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (i: number, patch: Partial<ChargeRuleAPI>) =>
    setCharges((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const removeRow = (i: number) =>
    setCharges((prev) => prev.filter((_, idx) => idx !== i));

  const addRow = () =>
    setCharges((prev) => [
      ...prev,
      { key: `charge_${prev.length + 1}`, label: "New charge", rate: 0.05, applies_to: "all", ac_only: false },
    ]);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const res = await api.adminUpdateChargePolicy(token, charges);
      setCharges(res.charges);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const acPreview = useMemo(() => previewBill(charges, 1000, "dine_in", true), [charges]);
  const nonAcPreview = useMemo(() => previewBill(charges, 1000, "dine_in", false), [charges]);
  const parcelPreview = useMemo(() => previewBill(charges, 1000, "parcel", false), [charges]);

  if (!isAuthenticated || !user?.is_admin) return null;

  return (
    <AppShell title="Pricing">
      <AdminShell>
        <PageHeader
          title="Pricing & charges"
          subtitle="Service, GST, AC surcharge and packaging — applied on top of menu prices"
          actions={
            <Button variant="primary" icon="save" onClick={save} disabled={saving || loading}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          }
        />

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-28 md:pb-8 max-w-[1200px] mx-auto w-full">
          <p className="mb-3 text-xs text-ink-soft">
            Each charge is a percentage of the order subtotal. The{" "}
            <span className="font-medium text-ink">AC charge</span> should be set to
            <span className="font-medium text-ink"> dine-in only</span> with{" "}
            <span className="font-medium text-ink">AC only</span> ticked, so it applies
            only to tables seated in an air-conditioned zone.
          </p>

          {error && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          {savedAt && !error && (
            <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Charge policy saved. New orders bill with these rates immediately.
            </div>
          )}

          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-line-strong border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid lg:grid-cols-[1fr_320px] gap-4">
              {/* Editable charges */}
              <Card className="overflow-hidden h-fit">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-paper-sunken/50 border-b border-line">
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                        <th className="px-3 py-2">Label</th>
                        <th className="px-3 py-2 w-24">Rate %</th>
                        <th className="px-3 py-2 w-40">Applies to</th>
                        <th className="px-3 py-2 w-20 text-center">AC only</th>
                        <th className="px-3 py-2 w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {charges.map((c, i) => (
                        <tr key={i} className="border-b border-line">
                          <td className="px-3 py-2">
                            <Input
                              value={c.label}
                              onChange={(e) => update(i, { label: e.target.value })}
                              className="w-full"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              max={99}
                              step={0.5}
                              value={(c.rate * 100).toString()}
                              onChange={(e) =>
                                update(i, { rate: Math.max(0, Number(e.target.value) / 100) })
                              }
                              className="w-20 tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={c.applies_to}
                              onChange={(e) =>
                                update(i, { applies_to: e.target.value as ChargeRuleAPI["applies_to"] })
                              }
                              className="w-full"
                            >
                              {APPLIES_TO.map((a) => (
                                <option key={a} value={a}>
                                  {APPLIES_LABEL[a]}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={c.ac_only}
                              onChange={(e) => update(i, { ac_only: e.target.checked })}
                              disabled={c.applies_to !== "dine_in"}
                              className="cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => removeRow(i)}>
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-2 border-t border-line">
                  <Button size="sm" variant="secondary" icon="add" onClick={addRow}>
                    Add charge
                  </Button>
                </div>
              </Card>

              {/* Live preview on a ₹1,000 subtotal */}
              <Card className="p-4 h-fit">
                <h3 className="font-headline font-semibold text-ink text-sm mb-3">
                  Live preview · {formatPrice(1000)} subtotal
                </h3>
                <PreviewBlock title="Dine-in (AC zone)" bill={acPreview} />
                <PreviewBlock title="Dine-in (non-AC)" bill={nonAcPreview} />
                <PreviewBlock title="Parcel" bill={parcelPreview} />
              </Card>
            </div>
          )}
        </main>
      </AdminShell>
    </AppShell>
  );
}

function PreviewBlock({
  title,
  bill,
}: {
  title: string;
  bill: { lines: { label: string; amount: number }[]; total: number };
}) {
  return (
    <div className="mb-3 pb-3 border-b border-line last:border-0 last:mb-0 last:pb-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft mb-1">
        {title}
      </p>
      {bill.lines.map((l) => (
        <div key={l.label} className="flex justify-between text-xs text-ink-soft">
          <span>{l.label}</span>
          <span className="tabular-nums">{formatPrice(l.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between text-sm font-semibold text-ink pt-1 mt-1 border-t border-line">
        <span>Total</span>
        <span className="tabular-nums">{formatPrice(bill.total)}</span>
      </div>
    </div>
  );
}
