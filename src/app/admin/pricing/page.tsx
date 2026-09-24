"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ChargeRuleAPI } from "@/lib/api";
import { formatPrice } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Input, Select, EmptyState } from "@/components/admin/ui";

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

  const [charges, setCharges] = useState<ChargeRuleAPI[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<ChargeRuleAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.adminGetChargePolicy();
      setCharges(res.charges);
      setSavedSnapshot(res.charges);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

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
      // Use a timestamp+random suffix to guarantee uniqueness even after deletes.
      { key: `charge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: "New charge", rate: 0.05, applies_to: "all", ac_only: false },
    ]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api.adminUpdateChargePolicy(charges);
      setCharges(res.charges);
      setSavedSnapshot(res.charges);
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

  // Dirty when the working charges diverge from the last saved snapshot.
  const dirty = useMemo(
    () => JSON.stringify(charges) !== JSON.stringify(savedSnapshot),
    [charges, savedSnapshot],
  );

  // Warn before leaving with unsaved edits (covers reload / tab close).
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  return (
    <AppShell title="Pricing">
      <AdminShell>
        <PageHeader
          title="Pricing & charges"
          subtitle="Service, GST, AC surcharge and packaging — applied on top of menu prices"
          actions={
            <div className="flex items-center gap-2">
              {dirty && !saving && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              )}
              <Button variant="primary" icon="save" onClick={save} disabled={saving || loading || !dirty}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
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
            <div className="space-y-2">
              {[1,2,3,4].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
            </div>
          ) : charges.length === 0 ? (
            <EmptyState
              icon="payments"
              title="No charges configured"
              description="Add a service, GST, AC or packaging charge to bill on top of menu prices."
              action={<Button variant="primary" icon="add" onClick={addRow}>Add charge</Button>}
            />
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
                        <tr key={c.key} className="border-b border-line">
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
                              // Round to avoid float artifacts like 5.000000000001
                              value={String(Math.round(c.rate * 1000) / 10)}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                update(i, { rate: Number.isFinite(n) ? Math.max(0, Math.round(n * 10) / 1000) : c.rate });
                              }}
                              className="w-20 tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={c.applies_to}
                              onChange={(e) => {
                                const applies_to = e.target.value as ChargeRuleAPI["applies_to"];
                                // ac_only is only meaningful for dine_in; clear it otherwise.
                                update(i, { applies_to, ...(applies_to !== "dine_in" ? { ac_only: false } : {}) });
                              }}
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
